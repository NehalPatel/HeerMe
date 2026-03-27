import { useState } from 'react';
import { loginWithPin } from '../services/api';

export default function LoginPage({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(pin)) {
      setError('Enter your 6-digit PIN.');
      return;
    }
    setLoading(true);
    try {
      await loginWithPin(pin);
      onSuccess();
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error;
      if (status === 429) {
        setError(msg || 'Too many attempts. Try again later.');
      } else {
        setError(msg || 'Could not sign in. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-sm p-8">
        <h1 className="text-2xl font-bold text-primary-600 text-center mb-1">HeerMe</h1>
        <p className="text-sm text-slate-500 text-center mb-6">Enter your 6-digit PIN to open your reminders</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pin" className="sr-only">
              PIN
            </label>
            <input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full text-center text-2xl tracking-[0.4em] font-mono px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="••••••"
              autoFocus
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600 text-center" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading || pin.length !== 6}
            className="w-full py-3 rounded-xl bg-primary-500 text-white font-semibold hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
