import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage } from '../../lib/formatters';

export function AdminLoginPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && profile?.role === 'ADMIN') {
      navigate('/admin', { replace: true });
    }
  }, [user, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = requireSupabase();
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInErr) throw signInErr;
      if (!data.user) throw new Error('Authentication failed.');

      const { data: profData, error: profErr } = await supabase
        .from('profiles')
        .select('role, account_status')
        .eq('id', data.user.id)
        .single();

      if (profErr || !profData || profData.role !== 'ADMIN') {
        await supabase.auth.signOut();
        throw new Error('Access denied. This portal is strictly restricted to authorized OM administrators.');
      }

      if (profData.account_status !== 'active') {
        await supabase.auth.signOut();
        throw new Error('This administrator account is currently inactive.');
      }

      await refreshProfile();
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err, 'Invalid administrator credentials.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">OM Administrator Portal</h1>
            <p className="text-xs text-slate-500">Restricted Platform Management Access</p>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-sm font-medium text-slate-700 mb-1.5">
              Administrator Email <span className="text-rose-600">*</span>
            </label>
            <input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@yourdomain.com"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-sm font-medium text-slate-700 mb-1.5">
              Password <span className="text-rose-600">*</span>
            </label>
            <input
              id="admin-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter administrator password"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? 'Verifying Administrator...' : 'Sign In as Administrator'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Public admin signup is disabled.</span>
          <Link to="/" className="font-medium text-slate-800 hover:underline">
            Return to Marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}
