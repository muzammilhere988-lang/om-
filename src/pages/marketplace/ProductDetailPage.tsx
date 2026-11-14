import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Flag,
  MapPin,
  MessageSquare,
  ShoppingCart,
  Star,
} from 'lucide-react';
import { MarketplaceLayout } from '../../layouts/MarketplaceLayout';
import { requireSupabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  extractErrorMessage,
  formatDate,
  formatINR,
  getAvailableStock,
  resolveUnitPriceForQuantity,
} from '../../lib/formatters';
import type { PricingTier, Product, ProductImage } from '../../types/database';
import { ImageWithFallback } from '../../components/common/ImageWithFallback';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingState } from '../../components/common/LoadingState';
import { EmptyState } from '../../components/common/EmptyState';

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, refreshCounts } = useAuth();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null>(null);
  const [otherProducts, setOtherProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);

  // Enquiry modal state
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquirySubject, setEnquirySubject] = useState('');
  const [enquiryMessage, setEnquiryMessage] = useState('');
  const [sendingEnquiry, setSendingEnquiry] = useState(false);

  // Report modal state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Prohibited or counterfeit item');
  const [reportDetails, setReportDetails] = useState('');
  const [sendingReport, setSendingReport] = useState(false);

  useEffect(() => {
    const loadProduct = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);

      try {
        const supabase = requireSupabase();
        const { data, error: prodErr } = await supabase
          .from('products')
          .select(
            `
            *,
            businesses(*),
            categories(id, name, slug),
            subcategories(id, name, slug),
            product_images(id, image_url, is_primary, sort_order),
            inventory(available_stock, reserved_stock),
            pricing_tiers(id, min_qty, max_qty, unit_price)
          `
          )
          .eq('id', id)
          .single();

        if (prodErr || !data) throw new Error('Product not found or currently unavailable.');
        const loaded = data as Product;
        setProduct(loaded);
        setQuantity(loaded.moq || 1);

        const sortedImgs = [...(loaded.product_images || [])].sort((a, b) => {
          if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
          return a.sort_order - b.sort_order;
        });
        setSelectedImage(sortedImgs[0]?.image_url || null);

        // Fetch other products from same wholesaler & product reviews
        const [{ data: moreData }, { data: revData }] = await Promise.all([
          supabase
            .from('products')
            .select(
              `
              *,
              businesses(id, business_name, city, state),
              product_images(id, image_url, is_primary, sort_order),
              inventory(available_stock)
            `
            )
            .eq('wholesaler_id', loaded.wholesaler_id)
            .eq('listing_status', 'published')
            .eq('is_removed', false)
            .neq('id', loaded.id)
            .limit(3),
          supabase.from('reviews').select('id, rating, comment, created_at').eq('product_id', loaded.id).order('created_at', { ascending: false }),
        ]);

        setOtherProducts((moreData as Product[]) || []);
        setReviews((revData as ReviewRow[]) || []);
      } catch (err) {
        setError(extractErrorMessage(err, 'Unable to load product details.'));
      } finally {
        setLoading(false);
      }
    };
    loadProduct();
  }, [id]);

  const handleAddToCart = async (goToCart: boolean) => {
    if (!product) return;
    setActionMsg(null);

    if (!user || !profile) {
      navigate('/login');
      return;
    }

    if (profile.role !== 'RETAILER') {
      setActionMsg({
        type: 'error',
        text: 'Only Retailer accounts can add wholesale items to a purchasing cart.',
      });
      return;
    }

    const available = getAvailableStock(product);
    if (quantity < product.moq) {
      setActionMsg({
        type: 'error',
        text: `Minimum order quantity is ${product.moq} ${product.unit}.`,
      });
      return;
    }
    if (product.availability_status === 'out_of_stock' || quantity > available) {
      setActionMsg({
        type: 'error',
        text: `Requested quantity (${quantity}) exceeds available stock (${available}).`,
      });
      return;
    }

    setAddingToCart(true);
    try {
      const supabase = requireSupabase();
      let { data: cartRow } = await supabase
        .from('carts')
        .select('id')
        .eq('retailer_id', user.id)
        .maybeSingle();

      if (!cartRow) {
        const { data: newCart, error: cartErr } = await supabase
          .from('carts')
          .insert({ retailer_id: user.id })
          .select('id')
          .single();
        if (cartErr) throw cartErr;
        cartRow = newCart;
      }

      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('id, quantity')
        .eq('cart_id', cartRow.id)
        .eq('product_id', product.id)
        .maybeSingle();

      if (existingItem) {
        const newQty = existingItem.quantity + quantity;
        if (newQty > available) {
          throw new Error(`Combined cart quantity (${newQty}) would exceed available stock (${available}).`);
        }
        const { error: updErr } = await supabase
          .from('cart_items')
          .update({ quantity: newQty })
          .eq('id', existingItem.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from('cart_items').insert({
          cart_id: cartRow.id,
          product_id: product.id,
          quantity,
        });
        if (insErr) throw insErr;
      }

      await refreshCounts();
      if (goToCart) {
        navigate('/cart');
      } else {
        setActionMsg({ type: 'success', text: `Added ${quantity} ${product.unit} to your cart.` });
      }
    } catch (err) {
      setActionMsg({ type: 'error', text: extractErrorMessage(err, 'Could not add item to cart.') });
    } finally {
      setAddingToCart(false);
    }
  };

  const handleSendEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !user || profile?.role !== 'RETAILER') return;
    setSendingEnquiry(true);
    try {
      const supabase = requireSupabase();
      const { error: enqErr } = await supabase.from('enquiries').insert({
        retailer_id: user.id,
        wholesaler_id: product.wholesaler_id,
        product_id: product.id,
        subject: enquirySubject.trim() || `Enquiry about ${product.name}`,
        message: enquiryMessage.trim(),
      });
      if (enqErr) throw enqErr;
      setEnquiryOpen(false);
      setEnquirySubject('');
      setEnquiryMessage('');
      setActionMsg({ type: 'success', text: 'Your enquiry has been sent to the wholesaler.' });
    } catch (err) {
      setActionMsg({ type: 'error', text: extractErrorMessage(err, 'Failed to send enquiry.') });
    } finally {
      setSendingEnquiry(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !user) return;
    setSendingReport(true);
    try {
      const supabase = requireSupabase();
      const { error: repErr } = await supabase.from('product_reports').insert({
        product_id: product.id,
        reporter_id: user.id,
        reason: reportReason,
        details: reportDetails.trim() || null,
      });
      if (repErr) throw repErr;
      setReportOpen(false);
      setReportDetails('');
      setActionMsg({ type: 'success', text: 'Product report submitted to platform administrators.' });
    } catch (err) {
      setActionMsg({ type: 'error', text: extractErrorMessage(err, 'Failed to submit report.') });
    } finally {
      setSendingReport(false);
    }
  };

  if (loading) {
    return (
      <MarketplaceLayout>
        <div className="max-w-6xl mx-auto px-4 py-10">
          <LoadingState label="Loading product specifications..." />
        </div>
      </MarketplaceLayout>
    );
  }

  if (error || !product) {
    return (
      <MarketplaceLayout>
        <div className="max-w-3xl mx-auto px-4 py-12">
          <EmptyState
            title="Product Unavailable"
            description={error || 'This wholesale listing could not be found.'}
            action={
              <Link
                to="/marketplace"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Marketplace</span>
              </Link>
            }
          />
        </div>
      </MarketplaceLayout>
    );
  }

  const images: ProductImage[] = [...(product.product_images || [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const tiers: PricingTier[] = [...(product.pricing_tiers || [])].sort((a, b) => a.min_qty - b.min_qty);
  const availableStock = getAvailableStock(product);
  const activeUnitPrice = resolveUnitPriceForQuantity(product.wholesale_price, tiers, quantity);
  const estimatedSubtotal = activeUnitPrice * quantity;

  return (
    <MarketplaceLayout>
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link
            to="/marketplace"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Marketplace</span>
          </Link>
          {user && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-rose-700"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Report Listing</span>
            </button>
          )}
        </div>

        {/* Main 2-column PDP */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Gallery & Description */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="aspect-[4/3] bg-slate-100">
                <ImageWithFallback
                  src={selectedImage}
                  alt={product.name}
                  fallbackLabel={product.name}
                  className="w-full h-full object-cover"
                />
              </div>
              {images.length > 1 && (
                <div className="p-3 border-t border-slate-200 flex items-center gap-2.5 overflow-x-auto">
                  {images.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setSelectedImage(img.image_url)}
                      className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 ${
                        selectedImage === img.image_url ? 'border-slate-900' : 'border-transparent'
                      }`}
                    >
                      <ImageWithFallback src={img.image_url} alt={product.name} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-3">Product Specifications & Description</h2>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{product.description}</p>
              <dl className="mt-6 pt-5 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Category</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {product.categories?.name || 'General'}
                    {product.subcategories ? ` / ${product.subcategories.name}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Brand</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{product.brand || 'Unbranded / Generic'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">SKU Code</dt>
                  <dd className="font-mono text-slate-900 mt-0.5">{product.sku}</dd>
                </div>
              </dl>
            </div>

            {/* Verified Buyer Reviews */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Retailer Reviews ({reviews.length})</h2>
              {reviews.length === 0 ? (
                <p className="text-sm text-slate-500">No verified buyer reviews yet for this product.</p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((rev) => (
                    <div key={rev.id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-amber-500">
                          {Array.from({ length: rev.rating }).map((_, idx) => (
                            <Star key={idx} className="w-4 h-4 fill-current" />
                          ))}
                        </div>
                        <span className="text-xs text-slate-400">{formatDate(rev.created_at)}</span>
                      </div>
                      {rev.comment && <p className="mt-2 text-sm text-slate-700">{rev.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Contiguous Purchase Module & Supplier Card */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {product.categories?.name || 'Wholesale Item'}
                </span>
                <StatusBadge
                  status={
                    availableStock <= 0 && product.availability_status !== 'made_to_order'
                      ? 'out_of_stock'
                      : product.availability_status
                  }
                />
              </div>

              <h1 className="text-2xl font-bold text-slate-900 leading-snug">{product.name}</h1>

              <div className="mt-4 pt-4 border-t border-slate-100 flex items-baseline justify-between">
                <div>
                  <p className="text-xs text-slate-500">Applicable Unit Price</p>
                  <p className="text-3xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {formatINR(activeUnitPrice)}
                    <span className="text-sm font-sans font-normal text-slate-500 ml-1">/ {product.unit}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Available Stock</p>
                  <p className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                    {availableStock} {product.unit}
                  </p>
                </div>
              </div>

              {/* Bulk Pricing Tiers */}
              {tiers.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Quantity-Based Bulk Pricing
                  </p>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium">Order Quantity</th>
                          <th className="text-right py-2 px-3 font-medium">Price / {product.unit}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                        {tiers.map((tier) => {
                          const isCurrent =
                            quantity >= tier.min_qty && (tier.max_qty === null || quantity <= tier.max_qty);
                          return (
                            <tr key={tier.id} className={isCurrent ? 'bg-teal-50/70 font-semibold' : ''}>
                              <td className="py-2 px-3 text-slate-800">
                                {tier.min_qty} – {tier.max_qty ?? '∞'} {product.unit}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-900">{formatINR(tier.unit_price)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Quantity & Cart Actions */}
              <div className="mt-5 pt-5 border-t border-slate-200 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label htmlFor="order-qty" className="block text-sm font-medium text-slate-700">
                      Order Quantity
                    </label>
                    <p className="text-xs text-slate-500">
                      Minimum Order (MOQ): {product.moq} {product.unit}
                    </p>
                  </div>
                  <input
                    id="order-qty"
                    type="number"
                    min={product.moq}
                    max={Math.max(product.moq, availableStock)}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-28 px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="flex items-center justify-between text-sm bg-slate-50 px-3.5 py-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-600">Estimated Subtotal</span>
                  <span className="font-bold font-mono tabular-nums text-slate-900">
                    {formatINR(estimatedSubtotal)}
                  </span>
                </div>

                {actionMsg && (
                  <div
                    className={`p-3 rounded-lg text-xs border ${
                      actionMsg.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {actionMsg.text}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={addingToCart || availableStock <= 0}
                    onClick={() => handleAddToCart(false)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>Add to Cart</span>
                  </button>
                  <button
                    type="button"
                    disabled={addingToCart || availableStock <= 0}
                    onClick={() => handleAddToCart(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    <span>Place Order</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Supplier Information Card */}
            {product.businesses && (
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                    {product.businesses.logo_url ? (
                      <ImageWithFallback
                        src={product.businesses.logo_url}
                        alt={product.businesses.business_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Building2 className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`/wholesalers/${product.businesses.id}`}
                        className="text-base font-semibold text-slate-900 hover:underline truncate"
                      >
                        {product.businesses.business_name}
                      </Link>
                      {product.businesses.verification_status === 'approved' && (
                        <span title="Verified Wholesaler" className="inline-flex shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-teal-700" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>
                        {product.businesses.city}, {product.businesses.state}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Link
                    to={`/wholesalers/${product.businesses.id}`}
                    className="inline-flex items-center justify-center px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    View Supplier Profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) {
                        navigate('/login');
                        return;
                      }
                      if (profile?.role !== 'RETAILER') {
                        setActionMsg({ type: 'error', text: 'Only Retailer accounts can send supplier enquiries.' });
                        return;
                      }
                      setEnquirySubject(`Enquiry: ${product.name}`);
                      setEnquiryOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Contact Supplier</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Other Products from this Wholesaler */}
        {otherProducts.length > 0 && (
          <section className="mt-14 pt-8 border-t border-slate-200">
            <h2 className="text-xl font-bold text-slate-900 mb-5">
              Other Products from {product.businesses?.business_name}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {otherProducts.map((op) => {
                const thumb = [...(op.product_images || [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url;
                return (
                  <Link
                    key={op.id}
                    to={`/products/${op.id}`}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors"
                  >
                    <div className="aspect-[4/3] bg-slate-100">
                      <ImageWithFallback src={thumb} alt={op.name} fallbackLabel={op.name} />
                    </div>
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-slate-900 line-clamp-1">{op.name}</h3>
                      <p className="mt-1 text-sm font-bold font-mono tabular-nums text-slate-900">
                        {formatINR(op.wholesale_price)} <span className="font-sans font-normal text-xs text-slate-500">/ {op.unit}</span>
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Contact Supplier Modal */}
      {enquiryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-900">Contact {product.businesses?.business_name}</h3>
            <p className="text-xs text-slate-500 mt-1">Ask about custom bulk quotes, transport, or product specs.</p>
            <form onSubmit={handleSendEnquiry} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject *</label>
                <input
                  type="text"
                  required
                  value={enquirySubject}
                  onChange={(e) => setEnquirySubject(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message *</label>
                <textarea
                  rows={4}
                  required
                  value={enquiryMessage}
                  onChange={(e) => setEnquiryMessage(e.target.value)}
                  placeholder="Enter your required quantity, delivery city, or questions..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEnquiryOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEnquiry}
                  className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg disabled:opacity-60"
                >
                  {sendingEnquiry ? 'Sending...' : 'Send Enquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Product Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-900">Report Product Listing</h3>
            <form onSubmit={handleSubmitReport} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason *</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Prohibited or counterfeit item">Prohibited or counterfeit item</option>
                  <option value="Misleading pricing or specifications">Misleading pricing or specifications</option>
                  <option value="Inappropriate imagery or spam">Inappropriate imagery or spam</option>
                  <option value="Other policy violation">Other policy violation</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Additional Details</label>
                <textarea
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Provide specific details for administrator review..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingReport}
                  className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-lg disabled:opacity-60"
                >
                  {sendingReport ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MarketplaceLayout>
  );
}
