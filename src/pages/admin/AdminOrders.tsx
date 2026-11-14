import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDateTime, formatINR } from '../../lib/formatters';
import type { Order } from '../../types/database';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const supabase = requireSupabase();
        const { data, error: ordErr } = await supabase
          .from('orders')
          .select('*, businesses(id, business_name), order_items(*)')
          .order('created_at', { ascending: false })
          .limit(100);
        if (ordErr) throw ordErr;
        setOrders((data as Order[]) || []);
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to load platform orders.'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <DashboardLayout title="Platform Order Monitoring">
      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {loading ? (
        <LoadingState label="Loading platform orders..." />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="w-6 h-6" strokeWidth={1.5} />}
          title="No orders found."
          description="Wholesale orders placed by retailers across the platform will be monitored here."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold">Order #</th>
                  <th className="text-left py-3 px-4 font-semibold">Retailer Shop</th>
                  <th className="text-left py-3 px-4 font-semibold">Supplier</th>
                  <th className="text-right py-3 px-4 font-semibold">Total</th>
                  <th className="text-left py-3 px-4 font-semibold">Order Status</th>
                  <th className="text-left py-3 px-4 font-semibold">Direct Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((ord) => (
                  <tr key={ord.id}>
                    <td className="py-3 px-4">
                      <p className="font-mono text-xs font-bold text-slate-900">{ord.order_number}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(ord.created_at)}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{ord.shop_name}</p>
                      <p className="text-xs text-slate-500">{ord.retailer_name}</p>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{ord.businesses?.business_name || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                      {formatINR(ord.total_amount)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={ord.status} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={ord.payment_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
