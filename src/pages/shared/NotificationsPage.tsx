import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDateTime } from '../../lib/formatters';
import type { NotificationRecord } from '../../types/database';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';

export function NotificationsPage() {
  const { user, refreshCounts } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const supabase = requireSupabase();
      const { data, error: fetchErr } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (fetchErr) throw fetchErr;
      setNotifications((data as NotificationRecord[]) || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load notifications.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markAsRead = async (id: string) => {
    try {
      const supabase = requireSupabase();
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      await refreshCounts();
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    try {
      const supabase = requireSupabase();
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await refreshCounts();
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to mark notifications as read.'));
    }
  };

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <DashboardLayout title="In-App Notifications">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-600">Real-time order, enquiry, and account verification alerts.</p>
        {hasUnread && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-100"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark All Read</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}

      {loading ? (
        <LoadingState label="Loading notifications..." />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-6 h-6" strokeWidth={1.5} />}
          title="No notifications yet."
          description="Updates about orders, supplier enquiries, and account verification will appear here."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                n.is_read ? 'bg-white' : 'bg-teal-50/40'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{n.title}</h3>
                  {!n.is_read && (
                    <span className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider">New</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600">{n.message}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.created_at)}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {n.link_path && (
                  <Link
                    to={n.link_path}
                    onClick={() => !n.is_read && markAsRead(n.id)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Open
                  </Link>
                )}
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => markAsRead(n.id)}
                    className="px-3 py-1.5 text-xs font-medium text-teal-800 hover:underline"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
