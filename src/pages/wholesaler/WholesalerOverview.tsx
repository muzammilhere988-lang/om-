import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Boxes, Package, ShoppingBag } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage } from '../../lib/formatters';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingState } from '../../components/common/LoadingState';

interface WholesalerStats {
  totalProducts: number;
  activeProducts: number;
  outOfStockProducts: number;
  pendingOrders: number;
  completedOrders: number;
}

export function WholesalerOverview() {
  const { user, business } = useAuth();
  const [stats, setStats] = useState<WholesalerStats>({
    totalProducts: 0,
    activeProducts: 0,
    outOfStockProducts: 0,
    pendingOrders: 0,
    completedOrders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const supabase = requireSupabase();
        const [{ data: prods, error: pErr }, { data: ords, error: oErr }] = await Promise.all([
          supabase
            .from('products')
            .select('id, listing_status, availability_status, is_removed, inventory(available_stock)')
            .eq('wholesaler_id', user.id),
          supabase.from('orders').select('id, status').eq('wholesaler_id', user.id),
        ]);

        if (pErr) throw pErr;
        if (oErr) throw oErr;

        const productRows = prods || [];
        const orderRows = ords || [];

        const activeProducts = productRows.filter(
          (p) => p.listing_status === 'published' && !p.is_removed
        ).length;
        const outOfStockProducts = productRows.filter((p) => {
          const inv = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory;
          return p.availability_status === 'out_of_stock' || (inv && inv.available_stock <= 0);
        }).length;

        const pendingOrders = orderRows.filter((o) =>
          ['pending', 'accepted', 'processing', 'shipped'].includes(o.status)
        ).length;
        const completedOrders = orderRows.filter((o) => o.status === 'delivered').length;

        setStats({
          totalProducts: productRows.length,
          activeProducts,
          outOfStockProducts,
          pendingOrders,
          completedOrders,
        });
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to load wholesaler metrics.'));
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, [user?.id]);

  return (
    <DashboardLayout title="Wholesaler Business Overview">
      {/* Account Verification Notice */}
      {business && business.verification_status !== 'approved' && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-sm text-amber-900">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              Business Approval Status: {business.verification_status.toUpperCase()}
            </p>
            <p className="mt-0.5 text-amber-800">
              {business.verification_status === 'pending'
                ? 'Your wholesaler application is awaiting administrator verification. You can prepare draft products now; publishing to the common marketplace unlocks once approved.'
                : `Your business verification is currently ${business.verification_status}. ${business.rejection_reason || ''}`}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}

      {loading ? (
        <LoadingState label="Loading wholesaler dashboard..." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Total Products</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">{stats.totalProducts}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Active Published Products</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">{stats.activeProducts}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Out-of-Stock Items</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-rose-700">
                {stats.outOfStockProducts}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Pending & Active Orders</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-700">{stats.pendingOrders}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Completed Orders</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {stats.completedOrders}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">Business Verification</p>
                {business && <StatusBadge status={business.verification_status} />}
              </div>
              <p className="mt-2 text-lg font-bold text-slate-900 truncate">
                {business?.verification_status === 'approved' ? 'Approved Seller' : 'Pending Review'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {business?.verification_status === 'approved'
                  ? 'Ready to publish products'
                  : 'Awaiting admin verification'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/wholesaler/products"
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Manage Catalog</h3>
                <p className="text-xs text-slate-500 mt-0.5">Add products, bulk pricing & images</p>
              </div>
            </Link>

            <Link
              to="/wholesaler/inventory"
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Update Inventory</h3>
                <p className="text-xs text-slate-500 mt-0.5">Restock & view movement history</p>
              </div>
            </Link>

            <Link
              to="/wholesaler/orders"
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Fulfill Orders</h3>
                <p className="text-xs text-slate-500 mt-0.5">Accept, ship & verify direct payments</p>
              </div>
            </Link>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
