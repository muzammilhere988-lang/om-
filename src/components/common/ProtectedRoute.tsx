import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../types/database';
import { LoadingState } from './LoadingState';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { loading, user, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <LoadingState label="Verifying account session..." />
      </div>
    );
  }

  if (!user) {
    const targetLogin = allowedRoles.includes('ADMIN') && allowedRoles.length === 1 ? '/admin/login' : '/login';
    return <Navigate to={targetLogin} state={{ from: location.pathname }} replace />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-slate-900">Account Profile Incomplete</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your authentication account exists, but your marketplace profile record was not found in the database.
            Please ensure all SQL migrations have been run or contact platform support.
          </p>
        </div>
      </div>
    );
  }

  if (!allowedRoles.includes(profile.role)) {
    if (profile.role === 'ADMIN') return <Navigate to="/admin" replace />;
    if (profile.role === 'WHOLESALER') return <Navigate to="/wholesaler" replace />;
    return <Navigate to="/retailer" replace />;
  }

  if (profile.account_status === 'suspended' || profile.account_status === 'rejected') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-rose-200 rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-rose-900">
            Account {profile.account_status === 'suspended' ? 'Suspended' : 'Rejected'}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Your account is currently {profile.account_status} and cannot access dashboard operations.
            Contact the OM – Open Market administrator for assistance.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
