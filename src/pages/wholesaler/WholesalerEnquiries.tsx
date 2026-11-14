import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDateTime } from '../../lib/formatters';
import type { Enquiry } from '../../types/database';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';

export function WholesalerEnquiries() {
  const { user } = useAuth();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Enquiry | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const loadEnquiries = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const supabase = requireSupabase();
      const { data, error: enqErr } = await supabase
        .from('enquiries')
        .select('*, products(id, name)')
        .eq('wholesaler_id', user.id)
        .order('created_at', { ascending: false });
      if (enqErr) throw enqErr;
      setEnquiries((data as Enquiry[]) || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load enquiries.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadEnquiries();
  }, [loadEnquiries]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyTarget || !replyText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const { error: updErr } = await supabase
        .from('enquiries')
        .update({
          reply_message: replyText.trim(),
          status: 'replied',
          replied_at: new Date().toISOString(),
        })
        .eq('id', replyTarget.id);
      if (updErr) throw updErr;
      setReplyTarget(null);
      setReplyText('');
      await loadEnquiries();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to send reply.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout title="Retailer Enquiries">
      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {loading ? (
        <LoadingState label="Loading incoming enquiries..." />
      ) : enquiries.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="w-6 h-6" strokeWidth={1.5} />}
          title="No enquiries received yet."
          description="Questions submitted by retailers from your product pages will appear here."
        />
      ) : (
        <div className="space-y-4">
          {enquiries.map((enq) => (
            <div key={enq.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-base font-semibold text-slate-900">{enq.subject}</h3>
                <StatusBadge status={enq.status} />
              </div>
              {enq.products && <p className="text-xs text-slate-500 mb-2">Product: {enq.products.name}</p>}
              <p className="text-sm text-slate-700 whitespace-pre-line">{enq.message}</p>
              <p className="text-xs text-slate-400 mt-2">Received {formatDateTime(enq.created_at)}</p>

              {enq.reply_message ? (
                <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-xs font-semibold text-slate-700">Your Reply ({formatDateTime(enq.replied_at)})</p>
                  <p className="mt-1 text-sm text-slate-800 whitespace-pre-line">{enq.reply_message}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setReplyTarget(enq);
                    setReplyText('');
                  }}
                  className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  Reply to Retailer
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {replyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-900">Reply to Enquiry</h3>
            <p className="text-xs text-slate-500 mt-1">{replyTarget.subject}</p>
            <form onSubmit={handleSendReply} className="mt-4 space-y-4">
              <textarea
                rows={4}
                required
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write your wholesale quote, lead time, or product answer..."
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReplyTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg disabled:opacity-60"
                >
                  {sending ? 'Sending...' : 'Send Reply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
