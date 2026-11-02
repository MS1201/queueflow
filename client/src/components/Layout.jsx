import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand" aria-label="QueueFlow home">
            <span className="brand-mark" aria-hidden><i /><i /><i /></span>
            <span>QueueFlow</span>
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end>Services</NavLink>
            {user && <NavLink to="/staff">Counter desk</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
            {user ? (
              <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/'); }}>
                <LogOut size={15} aria-hidden /> Sign out
              </button>
            ) : (
              <NavLink to="/login" className="btn btn-ghost btn-sm">Staff sign in</NavLink>
            )}
          </nav>
        </div>
      </header>
      <main id="main"><Outlet /></main>
      <footer className="footer">
        <div className="container">QueueFlow: digital queues and crowd management for places people would rather not wait.</div>
      </footer>
    </>
  );
}
