import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ShoppingBag, Users } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage } from '../../lib/formatters';
import { LoadingState } from '../../components/common/LoadingState';

interface AdminStats {
  totalWholesalers: number;
  totalRetailers: number;
  approvedSellers: number;
  pendingSellers: number;
  activeProducts: number;
  totalOrders: number;
}

export function AdminOverview() {
  const [stats, setStats] = useState<AdminStats>({
    totalWholesalers: 0,
    totalRetailers: 0,
    approvedSellers: 0,
    pendingSellers: 0,
    activeProducts: 0,
    totalOrders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = requireSupabase();
        const [
          { count: totalWholesalers },
          { count: totalRetailers },
          { count: approvedSellers },
          { count: pendingSellers },
          { count: activeProducts },
          { count: totalOrders },
        ] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'WHOLESALER'),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'RETAILER'),
          supabase
            .from('businesses')
            .select('id', { count: 'exact', head: true })
            .eq('business_type', 'WHOLESALER')
            .eq('verification_status', 'approved'),
          supabase
            .from('businesses')
            .select('id', { count: 'exact', head: true })
            .eq('business_type', 'WHOLESALER')
            .eq('verification_status', 'pending'),
          supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('listing_status', 'published')
            .eq('is_removed', false),
          supabase.from('orders').select('id', { count: 'exact', head: true }),
        ]);

        setStats({
          totalWholesalers: totalWholesalers ?? 0,
          totalRetailers: totalRetailers ?? 0,
          approvedSellers: approvedSellers ?? 0,
          pendingSellers: pendingSellers ?? 0,
          activeProducts: activeProducts ?? 0,
          totalOrders: totalOrders ?? 0,
        });
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to load platform analytics.'));
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  return (
    <DashboardLayout title="Platform Administration Overview">
      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}

      {loading ? (
        <LoadingState label="Loading platform telemetry..." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Total Wholesalers</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {stats.totalWholesalers}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Total Retailers</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {stats.totalRetailers}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Approved Sellers</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {stats.approvedSellers}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Pending Seller Approvals</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-700">
                {stats.pendingSellers}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Total Active Products</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {stats.activeProducts}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Total Platform Orders</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {stats.totalOrders}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/admin/users"
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 flex items-center gap-3.5"
            >
              <Users className="w-5 h-5 text-slate-700 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Seller Approvals</h3>
                <p className="text-xs text-slate-500">{stats.pendingSellers} awaiting review</p>
              </div>
            </Link>
            <Link
              to="/admin/products"
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 flex items-center gap-3.5"
            >
              <Package className="w-5 h-5 text-slate-700 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Catalog & Categories</h3>
                <p className="text-xs text-slate-500">Manage taxonomy & listings</p>
              </div>
            </Link>
            <Link
              to="/admin/orders"
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 flex items-center gap-3.5"
            >
              <ShoppingBag className="w-5 h-5 text-slate-700 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Monitor Orders</h3>
                <p className="text-xs text-slate-500">Inspect marketplace activity</p>
              </div>
            </Link>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
