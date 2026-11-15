import os
from flask import Flask, jsonify, request
from supabase import create_client, Client
from postgrest import APIError
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
if not supabase_url or not supabase_key:
    raise RuntimeError("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in backend/.env")
supabase: Client = create_client(supabase_url, supabase_key)

@app.after_request
def cors(response):
    origin = request.headers.get("Origin")
    configured_origins = ",".join((
        os.environ.get("FRONTEND_ORIGIN", ""),
        os.environ.get("FRONTEND_ORIGINS", ""),
        "https://campusconnect-1vsk.vercel.app",
        "https://campusconnect-u2le.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ))
    allowed_origins = {
        value.strip().rstrip("/")
        for value in configured_origins.split(",")
        if value.strip()
    }
    if origin and origin.rstrip("/") in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    response.headers["Vary"] = "Origin"
    return response

@app.errorhandler(APIError)
def handle_supabase_error(error):
    return jsonify({"error": getattr(error, "message", str(error))}), 400

@app.get('/api/health')
def health():
    return jsonify({"ok": True})

@app.get('/api/users')
def users():
    return jsonify(supabase.table('users').select('*').order('email').execute().data)

@app.get('/api/events')
def events():
    rows = supabase.table('events').select('*').order('id', desc=True).execute().data
    return jsonify(with_registration_counts(rows))

def with_registration_counts(rows):
    if not rows:
        return rows
    event_ids = [row['id'] for row in rows]
    registrations = supabase.table('registrations').select('event_id').in_('event_id', event_ids).execute().data
    counts = {}
    for registration in registrations:
        event_id = registration.get('event_id')
        counts[event_id] = counts.get(event_id, 0) + 1
    return [{**row, 'registration_count': counts.get(row['id'], 0)} for row in rows]

@app.get('/api/events/<event_id>')
def event_detail(event_id):
    result = supabase.table('events').select('*').eq('id', event_id).maybe_single().execute()
    if not result.data:
        return jsonify({"error": "Event not found"}), 404
    return jsonify(with_registration_counts([result.data])[0])

@app.post('/api/events')
def create_event():
    data = request.get_json(silent=True) or {}
    if not data.get('title') or not data.get('organizer_id'):
        return jsonify({"error": "title and organizer_id are required"}), 400
    result = supabase.table('events').insert({
        "title": str(data['title']).strip(),
        "capacity": data.get('capacity'),
        "status": data.get('status', 'open'),
        "organizer_id": data['organizer_id']
    }).execute()
    return jsonify(result.data[0]), 201

@app.patch('/api/events/<event_id>')
def update_event(event_id):
    data = request.get_json(silent=True) or {}
    allowed = {key: data[key] for key in ('title', 'capacity', 'status') if key in data}
    if not allowed:
        return jsonify({"error": "No editable event fields supplied"}), 400
    result = supabase.table('events').update(allowed).eq('id', event_id).eq('organizer_id', data.get('organizer_id', '')).execute()
    if not result.data:
        return jsonify({"error": "Event not found or not owned by this organizer"}), 404
    return jsonify(result.data[0])

@app.delete('/api/events/<event_id>')
def delete_event(event_id):
    organizer_id = request.args.get('organizer_id', '')
    event = supabase.table('events').select('id').eq('id', event_id).eq('organizer_id', organizer_id).maybe_single().execute()
    if not event.data:
        return jsonify({"error": "Event not found or not owned by this organizer"}), 404
    supabase.table('registrations').delete().eq('event_id', event_id).execute()
    supabase.table('events').delete().eq('id', event_id).eq('organizer_id', organizer_id).execute()
    return jsonify({"deleted": True})

@app.post('/api/registrations')
def register():
    data = request.get_json(silent=True) or {}
    if not data.get('user_id') or not data.get('event_id'):
        return jsonify({"error": "user_id and event_id are required"}), 400
    target = supabase.table('events').select('capacity,status').eq('id', data['event_id']).maybe_single().execute()
    if not target.data:
        return jsonify({"error": "Event not found"}), 404
    if str(target.data.get('status', '')).lower() not in ('open', 'upcoming'):
        return jsonify({"error": "Registration is closed for this event"}), 409
    existing = supabase.table('registrations').select('id').eq('user_id', data['user_id']).eq('event_id', data['event_id']).limit(1).execute()
    if existing.data:
        return jsonify({"error": "Already registered", "registration": existing.data[0]}), 409
    capacity = target.data.get('capacity')
    if capacity is not None:
        current = supabase.table('registrations').select('id').eq('event_id', data['event_id']).execute().data
        if len(current) >= int(capacity):
            return jsonify({"error": "This event is full"}), 409
    result = supabase.table('registrations').insert({"user_id": data['user_id'], "event_id": data['event_id']}).execute()
    return jsonify(result.data[0]), 201

@app.delete('/api/registrations/<registration_id>')
def unregister(registration_id):
    user_id = request.args.get('user_id', '')
    result = supabase.table('registrations').delete().eq('id', registration_id).eq('user_id', user_id).execute()
    if not result.data:
        return jsonify({"error": "Registration not found"}), 404
    return jsonify({"deleted": True})

@app.get('/api/me/registrations')
def my_registrations():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    rows = supabase.table('registrations').select('*').eq('user_id', user_id).execute().data
    return jsonify(rows)

@app.get('/api/events/<event_id>/registrations')
def event_registrations(event_id):
    organizer_id = request.args.get('organizer_id', '')
    event = supabase.table('events').select('id').eq('id', event_id).eq('organizer_id', organizer_id).maybe_single().execute()
    if not event.data:
        return jsonify({"error": "Event not found or not owned by this organizer"}), 404
    rows = supabase.table('registrations').select('*').eq('event_id', event_id).execute().data
    user_ids = list({row['user_id'] for row in rows if row.get('user_id')})
    email_by_id = {}
    if user_ids:
        people = supabase.table('users').select('id,email,role').in_('id', user_ids).execute().data
        info_by_id = {person['id']: {'email': person.get('email'), 'role': person.get('role')} for person in people}
    return jsonify([{**row, **info_by_id.get(row['user_id'], {})} for row in rows])

if __name__ == '__main__':
    app.run(debug=True, port=5000)

