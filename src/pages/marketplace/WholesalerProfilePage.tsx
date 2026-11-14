import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Calendar, CheckCircle2, MapPin, Phone } from 'lucide-react';
import { MarketplaceLayout } from '../../layouts/MarketplaceLayout';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDate, formatINR, getPrimaryImageUrl } from '../../lib/formatters';
import type { Business, Product } from '../../types/database';
import { ImageWithFallback } from '../../components/common/ImageWithFallback';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingState } from '../../components/common/LoadingState';
import { EmptyState } from '../../components/common/EmptyState';

export function WholesalerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [business, setBusiness] = useState<Business | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const supabase = requireSupabase();
        const { data: biz, error: bizErr } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', id)
          .eq('business_type', 'WHOLESALER')
          .single();

        if (bizErr || !biz) throw new Error('Wholesaler profile not found.');
        setBusiness(biz as Business);

        const { data: prodData, error: prodErr } = await supabase
          .from('products')
          .select(
            `
            *,
            categories(id, name),
            product_images(id, image_url, is_primary, sort_order),
            inventory(available_stock)
          `
          )
          .eq('business_id', id)
          .eq('listing_status', 'published')
          .eq('is_removed', false)
          .order('created_at', { ascending: false });

        if (prodErr) throw prodErr;
        setProducts((prodData as Product[]) || []);
      } catch (err) {
        setError(extractErrorMessage(err, 'Unable to load wholesaler profile.'));
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [id]);

  if (loading) {
    return (
      <MarketplaceLayout>
        <div className="max-w-6xl mx-auto px-4 py-10">
          <LoadingState label="Loading wholesaler profile..." />
        </div>
      </MarketplaceLayout>
    );
  }

  if (error || !business) {
    return (
      <MarketplaceLayout>
        <div className="max-w-3xl mx-auto px-4 py-12">
          <EmptyState
            title="Wholesaler Not Found"
            description={error || 'This supplier profile is unavailable.'}
            action={
              <Link to="/wholesalers" className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg">
                Browse All Suppliers
              </Link>
            }
          />
        </div>
      </MarketplaceLayout>
    );
  }

  return (
    <MarketplaceLayout>
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/wholesalers"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Suppliers Directory</span>
        </Link>

        {/* Wholesaler Header Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 mb-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex items-start gap-5">
              <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                {business.logo_url ? (
                  <ImageWithFallback src={business.logo_url} alt={business.business_name} className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-8 h-8 text-slate-400" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-bold text-slate-900">{business.business_name}</h1>
                  <StatusBadge status={business.verification_status} />
                </div>
                <p className="text-sm text-slate-600 mt-1">{business.business_category}</p>
                {business.description && (
                  <p className="mt-3 text-sm text-slate-700 max-w-2xl leading-relaxed">{business.description}</p>
                )}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-2 md:w-80 shrink-0">
              <p className="flex items-center gap-2 text-slate-700">
                <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  {business.address}, {business.city}, {business.state} – {business.pin_code}
                </span>
              </p>
              <p className="flex items-center gap-2 text-slate-700">
                <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  {business.contact_person} · {business.contact_phone}
                </span>
              </p>
              {business.gst_number && (
                <p className="flex items-center gap-2 text-slate-700 font-mono text-xs">
                  <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
                  <span>GSTIN: {business.gst_number}</span>
                </p>
              )}
              <p className="flex items-center gap-2 text-slate-500 text-xs pt-1 border-t border-slate-200">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Joined {formatDate(business.created_at)}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Published Products from this Wholesaler */}
        <h2 className="text-xl font-bold text-slate-900 mb-5">
          Published Wholesale Products ({products.length})
        </h2>

        {products.length === 0 ? (
          <EmptyState
            title="No products available yet."
            description="This wholesaler has not published any active products to the marketplace yet."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <Link
                key={product.id}
                to={`/products/${product.id}`}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors flex flex-col"
              >
                <div className="aspect-[4/3] bg-slate-100">
                  <ImageWithFallback
                    src={getPrimaryImageUrl(product)}
                    alt={product.name}
                    fallbackLabel={product.name}
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <p className="text-xs text-slate-500">
                    {product.categories?.name || 'General'} · MOQ {product.moq} {product.unit}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-900 line-clamp-2">{product.name}</h3>
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {formatINR(product.wholesale_price)}
                      <span className="text-xs font-sans font-normal text-slate-500"> / {product.unit}</span>
                    </span>
                    <StatusBadge status={product.availability_status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </MarketplaceLayout>
  );
}
