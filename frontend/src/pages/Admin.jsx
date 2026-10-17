import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Admin() {
  const [tab, setTab] = useState('approvals');
  return (
    <>
      <h2>Admin panel</h2>
      <div className="tabs">
        {['approvals', 'users', 'stats', 'refunds', 'cities', 'audit'].map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'approvals' && <Approvals />}
      {tab === 'users' && <Users />}
      {tab === 'stats' && <Stats />}
      {tab === 'refunds' && <Refunds />}
      {tab === 'cities' && <Cities />}
      {tab === 'audit' && <Audit />}
    </>
  );
}

function Approvals() {
  const [staff, setStaff] = useState([]);
  const [events, setEvents] = useState([]);
  const [all, setAll] = useState([]);
  const load = () => {
    api('/admin/users?role=STAFF&status=PENDING').then(setStaff);
    api('/admin/events?status=PENDING_APPROVAL').then(setEvents);
    api('/admin/events?status=PUBLISHED').then(setAll);
  };
  useEffect(load, []);
  const user = async (id, status) => { await api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } }); load(); };
  const event = async (id, status) => { await api(`/admin/events/${id}/status`, { method: 'PATCH', body: { status } }); load(); };
  return (
    <>
      <h3>Staff awaiting approval</h3>
      {staff.length === 0 && <p className="muted">None.</p>}
      {staff.map((u) => (
        <div className="card row" key={u.id}>
          <span>{u.name} <span className="muted">· {u.email}</span></span>
          <span><button className="btn" onClick={() => user(u.id, 'ACTIVE')}>Approve</button> <button className="btn ghost" onClick={() => user(u.id, 'REJECTED')}>Reject</button></span>
        </div>
      ))}
      <h3>Events awaiting approval</h3>
      {events.length === 0 && <p className="muted">None.</p>}
      {events.map((e) => (
        <div className="card row" key={e.id}>
          <span><strong>{e.title}</strong> <span className="muted">· {e.type} · by {e.createdBy.email}</span></span>
          <span><button className="btn" onClick={() => event(e.id, 'PUBLISHED')}>Publish</button> <button className="btn ghost" onClick={() => event(e.id, 'DRAFT')}>Send back</button></span>
        </div>
      ))}
      <h3>Live events (takedown)</h3>
      {all.map((e) => (
        <div className="card row" key={e.id}>
          <span>{e.title}</span>
          <button className="btn ghost" onClick={() => confirm('Take this event down?') && event(e.id, 'CANCELLED')}>Take down</button>
        </div>
      ))}
    </>
  );
}

function Users() {
  const [users, setUsers] = useState([]);
  const load = () => api('/admin/users').then(setUsers);
  useEffect(() => { load(); }, []);
  const set = async (id, status) => { try { await api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } }); load(); } catch (e) { alert(e.message); } };
  return (
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.status}</td>
            <td>{u.role !== 'ADMIN' && (u.status === 'SUSPENDED'
              ? <button className="link" onClick={() => set(u.id, 'ACTIVE')}>Reinstate</button>
              : <button className="link" onClick={() => set(u.id, 'SUSPENDED')}>Suspend</button>)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stats() {
  const [s, setS] = useState(null);
  useEffect(() => { api('/admin/stats').then(setS); }, []);
  if (!s) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="stats">
        <div className="card"><small>Net revenue</small><b>₹{s.netRevenue}</b></div>
        <div className="card"><small>Confirmed orders</small><b>{s.confirmedOrders}</b></div>
        <div className="card"><small>Refunded</small><b>₹{s.refundedAmount}</b><small>{s.refundCount} refunds</small></div>
        <div className="card"><small>Users</small><b>{Object.entries(s.users).map(([k, v]) => `${k[0]}${k.slice(1).toLowerCase()}: ${v}`).join(' · ')}</b></div>
      </div>
      <h3>Top events by revenue</h3>
      <table><tbody>{s.topEvents.map((e) => <tr key={e.title}><td>{e.title}</td><td>{e.orders} orders</td><td>₹{e.revenue}</td></tr>)}</tbody></table>
    </>
  );
}

function Refunds() {
  const [r, setR] = useState([]);
  useEffect(() => { api('/admin/refunds').then(setR); }, []);
  return (
    <table>
      <thead><tr><th>#</th><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Reason</th></tr></thead>
      <tbody>{r.map((x) => <tr key={x.id}><td>{x.id}</td><td>{x.orderId}</td><td>{x.order.user.email}</td><td>₹{x.amount}</td><td>{x.status}</td><td>{x.reason}</td></tr>)}</tbody>
    </table>
  );
}

function Cities() {
  const [cities, setCities] = useState([]);
  const [name, setName] = useState('');
  const load = () => api('/cities').then(setCities);
  useEffect(() => { load(); }, []);
  const add = async (e) => { e.preventDefault(); await api('/admin/cities', { method: 'POST', body: { name } }); setName(''); load(); };
  return (
    <>
      <form className="card row" onSubmit={add}><input placeholder="New city" value={name} onChange={(e) => setName(e.target.value)} required /><button className="btn">Add</button></form>
      <div className="chips">{cities.map((c) => <span className="chip" key={c.id}>{c.name}</span>)}</div>
    </>
  );
}

function Audit() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api('/admin/audit').then(setLogs); }, []);
  return (
    <table>
      <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th></tr></thead>
      <tbody>{logs.map((l) => <tr key={l.id}><td>{new Date(l.createdAt).toLocaleString()}</td><td>{l.actor?.email || '—'}</td><td>{l.action}</td><td>{l.entity} {l.entityId}</td></tr>)}</tbody>
    </table>
  );
}
