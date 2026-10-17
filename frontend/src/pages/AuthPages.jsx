import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth.jsx';

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const u = await login(f.email, f.password);
      nav(u.role === 'ADMIN' ? '/admin' : u.role === 'STAFF' ? '/staff' : '/');
    } catch (e) { setErr(e.message); }
  };
  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Login</h2>
      <input placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
      <input placeholder="Password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
      {err && <p className="error">{err}</p>}
      <button className="btn">Login</button>
      <p className="muted">New here? <Link to="/register">Create an account</Link></p>
    </form>
  );
}

export function Register() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [staff, setStaff] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const d = await api(staff ? '/auth/register-staff' : '/auth/register', { method: 'POST', body: f });
      if (d.pending) return setMsg(d.message);
      await login(f.email, f.password);
      nav('/');
    } catch (e) { setErr(e.message); }
  };
  if (msg) return <div className="card narrow"><h2>Almost there</h2><p>{msg}</p></div>;
  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Create account</h2>
      <input placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      <input placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
      <input placeholder="Password (8+ chars)" type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
      <label className="check"><input type="checkbox" checked={staff} onChange={(e) => setStaff(e.target.checked)} /> I'm an organizer / venue manager (needs admin approval)</label>
      {err && <p className="error">{err}</p>}
      <button className="btn">Sign up</button>
    </form>
  );
}
