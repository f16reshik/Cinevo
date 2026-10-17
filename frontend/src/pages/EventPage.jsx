import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate } from '../api';

export default function EventPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const cityId = localStorage.getItem('cityId');
    api(`/events/${id}` + (cityId ? `?cityId=${cityId}` : '')).then(setData).catch((e) => setErr(e.message));
  }, [id]);
  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { event, shows } = data;
  const byVenue = shows.reduce((m, s) => ((m[s.screen.venue.id] ||= { venue: s.screen.venue, shows: [] }).shows.push(s), m), {});
  return (
    <>
      <div className="card hero">
        {event.posterUrl && <img src={event.posterUrl} alt="" />}
        <div>
          <h1>{event.title}</h1>
          <p className="muted">{event.genre} · {event.language} · {event.rating} · {event.durationMin} min</p>
          <p>{event.description}</p>
        </div>
      </div>
      <h2>Showtimes</h2>
      {Object.values(byVenue).length === 0 && <p className="muted">No upcoming shows{localStorage.getItem('cityId') ? ' in your city' : ''}.</p>}
      {Object.values(byVenue).map(({ venue, shows }) => (
        <div className="card" key={venue.id}>
          <strong>{venue.name}</strong> <span className="muted">· {venue.address}, {venue.city.name}</span>
          <div className="chips">
            {shows.map((s) => (
              <Link key={s.id} to={`/shows/${s.id}`} className={`chip ${s.available === 0 ? 'off' : ''}`}>
                {fmtDate(s.startsAt)}
                <small>{s.available === 0 ? 'Sold out' : `from ₹${Math.min(...s.tiers.map((t) => t.price))} · ${s.available} left`}</small>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
