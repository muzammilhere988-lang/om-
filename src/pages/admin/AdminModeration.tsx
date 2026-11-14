import { useCallback, useEffect, useState } from 'react';
import { Flag } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDateTime } from '../../lib/formatters';
import type { ProductReport } from '../../types/database';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';

export function AdminModeration() {
  const [reports, setReports] = useState<ProductReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = requireSupabase();
      const { data, error: repErr } = await supabase
        .from('product_reports')
        .select('*, products(id, name, wholesaler_id, listing_status, is_removed)')
        .order('created_at', { ascending: false });
      if (repErr) throw repErr;
      setReports((data as ProductReport[]) || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load moderation reports.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleModerationAction = async (
    report: ProductReport,
    action: 'dismissed' | 'remove_product'
  ) => {
    setError(null);
    setMsg(null);
    try {
      const supabase = requireSupabase();
      if (action === 'remove_product' && report.products) {
        await supabase
          .from('products')
          .update({
            is_removed: true,
            removal_reason: `Removed following moderation review: ${report.reason}`,
          })
          .eq('id', report.products.id);
      }

      const { error: updErr } = await supabase
        .from('product_reports')
        .update({
          status: action === 'dismissed' ? 'dismissed' : 'action_taken',
          admin_notes:
            action === 'remove_product'
              ? 'Product removed from marketplace'
              : 'Reviewed and dismissed by administrator',
        })
        .eq('id', report.id);

      if (updErr) throw updErr;
      setMsg(action === 'remove_product' ? 'Reported product removed.' : 'Report dismissed.');
      await loadReports();
    } catch (err) {
      setError(extractErrorMessage(err, 'Moderation action failed.'));
    }
  };

  return (
    <DashboardLayout title="Moderation & Reported Products">
      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {msg && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900">
          {msg}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading reported listings..." />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<Flag className="w-6 h-6" strokeWidth={1.5} />}
          title="No product reports submitted."
          description="Complaints or prohibited listing reports submitted by marketplace users will appear here."
        />
      ) : (
        <div className="space-y-4">
          {reports.map((rep) => (
            <div key={rep.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-base font-bold text-slate-900">
                  {rep.products?.name || 'Reported Product'}
                </h3>
                <StatusBadge status={rep.status} />
              </div>
              <p className="text-sm font-medium text-rose-800">Reason: {rep.reason}</p>
              {rep.details && <p className="mt-1 text-sm text-slate-700">{rep.details}</p>}
              <p className="mt-2 text-xs text-slate-400">Reported {formatDateTime(rep.created_at)}</p>

              {rep.status === 'open' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleModerationAction(rep, 'remove_product')}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700"
                  >
                    Remove Reported Product
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModerationAction(rep, 'dismissed')}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Dismiss Report
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
