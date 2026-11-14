import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Star } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDateTime, formatINR } from '../../lib/formatters';
import type { Order } from '../../types/database';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';
import { ConfirmModal } from '../../components/common/ConfirmModal';

export function RetailerDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Review modal state
  const [reviewProduct, setReviewProduct] = useState<{ productId: string; productName: string } | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const { data, error: ordErr } = await supabase
        .from('orders')
        .select(
          `
          *,
          businesses(id, business_name, city, state, contact_phone),
          order_items(*)
        `
        )
        .eq('retailer_id', user.id)
        .order('created_at', { ascending: false });

      if (ordErr) throw ordErr;
      setOrders((data as Order[]) || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load orders.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleConfirmCancel = async () => {
    if (!cancelOrderId) return;
    setCancelling(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const { error: rpcErr } = await supabase.rpc('update_order_status_secure', {
        p_order_id: cancelOrderId,
        p_new_status: 'cancelled',
        p_status_note: 'Cancelled by retailer before supplier acceptance',
      });
      if (rpcErr) throw rpcErr;
      setCancelOrderId(null);
      setActionMsg('Order cancelled and reserved inventory restored.');
      await loadOrders();
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to cancel order.'));
    } finally {
      setCancelling(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewProduct || !user?.id) return;
    setSubmittingReview(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const { error: revErr } = await supabase.from('reviews').upsert(
        {
          product_id: reviewProduct.productId,
          retailer_id: user.id,
          rating,
          comment: comment.trim() || null,
        },
        { onConflict: 'product_id,retailer_id' }
      );
      if (revErr) throw revErr;
      setReviewProduct(null);
      setComment('');
      setActionMsg('Your product review has been published.');
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to submit review.'));
    } finally {
      setSubmittingReview(false);
    }
  };

  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) =>
    ['pending', 'accepted', 'processing', 'shipped'].includes(o.status)
  ).length;
  const completedOrders = orders.filter((o) => o.status === 'delivered').length;
  const cancelledOrders = orders.filter((o) => ['cancelled', 'rejected'].includes(o.status)).length;

  const filteredOrders = orders.filter((o) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return ['pending', 'accepted', 'processing', 'shipped'].includes(o.status);
    return o.status === statusFilter;
  });

  return (
    <DashboardLayout title="Retailer Overview & Order Tracking">
      {/* KPI Metrics (Real database counts, 0 when empty) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Total Orders</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">{totalOrders}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Pending & In-Progress</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-700">{pendingOrders}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Completed (Delivered)</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">{completedOrders}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Cancelled / Rejected</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-rose-700">{cancelledOrders}</p>
        </div>
      </div>

      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {actionMsg && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900">
          {actionMsg}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {[
            { key: 'all', label: 'All Orders' },
            { key: 'active', label: 'Active' },
            { key: 'delivered', label: 'Delivered' },
            { key: 'cancelled', label: 'Cancelled' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                statusFilter === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Link
          to="/marketplace"
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
        >
          Browse Wholesale Marketplace
        </Link>
      </div>

      {loading ? (
        <LoadingState label="Loading order history..." />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="w-6 h-6" strokeWidth={1.5} />}
          title="No orders found."
          description="You have not placed any wholesale orders matching this filter yet."
          action={
            <Link
              to="/marketplace"
              className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
            >
              Start Sourcing
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <div key={order.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-sm font-bold text-slate-900">{order.order_number}</span>
                    <StatusBadge status={order.status} />
                    <StatusBadge status={order.payment_status} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Placed {formatDateTime(order.created_at)} · Supplier:{' '}
                    <Link
                      to={`/wholesalers/${order.business_id}`}
                      className="font-medium text-slate-800 hover:underline"
                    >
                      {order.businesses?.business_name || 'Supplier'}
                    </Link>
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
                        <th className="text-left pb-2 font-medium">Product</th>
                        <th className="text-right pb-2 font-medium">Qty</th>
                        <th className="text-right pb-2 font-medium">Locked Unit Price</th>
                        <th className="text-right pb-2 font-medium">Line Total</th>
                        {order.status === 'delivered' && <th className="text-right pb-2 font-medium">Review</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(order.order_items || []).map((item) => (
                        <tr key={item.id}>
                          <td className="py-2.5 pr-4">
                            <Link to={`/products/${item.product_id}`} className="font-medium text-slate-900 hover:underline">
                              {item.product_name}
                            </Link>
                            <span className="block text-xs font-mono text-slate-400">SKU: {item.sku}</span>
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-700">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-700">
                            {formatINR(item.unit_price)}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatINR(item.line_total)}
                          </td>
                          {order.status === 'delivered' && (
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setReviewProduct({ productId: item.product_id, productName: item.product_name })
                                }
                                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                              >
                                <Star className="w-3.5 h-3.5" />
                                <span>Rate</span>
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                  <div>
                    <span>Delivery: {order.delivery_address} ({order.pin_code})</span>
                    {order.businesses?.contact_phone && (
                      <span className="ml-3">· Supplier Contact: {order.businesses.contact_phone}</span>
                    )}
                  </div>
                  {order.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => setCancelOrderId(order.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-50"
                    >
                      Cancel Pending Order
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(cancelOrderId)}
        title="Cancel Wholesale Order?"
        message="This will cancel your pending order and restore reserved stock back to the wholesaler. This action cannot be undone."
        confirmLabel="Yes, Cancel Order"
        loading={cancelling}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelOrderId(null)}
      />

      {reviewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-900">Review {reviewProduct.productName}</h3>
            <form onSubmit={handleSubmitReview} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rating *</label>
                <select
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value={5}>5 Stars — Excellent quality & fulfillment</option>
                  <option value={4}>4 Stars — Good wholesale experience</option>
                  <option value={3}>3 Stars — Satisfactory</option>
                  <option value={2}>2 Stars — Below expectations</option>
                  <option value={1}>1 Star — Poor quality or delay</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Comment</label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share product quality and supplier dispatch feedback..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReviewProduct(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg disabled:opacity-60"
                >
                  {submittingReview ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
