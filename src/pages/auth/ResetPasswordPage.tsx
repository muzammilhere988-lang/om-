import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MarketplaceLayout } from '../../layouts/MarketplaceLayout';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage } from '../../lib/formatters';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const supabase = requireSupabase();
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to update password. Ensure you opened the reset link from your email.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MarketplaceLayout>
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">Set New Password</h1>
          <p className="mt-1.5 text-sm text-slate-600">Choose a strong new password for your OM account.</p>

          {success ? (
            <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900">
              Password updated successfully. Redirecting to Sign In...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="rp-pass" className="block text-sm font-medium text-slate-700 mb-1.5">
                  New Password <span className="text-rose-600">*</span>
                </label>
                <input
                  id="rp-pass"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label htmlFor="rp-cpass" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Confirm New Password <span className="text-rose-600">*</span>
                </label>
                <input
                  id="rp-cpass"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm">
            <Link to="/login" className="text-slate-600 hover:text-slate-900 font-medium">
              Return to Sign In
            </Link>
          </div>
        </div>
      </div>
    </MarketplaceLayout>
  );
}
