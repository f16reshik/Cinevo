import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api';

const DEFAULT_LAYOUT = JSON.stringify({
  rows: [
    { label: 'A', category: 'PREMIUM', cols: 12, gaps: [6] },
    { label: 'B', category: 'PREMIUM', cols: 12, gaps: [6] },
    { label: 'C', category: 'REGULAR', cols: 12, gaps: [6] },
    { label: 'D', category: 'REGULAR', cols: 12, gaps: [6] },
  ],
}, null, 2);

function useNotice() {
  const [n, setN] = useState(null);
  return [n, (text, bad) => setN({ text, bad }), n && <p className={bad(n)}>{n.text}</p>];
  function bad(x) { return x.bad ? 'error' : 'notice'; }
}

export default function Staff() {
  const [tab, setTab] = useState('venues');
  return (
    <>
      <h2>Staff panel</h2>
      <div className="tabs">
        {['venues', 'events', 'shows', 'validate'].map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'venues' && <Venues />}
      {tab === 'events' && <Events />}
      {tab === 'shows' && <Shows />}
      {tab === 'validate' && <Validate />}
    </>
  );
}

function Venues() {
  const [venues, setVenues] = useState([]);
  const [cities, setCities] = useState([]);
  const [v, setV] = useState({ name: '', address: '', cityId: '' });
  const [s, setS] = useState({ venueId: '', name: '', layout: DEFAULT_LAYOUT });
  const [, note, el] = useNotice();
  const load = () => api('/staff/venues').then(setVenues);
  useEffect(() => { load(); api('/cities').then(setCities); }, []);

  const addVenue = async (e) => {
    e.preventDefault();
    try { await api('/staff/venues', { method: 'POST', body: { ...v, cityId: Number(v.cityId) } }); setV({ name: '', address: '', cityId: '' }); note('Venue added'); load(); }
    catch (e) { note(e.message, true); }
  };
  const addScreen = async (e) => {
    e.preventDefault();
    try {
      await api('/staff/screens', { method: 'POST', body: { venueId: Number(s.venueId), name: s.name, layout: JSON.parse(s.layout) } });
      note('Screen added'); load();
    } catch (e) { note(e instanceof SyntaxError ? 'Layout is not valid JSON' : e.message, true); }
  };

  return (
    <>
      {el}
      <div className="two">
        <form className="card" onSubmit={addVenue}>
          <h3>New venue</h3>
          <input placeholder="Venue name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
          <input placeholder="Address" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} required />
          <select value={v.cityId} onChange={(e) => setV({ ...v, cityId: e.target.value })} required>
            <option value="">City…</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn">Add venue</button>
        </form>
        <form className="card" onSubmit={addScreen}>
          <h3>New screen / hall</h3>
          <select value={s.venueId} onChange={(e) => setS({ ...s, venueId: e.target.value })} required>
            <option value="">Venue…</option>{venues.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <input placeholder="Screen name" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} required />
          <textarea rows={9} value={s.layout} onChange={(e) => setS({ ...s, layout: e.target.value })} />
          <small className="muted">Each row: label, category, cols, gaps (aisle column numbers).</small>
          <button className="btn">Add screen</button>
        </form>
      </div>
      {venues.map((x) => (
        <div className="card" key={x.id}><strong>{x.name}</strong> <span className="muted">· {x.city.name} · {x.screens.map((sc) => sc.name).join(', ') || 'no screens yet'}</span></div>
      ))}
    </>
  );
}

function Events() {
  const blank = { title: '', description: '', type: 'MOVIE', durationMin: 120, language: 'English', genre: 'Drama', rating: 'UA', posterUrl: '', draft: false };
  const [f, setF] = useState(blank);
  const [list, setList] = useState([]);
  const [, note, el] = useNotice();
  const load = () => api('/staff/events').then(setList);
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/staff/events', { method: 'POST', body: { ...f, durationMin: Number(f.durationMin) } }); setF(blank); note(f.draft ? 'Saved as draft' : 'Submitted for admin approval'); load(); }
    catch (e) { note(e.message, true); }
  };
  return (
    <>
      {el}
      <form className="card" onSubmit={submit}>
        <h3>Create event / movie</h3>
        <input placeholder="Title" value={f.title} onChange={set('title')} required />
        <textarea placeholder="Description" rows={3} value={f.description} onChange={set('description')} />
        <div className="two">
          <select value={f.type} onChange={set('type')}><option>MOVIE</option><option>EVENT</option></select>
          <input type="number" placeholder="Duration (min)" value={f.durationMin} onChange={set('durationMin')} />
          <input placeholder="Language" value={f.language} onChange={set('language')} />
          <input placeholder="Genre" value={f.genre} onChange={set('genre')} />
          <input placeholder="Rating (U, UA, A)" value={f.rating} onChange={set('rating')} />
          <input placeholder="Poster image URL" value={f.posterUrl} onChange={set('posterUrl')} />
        </div>
        <label className="check"><input type="checkbox" checked={f.draft} onChange={set('draft')} /> Save as draft</label>
        <button className="btn">Create</button>
      </form>
      {list.map((e) => (
        <div className="card row" key={e.id}>
          <span><strong>{e.title}</strong> <span className="muted">· {e.genre} · {e.language}</span></span>
          <span>
            <span className={`badge ${e.status}`}>{e.status.replace('_', ' ')}</span>
            {e.status === 'DRAFT' && <button className="link" onClick={async () => { await api(`/staff/events/${e.id}/submit`, { method: 'POST' }); load(); }}>Submit</button>}
          </span>
        </div>
      ))}
    </>
  );
}

function Shows() {
  const [shows, setShows] = useState([]);
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [f, setF] = useState({ eventId: '', screenId: '', startsAt: '', PREMIUM: 350, REGULAR: 200 });
  const [stats, setStats] = useState({});
  const [, note, el] = useNotice();
  const load = () => api('/staff/shows').then(setShows);
  useEffect(() => { load(); api('/staff/events').then(setEvents); api('/staff/venues').then(setVenues); }, []);
  const screens = venues.flatMap((v) => v.screens.map((s) => ({ ...s, label: `${v.name} / ${s.name}`, cats: [...new Set(s.layout.layout.rows.map((r) => r.category.toUpperCase()))] })));
  const screen = screens.find((s) => s.id === Number(f.screenId));

  const submit = async (e) => {
    e.preventDefault();
    try {
      const tiers = Object.fromEntries((screen?.cats || []).map((c) => [c, Number(f[c] ?? 0)]));
      await api('/staff/shows', { method: 'POST', body: { eventId: Number(f.eventId), screenId: Number(f.screenId), startsAt: new Date(f.startsAt).toISOString(), tiers } });
      note('Show created'); load();
    } catch (e) { note(e.message, true); }
  };
  const loadStats = async (id) => setStats({ ...stats, [id]: await api(`/staff/shows/${id}/stats`) });

  return (
    <>
      {el}
      <form className="card" onSubmit={submit}>
        <h3>Schedule a show</h3>
        <select value={f.eventId} onChange={(e) => setF({ ...f, eventId: e.target.value })} required>
          <option value="">Event…</option>{events.map((x) => <option key={x.id} value={x.id}>{x.title} ({x.status})</option>)}
        </select>
        <select value={f.screenId} onChange={(e) => setF({ ...f, screenId: e.target.value })} required>
          <option value="">Screen…</option>{screens.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} required />
        {(screen?.cats || []).map((c) => (
          <label key={c} className="check">{c} price ₹<input type="number" min="0" value={f[c] ?? 0} onChange={(e) => setF({ ...f, [c]: e.target.value })} /></label>
        ))}
        <button className="btn">Create show</button>
      </form>
      {shows.map((s) => (
        <div className="card" key={s.id}>
          <div className="row">
            <span><strong>{s.event.title}</strong> <span className="muted">· {s.screen.venue.name} / {s.screen.name} · {fmtDate(s.startsAt)}</span></span>
            <button className="link" onClick={() => loadStats(s.id)}>Sales</button>
          </div>
          {stats[s.id] && (
            <p className="muted">
              Booked {stats[s.id].booked}/{stats[s.id].total} · Held {stats[s.id].locked} · Revenue ₹{stats[s.id].revenue} · Checked in {stats[s.id].checkedIn}
            </p>
          )}
        </div>
      ))}
    </>
  );
}

function Validate() {
  const [code, setCode] = useState('');
  const [res, setRes] = useState(null);
  const check = async (e) => {
    e.preventDefault();
    try { setRes({ ok: true, ...(await api('/staff/validate', { method: 'POST', body: { code: code.trim() } })) }); }
    catch (e) { setRes({ ok: false, error: e.message }); }
    setCode('');
  };
  return (
    <form className="card narrow" onSubmit={check}>
      <h3>Validate ticket</h3>
      <p className="muted">Paste or scan (USB / phone scanners type the code) the ticket code, then press Enter.</p>
      <input autoFocus placeholder="Ticket code" value={code} onChange={(e) => setCode(e.target.value)} />
      <button className="btn">Check in</button>
      {res && (res.ok
        ? <p className="notice">✓ Valid — {res.event}, seat {res.seat}, {res.screen}</p>
        : <p className="error">✗ {res.error}</p>)}
    </form>
  );
}
