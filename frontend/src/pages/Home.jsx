import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const GENRES = ['', 'Action', 'Comedy', 'Drama', 'Thriller', 'Music', 'Sci-Fi', 'General'];
const LANGS = ['', 'English', 'Hindi', 'Tamil', 'Telugu'];

export default function Home() {
  const [cities, setCities] = useState([]);
  const [cityId, setCityId] = useState(localStorage.getItem('cityId') || '');
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('');
  const [language, setLanguage] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api('/cities').then(setCities).catch(() => {}); }, []);
  useEffect(() => {
    localStorage.setItem('cityId', cityId);
    const p = new URLSearchParams();
    if (cityId) p.set('cityId', cityId);
    if (q) p.set('q', q);
    if (genre) p.set('genre', genre);
    if (language) p.set('language', language);
    setLoading(true);
    const t = setTimeout(() => api('/events?' + p).then(setEvents).catch(() => setEvents([])).finally(() => setLoading(false)), 250);
    return () => clearTimeout(t);
  }, [cityId, q, genre, language]);

  return (
    <>
      <div className="filters">
        <select value={cityId} onChange={(e) => setCityId(e.target.value)}>
          <option value="">All cities</option>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder="Search movies & events…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={genre} onChange={(e) => setGenre(e.target.value)}>{GENRES.map((g) => <option key={g} value={g}>{g || 'Any genre'}</option>)}</select>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGS.map((g) => <option key={g} value={g}>{g || 'Any language'}</option>)}</select>
      </div>
      {loading ? <p className="muted">Loading…</p> : events.length === 0 ? <p className="muted">Nothing showing with these filters.</p> : (
        <div className="grid">
          {events.map((e) => (
            <Link key={e.id} to={`/events/${e.id}`} className="poster">
              {e.posterUrl ? <img src={e.posterUrl} alt={e.title} /> : <div className="ph">{e.title[0]}</div>}
              <strong>{e.title}</strong>
              <span className="muted">{e.genre} · {e.language} · {e.rating}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
