import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api';

export default function Bookings() {
  const [orders, setOrders] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => api('/orders').then(setOrders).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const cancel = async (o) => {
    if (!confirm(`Cancel this booking and refund ₹${o.totalAmount}?`)) return;
    try { await api(`/orders/${o.id}/cancel`, { method: 'POST' }); setMsg('Booking cancelled. Refund initiated.'); load(); }
    catch (e) { setMsg(e.message); }
  };

  if (!orders) return <p className="muted">{msg || 'Loading…'}</p>;
  return (
    <>
      <h2>My bookings</h2>
      {msg && <p className="notice">{msg}</p>}
      {orders.length === 0 && <p className="muted">No bookings yet.</p>}
      {orders.map((o) => (
        <div className="card" key={o.id}>
          <div className="row">
            <div>
              <strong>{o.show.event.title}</strong>
              <div className="muted">{o.show.screen.venue.name} · {o.show.screen.name} · {fmtDate(o.show.startsAt)}</div>
              <div>Seats: {o.items.map((i) => i.showSeat.row + i.showSeat.number).join(', ')} · ₹{o.totalAmount}</div>
            </div>
            <span className={`badge ${o.status}`}>{o.status}</span>
          </div>
          {o.status === 'CONFIRMED' && (
            <>
              <div className="tickets">
                {o.tickets.map((t) => (
                  <div className={`ticket ${t.status !== 'VALID' ? 'dim' : ''}`} key={t.id}>
                    <img src={t.qr} alt="QR" />
                    <b>{t.showSeat.row}{t.showSeat.number}</b>
                    <small>{t.status}</small>
                  </div>
                ))}
              </div>
              {new Date(o.show.startsAt) - Date.now() > 2 * 36e5 && <button className="btn ghost" onClick={() => cancel(o)}>Cancel &amp; refund</button>}
            </>
          )}
        </div>
      ))}
    </>
  );
}
