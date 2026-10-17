import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Home from './pages/Home.jsx';
import EventPage from './pages/EventPage.jsx';
import SeatPage from './pages/SeatPage.jsx';
import Checkout from './pages/Checkout.jsx';
import Bookings from './pages/Bookings.jsx';
import { Login, Register } from './pages/AuthPages.jsx';
import Staff from './pages/Staff.jsx';
import Admin from './pages/Admin.jsx';

function Guard({ roles, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <p className="error">You don't have access to this page.</p>;
  return children;
}

export default function App() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <header className="nav">
        <Link to="/" className="brand">cinevo<span>.</span></Link>
        <nav>
          {user?.role === 'CUSTOMER' && <Link to="/bookings">My bookings</Link>}
          {user?.role === 'STAFF' && <Link to="/staff">Staff panel</Link>}
          {user?.role === 'ADMIN' && <Link to="/admin">Admin panel</Link>}
          {user ? (
            <button className="link" onClick={() => { logout(); nav('/'); }}>Logout ({user.name.split(' ')[0]})</button>
          ) : (
            <><Link to="/login">Login</Link><Link to="/register">Sign up</Link></>
          )}
        </nav>
      </header>
      <main className="wrap">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/events/:id" element={<EventPage />} />
          <Route path="/shows/:id" element={<SeatPage />} />
          <Route path="/checkout/:id" element={<Guard roles={['CUSTOMER']}><Checkout /></Guard>} />
          <Route path="/bookings" element={<Guard roles={['CUSTOMER']}><Bookings /></Guard>} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/staff" element={<Guard roles={['STAFF', 'ADMIN']}><Staff /></Guard>} />
          <Route path="/admin" element={<Guard roles={['ADMIN']}><Admin /></Guard>} />
          <Route path="*" element={<p className="muted">Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}
