import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { MarketplaceLayout } from '../../layouts/MarketplaceLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage } from '../../lib/formatters';

export function LoginPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);

  useEffect(() => {
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(location.search);
    const errCode = hashParams.get('error_code') || searchParams.get('error_code');
    const errDesc = hashParams.get('error_description') || searchParams.get('error_description');

    if (errDesc || errCode) {
      if (errCode === 'otp_expired') {
        setError('Your email verification link expired or was already used. Enter your email below and click "Resend verification email", or try signing in if your account is already confirmed.');
        setShowResend(true);
      } else {
        setError(errDesc ? errDesc.replace(/\+/g, ' ') : 'Authentication link error. Please try signing in or resending verification.');
      }
      window.history.replaceState(null, '', location.pathname);
    } else if (hashParams.get('type') === 'signup' || searchParams.get('confirmed') === 'true') {
      setInfoMessage('Email verified! You can now sign in with your email and password.');
    }
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    if (user && profile) {
      if (profile.role === 'ADMIN') navigate('/admin', { replace: true });
      else if (profile.role === 'WHOLESALER') navigate('/wholesaler', { replace: true });
      else navigate('/retailer', { replace: true });
    }
  }, [user, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    try {
      const supabase = requireSupabase();
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInErr) throw signInErr;
      if (!data.user) throw new Error('Unable to establish session.');

      await refreshProfile();
    } catch (err) {
      const msg = extractErrorMessage(err, 'Invalid email or password.');
      if (msg.toLowerCase().includes('email not confirmed')) {
        setError('Your email address is not verified yet. Click "Resend verification email" below to get a fresh link.');
        setShowResend(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      setError('Please type your registered email address above first.');
      return;
    }
    setResending(true);
    setError(null);
    setInfoMessage(null);
    try {
      const supabase = requireSupabase();
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (resendErr) throw resendErr;
      setInfoMessage(`A new verification email was sent to ${email.trim()}. Please check your inbox and spam folder.`);
      setShowResend(false);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not resend verification email.'));
    } finally {
      setResending(false);
    }
  };

  return (
    <MarketplaceLayout>
      <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">Sign In to OM</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Access your wholesaler or retailer business account.
          </p>

          {infoMessage && (
            <div className="mt-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {error && (
            <div className="mt-5 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800 space-y-2">
              <p>{error}</p>
              {showResend && (
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resending}
                  className="text-xs font-semibold text-rose-900 underline hover:no-underline disabled:opacity-60"
                >
                  {resending ? 'Sending verification link...' : 'Resend verification email'}
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email Address <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@business.com"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                  Password <span className="text-rose-600">*</span>
                </label>
                <Link to="/forgot-password" className="text-xs font-medium text-teal-700 hover:text-teal-800">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-200 text-sm text-slate-600 text-center">
            New to OM – Open Market?{' '}
            <Link to="/register" className="font-semibold text-slate-900 hover:underline">
              Create a business account
            </Link>
          </div>
        </div>
      </div>
    </MarketplaceLayout>
  );
}
