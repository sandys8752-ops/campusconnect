# Campus Connect frontend

React + Vite frontend for the existing Flask/Supabase project.

## Run locally

1. Keep `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `backend/.env` (the app already reads these values).
2. Start Flask from the backend folder so `load_dotenv()` reads that file:

   ```powershell
   cd backend
   .\venv\Scripts\Activate.ps1
   python app.py
   ```

3. In another terminal, install and start the frontend:

   ```powershell
   cd frontend
   Copy-Item .env.example .env
   npm install
   npm run dev
   ```

   Open the Vite URL printed in the terminal. Set `VITE_API_URL` in `frontend/.env` if Flask is not at `http://localhost:5000/api`.

## Data and behavior

- The profile menu switches between rows already present in `users`; no account is created and there is no authentication flow.
- Students can browse, register, view and cancel their registrations. Organizers can create, edit, close/reopen and delete their events, and view attendee emails.
- Events use the existing `organizer_id`, `title`, `capacity` and `status` fields. The current schema does not show date, venue or description fields, so the UI does not save invented values.
- The UI refreshes from the Flask API every five seconds and when the browser tab regains focus. All writes go to the existing Supabase tables through Flask.
- The Supabase publishable key remains server-side in Flask. Existing Supabase Data API grants and RLS policies must permit the app's operations; this project does not alter database policies.
