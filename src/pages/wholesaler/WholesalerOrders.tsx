import { useCallback, useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDateTime, formatINR } from '../../lib/formatters';
import type { Order, OrderStatus } from '../../types/database';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';
import { ConfirmModal } from '../../components/common/ConfirmModal';

export function WholesalerOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [rejectOrderTarget, setRejectOrderTarget] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);

  const [paymentOrderTarget, setPaymentOrderTarget] = useState<Order | null>(null);
  const [paymentRef, setPaymentRef] = useState('');

  const loadOrders = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const { data, error: ordErr } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('wholesaler_id', user.id)
        .order('created_at', { ascending: false });
      if (ordErr) throw ordErr;
      setOrders((data as Order[]) || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load supplier orders.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const updateStatus = async (orderId: string, nextStatus: OrderStatus) => {
    setError(null);
    setActionMsg(null);
    setUpdating(true);
    try {
      const supabase = requireSupabase();
      const { error: rpcErr } = await supabase.rpc('update_order_status_secure', {
        p_order_id: orderId,
        p_new_status: nextStatus,
        p_status_note: null,
      });
      if (rpcErr) throw rpcErr;
      setRejectOrderTarget(null);
      setActionMsg(`Order updated to "${nextStatus}". Retailer has been notified.`);
      await loadOrders();
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to update order status.'));
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirmDirectPayment = async () => {
    if (!paymentOrderTarget) return;
    setUpdating(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const { error: rpcErr } = await supabase.rpc('confirm_direct_order_payment', {
        p_order_id: paymentOrderTarget.id,
        p_reference_number: paymentRef.trim() || null,
      });
      if (rpcErr) throw rpcErr;
      setPaymentOrderTarget(null);
      setPaymentRef('');
      setActionMsg('Direct payment receipt confirmed.');
      await loadOrders();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to confirm payment.'));
    } finally {
      setUpdating(false);
    }
  };

  const filtered = orders.filter((o) => {
    if (statusFilter === 'all') return true;
    return o.status === statusFilter;
  });

  return (
    <DashboardLayout title="Supplier Order Management">
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg mb-6 w-fit overflow-x-auto">
        {['all', 'pending', 'accepted', 'processing', 'shipped', 'delivered', 'rejected', 'cancelled'].map(
          (st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize whitespace-nowrap ${
                statusFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          )
        )}
      </div>

      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {actionMsg && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900">
          {actionMsg}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading incoming retailer orders..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="w-6 h-6" strokeWidth={1.5} />}
          title="No orders found."
          description="Incoming retailer orders for your wholesale products will appear here."
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => (
            <div key={order.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-sm font-bold text-slate-900">{order.order_number}</span>
                    <StatusBadge status={order.status} />
                    <StatusBadge status={order.payment_status} />
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Buyer: <strong>{order.shop_name}</strong> ({order.retailer_name} · {order.contact_number}) ·{' '}
                    {formatDateTime(order.created_at)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-base font-bold font-mono tabular-nums text-slate-900">
                    {formatINR(order.total_amount)}
                  </p>
                  <p className="text-xs text-slate-500 uppercase">
                    {order.payment_method.replace('_', ' ')} · {order.fulfillment_type}
                  </p>
                </div>
              </div>

              <div className="p-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-200">
                        <th className="text-left pb-2 font-medium">Item</th>
                        <th className="text-right pb-2 font-medium">Quantity</th>
                        <th className="text-right pb-2 font-medium">Unit Price</th>
                        <th className="text-right pb-2 font-medium">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(order.order_items || []).map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 pr-4 font-medium text-slate-900">
                            {item.product_name}{' '}
                            <span className="text-xs font-mono text-slate-400">({item.sku})</span>
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums">{formatINR(item.unit_price)}</td>
                          <td className="py-2 text-right font-mono tabular-nums font-semibold">
                            {formatINR(item.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-600">
                    <p>
                      Delivery Address: {order.delivery_address} (PIN: {order.pin_code})
                    </p>
                    {order.order_notes && <p className="mt-0.5 text-slate-500">Notes: {order.order_notes}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {order.payment_status !== 'verified_paid' &&
                      !['rejected', 'cancelled'].includes(order.status) && (
                        <button
                          type="button"
                          onClick={() => setPaymentOrderTarget(order)}
                          className="px-3 py-1.5 text-xs font-semibold text-teal-800 border border-teal-300 bg-teal-50 rounded-lg hover:bg-teal-100"
                        >
                          Confirm Direct Payment Receipt
                        </button>
                      )}

                    {order.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          disabled={updating}
                          onClick={() => updateStatus(order.id, 'accepted')}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                        >
                          Accept Order
                        </button>
                        <button
                          type="button"
                          disabled={updating}
                          onClick={() => setRejectOrderTarget(order)}
                          className="px-3 py-1.5 text-xs font-semibold text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-50"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {order.status === 'accepted' && (
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() => updateStatus(order.id, 'processing')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg"
                      >
                        Mark Processing
                      </button>
                    )}

                    {order.status === 'processing' && (
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() => updateStatus(order.id, 'shipped')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg"
                      >
                        Mark Shipped
                      </button>
                    )}

                    {order.status === 'shipped' && (
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() => updateStatus(order.id, 'delivered')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg"
                      >
                        Mark Delivered
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(rejectOrderTarget)}
        title="Reject Retailer Order?"
        message={`Rejecting order ${rejectOrderTarget?.order_number} will restore all reserved inventory back to your available stock and notify the retailer.`}
        confirmLabel="Yes, Reject Order"
        loading={updating}
        onConfirm={() => rejectOrderTarget && updateStatus(rejectOrderTarget.id, 'rejected')}
        onCancel={() => setRejectOrderTarget(null)}
      />

      {paymentOrderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-900">
              Confirm Direct Payment ({paymentOrderTarget.order_number})
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Only confirm once you have physically received Cash on Delivery or verified the UPI / Bank transfer of{' '}
              <strong>{formatINR(paymentOrderTarget.total_amount)}</strong> in your account.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                UPI UTR / Bank Reference / Receipt Note (Optional)
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g., UTR 432198765432 or Cash Receipt #12"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPaymentOrderTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={handleConfirmDirectPayment}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg disabled:opacity-60"
              >
                {updating ? 'Confirming...' : 'Confirm Payment Received'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
