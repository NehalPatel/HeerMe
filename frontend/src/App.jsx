import { useState, useEffect } from 'react';
import CalendarView from './components/CalendarView';
import LoginPage from './components/LoginPage';
import { getStoredToken, verifySession, setAuthErrorHandler, setStoredToken } from './services/api';

export default function App() {
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    setAuthErrorHandler(() => setAuthed(false));
    return () => setAuthErrorHandler(null);
  }, []);

  useEffect(() => {
    const t = getStoredToken();
    if (!t) {
      setAuthed(false);
      return;
    }
    verifySession()
      .then(() => setAuthed(true))
      .catch(() => {
        setStoredToken(null);
        setAuthed(false);
      });
  }, []);

  if (authed === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-600">Loading…</p>
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }

  return (
    <CalendarView
      onSignOut={() => {
        setStoredToken(null);
        setAuthed(false);
      }}
    />
  );
}
