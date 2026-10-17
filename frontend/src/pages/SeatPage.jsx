import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate } from '../api';
import { useAuth } from '../auth.jsx';

const MAX = 6;

export default function SeatPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [sel, setSel] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api(`/shows/${id}`).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [id]);

  const rows = useMemo(() => {
    if (!data) return [];
    const m = {};
    data.seats.forEach((s) => (m[s.row] ||= {})[s.number] = s);
    const cols = Math.max(...data.seats.map((s) => s.number));
    return Object.entries(m).map(([label, seats]) => ({ label, seats, cols }));
  }, [data]);

  if (err && !data) return <p className="error">{err}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const byId = Object.fromEntries(data.seats.map((s) => [s.id, s]));
  const chosen = sel.map((i) => byId[i]).filter((s) => s && s.status === 'AVAILABLE');
  const total = chosen.reduce((a, s) => a + s.price, 0);

  const toggle = (s) => {
    if (s.status !== 'AVAILABLE') return;
    setErr('');
    setSel((cur) => cur.includes(s.id) ? cur.filter((x) => x !== s.id) : cur.length >= MAX ? (setErr(`You can book up to ${MAX} seats`), cur) : [...cur, s.id]);
  };

  const proceed = async () => {
    if (!user) return nav('/login');
    if (user.role !== 'CUSTOMER') return setErr('Only customer accounts can book tickets');
    setBusy(true); setErr('');
    try {
      const order = await api('/orders', { method: 'POST', body: { showId: Number(id), seatIds: chosen.map((s) => s.id) } });
      nav(`/checkout/${order.id}`);
    } catch (e) { setErr(e.message); setSel([]); load(); } finally { setBusy(false); }
  };

  const { show } = data;
  return (
    <>
      <h2>{show.event.title}</h2>
      <p className="muted">{show.screen.venue.name} · {show.screen.name} · {fmtDate(show.startsAt)}</p>
      <div className="screen">SCREEN THIS WAY</div>
      <div className="seatmap">
        {rows.map((r) => (
          <div className="seatrow" key={r.label}>
            <span className="rl">{r.label}</span>
            {Array.from({ length: r.cols }, (_, i) => i + 1).map((n) => {
              const s = r.seats[n];
              if (!s) return <span key={n} className="gap" />;
              const cls = s.status !== 'AVAILABLE' ? 'taken' : sel.includes(s.id) ? 'picked' : s.category === 'PREMIUM' ? 'premium' : '';
              return <button key={n} className={`seat ${cls}`} onClick={() => toggle(s)} title={`${s.row}${s.number} · ${s.category} · ₹${s.price}`}>{n}</button>;
            })}
          </div>
        ))}
      </div>
      <div className="legend">
        <span><i className="seat" /> Available</span><span><i className="seat premium" /> Premium</span>
        <span><i className="seat picked" /> Selected</span><span><i className="seat taken" /> Sold / held</span>
      </div>
      <div className="legend">{show.tiers.map((t) => <span key={t.id}>{t.category}: ₹{t.price}</span>)}</div>
      {err && <p className="error">{err}</p>}
      <div className="bar">
        <span>{chosen.length ? `${chosen.map((s) => s.row + s.number).join(', ')} — ₹${total}` : 'Select seats'}</span>
        <button className="btn" disabled={!chosen.length || busy} onClick={proceed}>{busy ? 'Holding seats…' : 'Continue'}</button>
      </div>
    </>
  );
}
