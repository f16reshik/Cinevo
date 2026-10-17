import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate } from '../api';

const loadRazorpay = () => new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve();
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = resolve; s.onerror = () => reject(new Error('Could not load Razorpay'));
  document.body.appendChild(s);
});

export default function Checkout() {
  const { id } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState(null);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/orders/${id}`).then(setOrder).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => {
    if (!order) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(order.expiresAt) - Date.now()) / 1000)));
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [order]);

  if (err && !order) return <p className="error">{err}</p>;
  if (!order) return <p className="muted">Loading…</p>;
  if (order.status !== 'PENDING') return <div className="card"><p>This order is {order.status.toLowerCase()}.</p><button className="btn" onClick={() => nav('/bookings')}>My bookings</button></div>;

  const pay = async () => {
    setBusy(true); setErr('');
    try {
      const p = await api(`/orders/${id}/pay`, { method: 'POST' });
      if (p.mode === 'mock') {
        await api('/payments/mock-confirm', { method: 'POST', body: { orderId: order.id } });
        return nav('/bookings');
      }
      await loadRazorpay();
      new window.Razorpay({
        key: p.keyId, amount: p.amount * 100, currency: 'INR', order_id: p.gatewayOrderId, name: 'Cinevo',
        handler: async (r) => {
          try { await api('/payments/verify', { method: 'POST', body: { orderId: order.id, ...r } }); nav('/bookings'); }
          catch (e) { setErr(e.message); }
        },
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  const { show } = order;
  return (
    <div className="card narrow">
      <h2>Checkout</h2>
      <p><strong>{show.event.title}</strong><br /><span className="muted">{show.screen.venue.name} · {show.screen.name} · {fmtDate(show.startsAt)}</span></p>
      <ul className="plain">{order.items.map((i) => <li key={i.id}>Seat {i.showSeat.row}{i.showSeat.number} <span>₹{i.price}</span></li>)}</ul>
      <p className="total">Total <span>₹{order.totalAmount}</span></p>
      {left > 0 ? <p className="muted">Seats held for {mm}:{ss}</p> : <p className="error">Hold expired. Go back and choose seats again.</p>}
      {err && <p className="error">{err}</p>}
      <button className="btn" disabled={busy || left === 0} onClick={pay}>{busy ? 'Processing…' : `Pay ₹${order.totalAmount}`}</button>
      <button className="link" onClick={async () => { await api(`/orders/${id}/cancel`, { method: 'POST' }).catch(() => {}); nav(`/shows/${order.showId}`); }}>Cancel</button>
    </div>
  );
}
