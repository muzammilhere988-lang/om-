import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDateTime } from '../../lib/formatters';
import type { Enquiry } from '../../types/database';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';

export function RetailerEnquiries() {
  const { user } = useAuth();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const supabase = requireSupabase();
        const { data, error: enqErr } = await supabase
          .from('enquiries')
          .select('*, products(id, name)')
          .eq('retailer_id', user.id)
          .order('created_at', { ascending: false });
        if (enqErr) throw enqErr;
        setEnquiries((data as Enquiry[]) || []);
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to load enquiries.'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  return (
    <DashboardLayout title="My Supplier Enquiries">
      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {loading ? (
        <LoadingState label="Loading your enquiries..." />
      ) : enquiries.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="w-6 h-6" strokeWidth={1.5} />}
          title="No enquiries sent yet."
          description="Use the Contact Supplier button on any product page to ask wholesalers about bulk pricing or dispatch."
        />
      ) : (
        <div className="space-y-4">
          {enquiries.map((enq) => (
            <div key={enq.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-base font-semibold text-slate-900">{enq.subject}</h3>
                <StatusBadge status={enq.status} />
              </div>
              {enq.products && (
                <p className="text-xs text-slate-500 mb-2">Product: {enq.products.name}</p>
              )}
              <p className="text-sm text-slate-700 whitespace-pre-line">{enq.message}</p>
              <p className="text-xs text-slate-400 mt-2">Sent {formatDateTime(enq.created_at)}</p>

              {enq.reply_message && (
                <div className="mt-4 p-4 bg-teal-50/70 border border-teal-200 rounded-lg">
                  <p className="text-xs font-semibold text-teal-900">Supplier Reply ({formatDateTime(enq.replied_at)})</p>
                  <p className="mt-1 text-sm text-slate-800 whitespace-pre-line">{enq.reply_message}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
