import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Compass, GraduationCap, LayoutDashboard, LoaderCircle, MapPin, Menu, Plus, Search, ShieldCheck, Ticket, Users, X, RefreshCw, Trash2, Pencil, Radio, Sparkles } from 'lucide-react';
import './styles.css';

const API = (import.meta.env.VITE_API_URL || 'https://campusconnect-l4cm.onrender.com/api').replace(/\/$/, '');
async function call(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}
const idEq = (a, b) => String(a ?? '') === String(b ?? '');
const capacityOf = event => event.capacity == null || event.capacity === '' ? null : (Number.isFinite(Number(event.capacity)) ? Number(event.capacity) : null);
const seatsRemaining = event => {
  const capacity = capacityOf(event);
  return capacity == null ? null : Math.max(0, capacity - Number(event.registration_count || 0));
};
const registrationOpen = event => ['open', 'upcoming'].includes(String(event?.status || 'open').toLowerCase());
const canRegister = event => registrationOpen(event) && (seatsRemaining(event) == null || seatsRemaining(event) > 0);

function App() {
  const [users, setUsers] = useState([]), [events, setEvents] = useState([]), [registrations, setRegistrations] = useState([]);
  const [userId, setUserId] = useState(localStorage.getItem('campus-user') || '');
  const [view, setView] = useState('explore'), [search, setSearch] = useState(''), [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(null), [attendees, setAttendees] = useState([]), [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const currentUser = users.find(user => idEq(user.id, userId));
  const role = currentUser?.role === 'organizer' ? 'organizer' : 'student';

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [people, allEvents] = await Promise.all([call('/users'), call('/events')]);
      setUsers(people); setEvents(allEvents);
      const active = people.find(person => idEq(person.id, userId)) || people[0];
      if (active && !idEq(active.id, userId)) { setUserId(String(active.id)); localStorage.setItem('campus-user', active.id); }
      if (active) {
        const mine = await call(`/me/registrations?user_id=${encodeURIComponent(active.id)}`);
        setRegistrations(mine);
      } else { setRegistrations([]); setUserId(''); }
      setError('');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  // Keep separate browser sessions and open dashboards in sync with Supabase-backed changes.
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(true); }, 5000);
    const focus = () => refresh(true);
    window.addEventListener('focus', focus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [userId]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 3200); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { localStorage.setItem('campus-user', userId); }, [userId]);

  const registeredIds = new Set(registrations.map(reg => String(reg.event_id)));
  const mine = events.filter(event => idEq(event.organizer_id, userId));
  const filtered = useMemo(() => events.filter(event => {
    const text = `${event.title || ''} ${event.status || ''}`.toLowerCase();
    const matchesText = text.includes(search.toLowerCase().trim());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'open' ? registrationOpen(event) : !registrationOpen(event));
    return matchesText && matchesStatus && String(event.status || '').toLowerCase() !== 'deleted';
  }), [events, search, statusFilter]);
  const myEvents = events.filter(event => registeredIds.has(String(event.id)));
  const mainEvents = view === 'registrations' ? myEvents : view === 'manage' ? mine : filtered;

  async function registerFor(event) {
    if (!currentUser) return setError('Choose a student profile before registering.');
    setWorking(true); setError('');
    try { await call('/registrations', { method: 'POST', body: JSON.stringify({ user_id: currentUser.id, event_id: event.id }) }); setNotice('Your registration is confirmed.'); await refresh(true); }
    catch (err) { setError(err.message); }
    finally { setWorking(false); }
  }
  async function cancelRegistration(event) {
    const registration = registrations.find(item => idEq(item.event_id, event.id));
    if (!registration) return;
    setWorking(true); setError('');
    try { await call(`/registrations/${registration.id}?user_id=${encodeURIComponent(currentUser.id)}`, { method: 'DELETE' }); setNotice('Registration cancelled.'); await refresh(true); }
    catch (err) { setError(err.message); }
    finally { setWorking(false); }
  }
  async function saveEvent(fields) {
    setWorking(true); setError('');
    try {
      if (editor?.id) await call(`/events/${editor.id}`, { method: 'PATCH', body: JSON.stringify({ ...fields, organizer_id: currentUser.id }) });
      else await call('/events', { method: 'POST', body: JSON.stringify({ ...fields, organizer_id: currentUser.id }) });
      setEditor(null); setNotice(editor?.id ? 'Event updated.' : 'Event published.'); await refresh(true);
    } catch (err) { setError(err.message); }
    finally { setWorking(false); }
  }
  async function deleteEvent(event) {
    if (!window.confirm(`Delete “${event.title}”? This may also remove its registrations.`)) return;
    setWorking(true); setError('');
    try { await call(`/events/${event.id}?organizer_id=${encodeURIComponent(currentUser.id)}`, { method: 'DELETE' }); setNotice('Event deleted.'); await refresh(true); }
    catch (err) { setError(err.message); }
    finally { setWorking(false); }
  }
  async function openDetails(event) {
    setSelected(event); setAttendees([]);
    if (role === 'organizer' && idEq(event.organizer_id, userId)) {
      try { setAttendees(await call(`/events/${event.id}/registrations?organizer_id=${encodeURIComponent(userId)}`)); } catch (err) { setError(err.message); }
    }
  }

  const navItems = role === 'organizer' ? [
    ['explore', 'Explore events', Compass], ['manage', 'Your events', LayoutDashboard]
  ] : [['explore', 'Explore events', Compass], ['registrations', 'My registrations', Ticket]];

  return <div className="app-shell">
    <div className="announcement"><span className="live-dot"/> Campus Connect · Campus events, all in one place <span className="announcement-right"><Radio size={14}/> Live updates enabled</span></div>
    <header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); setView('explore'); }}><span className="brand-mark"><Sparkles size={19}/></span><span>campus<span className="brand-accent">connect</span><small>YOUR CAMPUS, IN MOTION</small></span></a>
      <nav className="main-nav">{navItems.map(([key, label, Icon]) => <button key={key} className={`nav-link ${view === key ? 'active' : ''}`} onClick={() => setView(key)}><Icon size={17}/>{label}{key === 'registrations' && registrations.length > 0 && <span className="nav-count">{registrations.length}</span>}</button>)}</nav>
      <div className="header-actions"><span className="sync-state"><span/>Synced</span><div className="profile-select"><span className="avatar">{(currentUser?.email || '?')[0].toUpperCase()}</span><select aria-label="Switch user profile" value={userId} onChange={e => { setUserId(e.target.value); setView('explore'); }}><option value="" disabled>Select profile</option>{users.map(user => <option value={user.id} key={user.id}>{user.email} · {user.role}</option>)}</select><ChevronDown size={14}/></div><div className="role-chip">{role === 'organizer' ? <ShieldCheck size={14}/> : <GraduationCap size={15}/>} {role}</div></div>
    </header>
    <main className="page-content">
      {error && <div className="alert error-alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button></div>}
      {notice && <div className="alert success-alert"><Check size={16}/>{notice}</div>}
      {!currentUser && !loading && <div className="setup-card"><div className="setup-icon"><Users/></div><h2>No campus profiles found</h2><p>There are no records in the existing <code>users</code> table. Add a student or organizer profile there, then refresh this page. This app does not create accounts or use sample profiles.</p><button className="button primary" onClick={() => refresh()}><RefreshCw size={16}/> Refresh profiles</button></div>}
      {currentUser && <>
        <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot"/> THE CAMPUS EVENT NETWORK</div><h1>{view === 'manage' ? 'Make something happen.' : view === 'registrations' ? 'Your next great experience.' : <>Find your <em>next thing.</em></>}</h1><p>{view === 'manage' ? 'Create and manage events for your campus community.' : view === 'registrations' ? 'All the events you have a spot saved for.' : 'Discover what’s happening around campus and save your spot.'}</p></div><div className="welcome-art"><div className="art-circle circle-one"/><div className="art-circle circle-two"/><CalendarDays size={36}/><span className="art-star">✳</span></div></section>
        {view !== 'manage' && <section className="search-panel"><div className="search-box"><Search size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events by name or status…"/><kbd>Ctrl K</kbd></div><div className="filter-group">{['all', 'open', 'closed'].map(option => <button key={option} className={`filter-pill ${statusFilter === option ? 'selected' : ''}`} onClick={() => setStatusFilter(option)}>{option === 'all' ? 'All events' : option[0].toUpperCase() + option.slice(1)}</button>)}</div></section>}
        <section className="section-heading"><div><div className="section-kicker">{view === 'manage' ? 'ORGANIZER STUDIO' : view === 'registrations' ? 'YOUR SCHEDULE' : 'CURATED FOR CAMPUS'}</div><h2>{view === 'manage' ? 'Your events' : view === 'registrations' ? 'My registrations' : 'Happening on campus'} <span className="result-count">{mainEvents.length}</span></h2></div><div className="heading-actions"><span className="updated"><span/>Live data</span>{view === 'manage' && <button className="button primary" onClick={() => setEditor({ title: '', capacity: '', status: 'open' })}><Plus size={17}/> Create event</button>}</div></section>
        {loading ? <div className="loading-state"><LoaderCircle className="spin"/> Loading campus events…</div> : mainEvents.length === 0 ? <div className="empty-state"><div className="empty-icon">{view === 'registrations' ? <Ticket/> : <CalendarDays/>}</div><h3>{view === 'manage' ? 'Your event calendar is open' : view === 'registrations' ? 'Nothing on your schedule yet' : 'No events found'}</h3><p>{view === 'manage' ? 'Publish your first event and bring your campus together.' : view === 'registrations' ? 'Explore the listings and register for something that sparks your interest.' : 'Try another search or check back when new events are published.'}</p>{view === 'manage' ? <button className="button primary" onClick={() => setEditor({ title: '', capacity: '', status: 'open' })}><Plus size={16}/> Create your first event</button> : view === 'registrations' && <button className="button secondary" onClick={() => setView('explore')}>Explore events <ArrowRight size={16}/></button>}</div> : <div className="event-grid">{mainEvents.map((event, index) => <EventCard key={event.id} event={event} index={index} registered={registeredIds.has(String(event.id))} owner={idEq(event.organizer_id, userId)} role={role} onOpen={() => openDetails(event)} onRegister={() => registerFor(event)} onCancel={() => cancelRegistration(event)} onEdit={() => setEditor(event)} onDelete={() => deleteEvent(event)} busy={working}/>)}</div>}
      </>}
      <footer className="footer"><span>© Campus Connect</span><span>Made for the people who make campus happen.</span><button onClick={() => refresh(true)} aria-label="Refresh data"><RefreshCw size={14}/> Refresh</button></footer>
    </main>
    {selected && <DetailsModal event={selected} role={role} owner={idEq(selected.organizer_id, userId)} registered={registeredIds.has(String(selected.id))} attendees={attendees} busy={working} onClose={() => setSelected(null)} onRegister={() => registerFor(selected)} onCancel={() => cancelRegistration(selected)}/>}
    {editor && <EventEditor event={editor} busy={working} onClose={() => setEditor(null)} onSave={saveEvent}/>}
  </div>;
}

function EventCard({ event, index, registered, owner, role, onOpen, onRegister, onCancel, onEdit, onDelete, busy }) {
  const capacity = capacityOf(event);
  const count = Number(event.registration_count || 0);
  const remaining = seatsRemaining(event);
  const status = String(event.status || 'open').toLowerCase();
  const acceptingRegistrations = canRegister(event);
  const full = remaining === 0;
  return <article className="event-card" style={{ '--card-index': index }}>
    <button className={`card-art art-${index % 4}`} onClick={onOpen} aria-label={`View ${event.title}`}>
      <span className="art-label">CAMPUS CONNECT · EVENT {String(index + 1).padStart(2, '0')}</span><div className="graphic-lines"/><span className="graphic-glyph">{['✳', '◒', '✣', '◉'][index % 4]}</span>
      <div className="art-bottom"><span>{full ? 'EVENT FULL' : registrationOpen(event) ? 'REGISTRATION OPEN' : status.toUpperCase()}</span><ArrowRight size={17}/></div>
    </button>
    <div className="event-body">
      <div className="event-tags"><span className={`status-badge ${acceptingRegistrations ? 'open' : 'closed'}`}><span/>{full ? 'full' : status}</span><span className="event-capacity">{capacity === null ? 'Unlimited seats' : `${capacity} seats`}</span></div>
      <button className="event-title" onClick={onOpen}>{event.title}</button>
      <div className="event-meta"><span><CalendarDays size={15}/> Date not provided</span><span><MapPin size={15}/> Location not provided</span></div>
      <div className="event-bottom">
        <div className="attendee-stack"><span className="attendee-text"><Users size={14}/> {count} registered{remaining == null ? '' : ` · ${remaining} seats left`}</span></div>
        {owner && role === 'organizer' ? <div className="owner-actions"><button onClick={onOpen} className="button secondary attendees-cta"><Users size={14}/> View list</button><button onClick={onEdit} className="icon-button" title="Edit event"><Pencil size={16}/></button><button onClick={onDelete} className="icon-button danger-icon" title="Delete event"><Trash2 size={16}/></button></div> : registered ? <button className="button registered-button" onClick={onCancel} disabled={busy}><Check size={15}/> Registered</button> : <button className="button card-cta" onClick={onRegister} disabled={busy || !acceptingRegistrations}>{full ? 'Full' : acceptingRegistrations ? <>Register <ArrowRight size={15}/></> : 'Closed'}</button>}
      </div>
    </div>
  </article>;
}
function DetailsModal({ event, role, owner, registered, attendees, busy, onClose, onRegister, onCancel }) {
  const capacity = capacityOf(event);
    return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="modal detail-modal"><button className="modal-close" onClick={onClose}><X size={19}/></button><div className="detail-cover"><div className="detail-orb"/><span>EVENT DETAILS</span><CalendarDays size={44}/></div><div className="modal-content"><div className="event-tags"><span className={`status-badge ${canRegister(event) ? 'open' : 'closed'}`}><span/>{event.status || 'open'}</span><span className="event-capacity">{capacity == null ? 'Capacity not set' : `${capacity} seats`}</span></div><h2>{event.title}</h2><p className="detail-copy">Event details are managed by the organizer. Check back for updates from your campus community.</p><div className="detail-facts"><div><CalendarDays/><span><b>Date</b>Not provided</span></div><div><MapPin/><span><b>Location</b>Not provided</span></div><div><Users/><span><b>Capacity</b>{capacity == null ? 'Not set' : capacity}</span></div></div>{owner && role === 'organizer' && <div className="attendee-panel"><h3>Attendee list <span>{attendees.length}</span></h3>{attendees.length ? attendees.map((attendee, i) => <div className="attendee-row" key={attendee.id}><span className="avatar small">{(attendee.email || 'S')[0].toUpperCase()}</span><span>{attendee.email || attendee.user_id}</span><span className="attendee-role">{attendee.role || "student"}</span><time>{attendee.created_at ? new Date(attendee.created_at).toLocaleDateString() : ''}</time></div>) : <p>No registrations yet. Your attendee list will update as students register.</p>}</div>}<div className="modal-actions"><button className="button secondary" onClick={onClose}>Close</button>{owner ? <span className="owner-label"><ShieldCheck size={15}/> Your event</span> : registered ? <button className="button secondary" disabled={busy} onClick={onCancel}>Cancel registration</button> : <button className="button primary" disabled={busy || !canRegister(event)} onClick={onRegister}>Register for this event <ArrowRight size={16}/></button>}</div></div></section></div>
}
function EventEditor({ event, busy, onClose, onSave }) {
  const [title, setTitle] = useState(event.title || ''), [capacity, setCapacity] = useState(event.capacity ?? ''), [status, setStatus] = useState(String(event.status || 'open').toLowerCase());
  function submit(e) { e.preventDefault(); onSave({ title: title.trim(), capacity: capacity === '' ? null : Number(capacity), status }); }
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><form className="modal editor-modal" onSubmit={submit}><div className="editor-head"><span className="editor-icon"><CalendarDays/></span><div><div className="section-kicker">ORGANIZER STUDIO</div><h2>{event.id ? 'Edit your event' : 'Create an event'}</h2></div><button type="button" className="modal-close" onClick={onClose}><X size={19}/></button></div><p className="editor-copy">Keep your event details current for everyone on campus.</p><label>Event title<input required maxLength="140" autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Design & Innovation Night"/></label><label>Capacity <span className="optional">optional</span><input type="number" min="1" step="1" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="Leave blank for unlimited"/></label><label>Registration status<select value={status} onChange={e => setStatus(e.target.value)}><option value="open">Open</option><option value="upcoming">Upcoming (registration open)</option><option value="closed">Closed</option></select></label><div className="editor-note"><CircleHelp size={15}/> The current database stores title, capacity, status and organizer. Date, venue and description fields can be added when those columns exist.</div><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {event.id ? 'Save changes' : 'Publish event'}</button></div></form></div>
}



export default App;




