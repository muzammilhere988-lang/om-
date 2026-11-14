import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, MapPin, Search } from 'lucide-react';
import { MarketplaceLayout } from '../../layouts/MarketplaceLayout';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDate } from '../../lib/formatters';
import type { Business } from '../../types/database';
import { ImageWithFallback } from '../../components/common/ImageWithFallback';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';

export function WholesalerDirectoryPage() {
  const [wholesalers, setWholesalers] = useState<Business[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const supabase = requireSupabase();
        const { data, error: fetchErr } = await supabase
          .from('businesses')
          .select('*')
          .eq('business_type', 'WHOLESALER')
          .eq('verification_status', 'approved')
          .order('created_at', { ascending: false });
        if (fetchErr) throw fetchErr;
        setWholesalers((data as Business[]) || []);
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to load verified wholesalers.'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = wholesalers.filter((w) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      w.business_name.toLowerCase().includes(term) ||
      w.business_category.toLowerCase().includes(term) ||
      w.city.toLowerCase().includes(term) ||
      w.state.toLowerCase().includes(term)
    );
  });

  return (
    <MarketplaceLayout>
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Verified Wholesale Suppliers</h1>
            <p className="mt-1 text-sm text-slate-600">
              Explore approved B2B wholesalers and browse their published product catalogs.
            </p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplier, category, or city..."
              className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
        )}

        {loading ? (
          <LoadingState label="Loading verified wholesalers..." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-6 h-6" strokeWidth={1.5} />}
            title="No wholesalers registered yet."
            description="Approved wholesale businesses on OM – Open Market will appear in this directory."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((biz) => (
              <Link
                key={biz.id}
                to={`/wholesalers/${biz.id}`}
                className="bg-white border border-slate-200 rounded-xl p-6 hover:border-slate-300 transition-colors flex flex-col"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                    {biz.logo_url ? (
                      <ImageWithFallback src={biz.logo_url} alt={biz.business_name} className="w-full h-full object-cover" />
                    ) : (
                      <Building2 className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-base font-bold text-slate-900 truncate">{biz.business_name}</h2>
                      <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{biz.business_category}</p>
                    <p className="text-xs text-slate-600 flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {biz.city}, {biz.state}
                      </span>
                    </p>
                  </div>
                </div>
                {biz.description && (
                  <p className="mt-4 text-sm text-slate-600 line-clamp-2 flex-1">{biz.description}</p>
                )}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Member since {formatDate(biz.created_at)}</span>
                  <span className="font-semibold text-slate-900">View Catalog →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </MarketplaceLayout>
  );
}
