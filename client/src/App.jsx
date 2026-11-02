import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './context.jsx';
import Home from './pages/Home.jsx';
import Join from './pages/Join.jsx';
import Track from './pages/Track.jsx';
import Display from './pages/Display.jsx';
import Login from './pages/Login.jsx';
import Staff from './pages/Staff.jsx';
import Admin from './pages/Admin.jsx';

function Protected({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="container page"><Spinner label="Checking your session" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/staff" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/display/:id?" element={<Display />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="join/:id" element={<Join />} />
        <Route path="track/:code" element={<Track />} />
        <Route path="login" element={<Login />} />
        <Route path="staff" element={<Protected><Staff /></Protected>} />
        <Route path="admin" element={<Protected roles={['admin']}><Admin /></Protected>} />
        <Route path="*" element={<div className="container page"><h1>Page not found</h1><p className="muted">The page you are looking for does not exist.</p></div>} />
      </Route>
    </Routes>
  );
}
