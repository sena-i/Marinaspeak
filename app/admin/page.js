'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogin() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!token.trim()) {
      setError('Access token is required');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/admin/students', {
        headers: { 'Authorization': `Bearer ${token.trim()}` }
      });

      if (!response.ok) {
        setError('Invalid access token');
        setLoading(false);
        return;
      }

      localStorage.setItem('speakalize_admin_token', token.trim());
      router.push('/admin/students');
    } catch {
      setError('Connection failed');
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 440 }}>
      <div className="text-center mb-3" style={{ marginTop: '4rem' }}>
        <h1>Admin Dashboard</h1>
        <p className="text-secondary">Speakalize Teacher Portal</p>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <label className="label">Access Token</label>
          <input
            className="input mb-2"
            type="password"
            placeholder="Enter your access token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
          />
          {error && <p className="error-text mb-1">{error}</p>}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Verifying...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
