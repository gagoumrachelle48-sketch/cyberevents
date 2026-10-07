import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from './auth.jsx';
import { api } from './api';
import EventsPage from './pages/EventsPage.jsx';
import EventDetail from './pages/EventDetail.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import MyTickets from './pages/MyTickets.jsx';
import AdminPage from './pages/AdminPage.jsx';

function Sidebar({ mode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isStaff = user && (user.role === 'admin' || user.role === 'organizer');

  return (
    <aside className="sidebar">
      <div className="logo">
        <span className="logo-mark">C</span>
        <span>CyberEvents</span>
      </div>

      <nav className="nav">
        <span className="nav-label">Billetterie</span>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}><span className="dot" />Événements</NavLink>
        {user && <NavLink to="/mes-billets" className={({ isActive }) => isActive ? 'active' : ''}><span className="dot" />Mes billets</NavLink>}

        {isStaff && <>
          <span className="nav-label">Exploitation</span>
          {/* VULN-4 : lien masqué côté client seulement ; l'API admin reste ouverte en mode vuln. */}
          <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}><span className="dot" />Administration</NavLink>
        </>}

        <span className="nav-label">Compte</span>
        {!user && <NavLink to="/connexion" className={({ isActive }) => isActive ? 'active' : ''}><span className="dot" />Connexion</NavLink>}
        {!user && <NavLink to="/inscription" className={({ isActive }) => isActive ? 'active' : ''}><span className="dot" />Inscription</NavLink>}
        {user && <button onClick={() => { logout(); nav('/'); }}><span className="dot" />Déconnexion</button>}
      </nav>

      <div className="sidebar-foot">
        {mode && (
          <div className={`modebar ${mode}`}>
            <span className="pulse" />
            {mode === 'vuln' ? 'Mode labo — vulnérable' : 'Mode sécurisé'}
          </div>
        )}
        {user && <p style={{ marginTop: 12 }}>Connectée : <span className="who">{user.full_name}</span><br /><span className="mono" style={{ fontSize: '.78rem' }}>{user.role}</span></p>}
      </div>
    </aside>
  );
}

const TITLES = {
  '/': ['Événements', 'Catalogue des événements CyberEvents'],
  '/mes-billets': ['Mes billets', 'Vos réservations et QR codes'],
  '/admin': ['Administration', 'Gestion des événements, comptes et transactions'],
  '/connexion': ['Connexion', 'Accédez à votre espace'],
  '/inscription': ['Inscription', 'Créez votre compte client'],
};

function Topbar() {
  const { pathname } = useLocation();
  const key = pathname.startsWith('/evenements/') ? 'detail' : pathname;
  const [title, sub] = TITLES[key] || ['Événement', 'Fiche détaillée'];
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        <div className="sub">{sub}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState(null);
  useEffect(() => { api('/health').then((d) => setMode(d.mode)).catch(() => {}); }, []);

  return (
    <div className="shell">
      <Sidebar mode={mode} />
      <div className="content">
        <Topbar />
        <div className="body">
          <Routes>
            <Route path="/" element={<EventsPage />} />
            <Route path="/evenements/:id" element={<EventDetail />} />
            <Route path="/connexion" element={<LoginPage />} />
            <Route path="/inscription" element={<RegisterPage />} />
            <Route path="/mes-billets" element={<MyTickets />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
