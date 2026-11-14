import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { MarketplaceLayout } from '../../layouts/MarketplaceLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import {
  extractErrorMessage,
  formatINR,
  getAvailableStock,
  getPrimaryImageUrl,
  resolveUnitPriceForQuantity,
} from '../../lib/formatters';
import type { CartItem, FulfillmentType, PaymentMethod } from '../../types/database';
import { ImageWithFallback } from '../../components/common/ImageWithFallback';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';

interface CreatedOrderReceipt {
  order_id: string;
  order_number: string;
  business_name: string;
  total_amount: number;
}

export function CartCheckoutPage() {
  const { user, profile, business, refreshCounts } = useAuth();

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  // Checkout form fields
  const [retailerName, setRetailerName] = useState('');
  const [shopName, setShopName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [orderNotes, setOrderNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [createdOrders, setCreatedOrders] = useState<CreatedOrderReceipt[] | null>(null);

  useEffect(() => {
    if (profile) {
      setRetailerName((prev) => prev || profile.full_name);
      setContactNumber((prev) => prev || profile.mobile);
    }
    if (business) {
      setShopName((prev) => prev || business.business_name);
      setDeliveryAddress((prev) => prev || `${business.address}, ${business.city}, ${business.state}`);
      setPinCode((prev) => prev || business.pin_code);
    }
  }, [profile, business]);

  const loadCart = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = requireSupabase();
      const { data: cartRow } = await supabase
        .from('carts')
        .select('id')
        .eq('retailer_id', user.id)
        .maybeSingle();

      if (!cartRow) {
        setCartItems([]);
        return;
      }

      const { data: items, error: itemsErr } = await supabase
        .from('cart_items')
        .select(
          `
          *,
          products(
            *,
            businesses(id, business_name, city, state),
            product_images(id, image_url, is_primary, sort_order),
            inventory(available_stock),
            pricing_tiers(id, min_qty, max_qty, unit_price)
          )
        `
        )
        .eq('cart_id', cartRow.id)
        .order('created_at', { ascending: true });

      if (itemsErr) throw itemsErr;
      setCartItems((items as CartItem[]) || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load shopping cart.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  const updateQuantity = async (item: CartItem, nextQty: number) => {
    if (!item.products) return;
    setError(null);
    const moq = item.products.moq || 1;
    const stock = getAvailableStock(item.products);

    if (nextQty < moq) {
      setError(`Minimum order quantity for "${item.products.name}" is ${moq} ${item.products.unit}.`);
      return;
    }
    if (nextQty > stock) {
      setError(`Only ${stock} ${item.products.unit} available in stock for "${item.products.name}".`);
      return;
    }

    setUpdatingItemId(item.id);
    try {
      const supabase = requireSupabase();
      const { error: updErr } = await supabase
        .from('cart_items')
        .update({ quantity: nextQty })
        .eq('id', item.id);
      if (updErr) throw updErr;
      setCartItems((prev) => prev.map((ci) => (ci.id === item.id ? { ...ci, quantity: nextQty } : ci)));
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to update cart quantity.'));
    } finally {
      setUpdatingItemId(null);
    }
  };

  const removeItem = async (itemId: string) => {
    setError(null);
    setUpdatingItemId(itemId);
    try {
      const supabase = requireSupabase();
      const { error: delErr } = await supabase.from('cart_items').delete().eq('id', itemId);
      if (delErr) throw delErr;
      setCartItems((prev) => prev.filter((ci) => ci.id !== itemId));
      await refreshCounts();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to remove item.'));
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!/^[0-9]{6}$/.test(pinCode.trim())) {
      setError('Please enter a valid 6-digit delivery PIN code.');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = requireSupabase();
      const { data, error: rpcErr } = await supabase.rpc('create_multi_supplier_order', {
        p_retailer_name: retailerName.trim(),
        p_shop_name: shopName.trim(),
        p_contact_number: contactNumber.trim(),
        p_delivery_address: deliveryAddress.trim(),
        p_pin_code: pinCode.trim(),
        p_fulfillment_type: fulfillmentType,
        p_payment_method: paymentMethod,
        p_order_notes: orderNotes.trim() || null,
      });

      if (rpcErr) throw rpcErr;

      const result = data as { orders?: CreatedOrderReceipt[] } | null;
      setCreatedOrders(result?.orders || []);
      setCartItems([]);
      await refreshCounts();
    } catch (err) {
      setError(extractErrorMessage(err, 'Order placement failed. Please verify stock and MOQ requirements.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Group items by wholesaler
  const groupedBySupplier = cartItems.reduce<
    Record<string, { supplierName: string; items: CartItem[]; subtotal: number }>
  >((acc, item) => {
    const prod = item.products;
    if (!prod) return acc;
    const key = prod.wholesaler_id;
    const supplierName = prod.businesses?.business_name || 'Wholesale Supplier';
    const unitPrice = resolveUnitPriceForQuantity(
      prod.wholesale_price,
      prod.pricing_tiers,
      item.quantity
    );
    const lineTotal = unitPrice * item.quantity;

    if (!acc[key]) {
      acc[key] = { supplierName, items: [], subtotal: 0 };
    }
    acc[key].items.push(item);
    acc[key].subtotal += lineTotal;
    return acc;
  }, {});

  const supplierGroups = Object.entries(groupedBySupplier);
  const grandTotal = supplierGroups.reduce((sum, [, g]) => sum + g.subtotal, 0);

  if (createdOrders) {
    return (
      <MarketplaceLayout>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Orders Placed Successfully</h1>
                <p className="text-sm text-slate-600">
                  Separate supplier orders have been dispatched to each wholesaler.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {createdOrders.map((ord) => (
                <div
                  key={ord.order_id}
                  className="flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-slate-50"
                >
                  <div>
                    <p className="font-mono text-sm font-bold text-slate-900">{ord.order_number}</p>
                    <p className="text-xs text-slate-600 mt-0.5">Supplier: {ord.business_name}</p>
                  </div>
                  <p className="font-mono text-sm font-bold tabular-nums text-slate-900">
                    {formatINR(ord.total_amount)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              Payment Status: <strong>Unpaid (Direct Settlement)</strong>. Settle payment directly with each
              wholesaler via your selected method ({paymentMethod.replace('_', ' ').toUpperCase()}).
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/retailer"
                className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                Track My Orders
              </Link>
              <Link
                to="/marketplace"
                className="px-5 py-2.5 text-sm font-semibold text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Continue Sourcing
              </Link>
            </div>
          </div>
        </div>
      </MarketplaceLayout>
    );
  }

  return (
    <MarketplaceLayout>
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Wholesale Cart & Multi-Supplier Checkout</h1>
        <p className="text-sm text-slate-600 mb-6">
          Products from multiple wholesalers are automatically split into separate supplier orders at checkout.
        </p>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">
            {error}
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading your wholesale cart..." />
        ) : cartItems.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="w-6 h-6" strokeWidth={1.5} />}
            title="Your cart is empty."
            description="Browse the common marketplace to add wholesale products from approved suppliers."
            action={
              <Link
                to="/marketplace"
                className="inline-flex items-center px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                Browse Marketplace
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Cart Items Grouped by Wholesaler */}
            <div className="lg:col-span-7 space-y-6">
              {supplierGroups.map(([wholesalerId, group]) => (
                <div key={wholesalerId} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500">Supplier Order Group</p>
                      <h2 className="text-sm font-bold text-slate-900">{group.supplierName}</h2>
                    </div>
                    <p className="text-sm font-mono font-bold tabular-nums text-slate-900">
                      {formatINR(group.subtotal)}
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {group.items.map((item) => {
                      const prod = item.products!;
                      const unitPrice = resolveUnitPriceForQuantity(
                        prod.wholesale_price,
                        prod.pricing_tiers,
                        item.quantity
                      );
                      const available = getAvailableStock(prod);
                      const lineTotal = unitPrice * item.quantity;

                      return (
                        <div key={item.id} className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
                          <Link
                            to={`/products/${prod.id}`}
                            className="w-20 h-20 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0"
                          >
                            <ImageWithFallback
                              src={getPrimaryImageUrl(prod)}
                              alt={prod.name}
                              className="w-full h-full object-cover"
                            />
                          </Link>

                          <div className="flex-1 min-w-0">
                            <Link
                              to={`/products/${prod.id}`}
                              className="text-sm font-semibold text-slate-900 hover:underline line-clamp-1"
                            >
                              {prod.name}
                            </Link>
                            <p className="text-xs text-slate-500 mt-0.5">
                              MOQ: {prod.moq} {prod.unit} · Available: {available} {prod.unit}
                            </p>
                            <p className="text-xs font-mono text-slate-700 mt-1">
                              Unit Price: {formatINR(unitPrice)} / {prod.unit}
                            </p>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                              <div className="inline-flex items-center border border-slate-300 rounded-lg bg-white">
                                <button
                                  type="button"
                                  disabled={updatingItemId === item.id || item.quantity <= prod.moq}
                                  onClick={() => updateQuantity(item, item.quantity - 1)}
                                  className="p-2 text-slate-600 hover:text-slate-900 disabled:opacity-40"
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min={prod.moq}
                                  max={available}
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (!Number.isNaN(val)) updateQuantity(item, val);
                                  }}
                                  className="w-16 text-center text-sm font-mono tabular-nums py-1 border-x border-slate-200 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={updatingItemId === item.id || item.quantity >= available}
                                  onClick={() => updateQuantity(item, item.quantity + 1)}
                                  className="p-2 text-slate-600 hover:text-slate-900 disabled:opacity-40"
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="flex items-center gap-4">
                                <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                                  {formatINR(lineTotal)}
                                </span>
                                <button
                                  type="button"
                                  disabled={updatingItemId === item.id}
                                  onClick={() => removeItem(item.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-700 rounded-md"
                                  aria-label="Remove from cart"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Checkout Form */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Delivery & Direct Payment Details</h2>

              <form onSubmit={handleCheckout} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Retailer Name *</label>
                    <input
                      type="text"
                      required
                      value={retailerName}
                      onChange={(e) => setRetailerName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Shop Name *</label>
                    <input
                      type="text"
                      required
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Contact Number *</label>
                    <input
                      type="tel"
                      required
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">PIN Code *</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={pinCode}
                      onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Delivery Address *</label>
                  <textarea
                    rows={2}
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Delivery / Pickup Preference *
                  </label>
                  <select
                    value={fulfillmentType}
                    onChange={(e) => setFulfillmentType(e.target.value as FulfillmentType)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="delivery">Supplier Delivery to Shop Address</option>
                    <option value="pickup">Self Pickup from Wholesaler Warehouse</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Direct Payment Method to Wholesaler *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="cod">Cash on Delivery (COD)</option>
                    <option value="upi_direct">UPI Paid Directly to Wholesaler</option>
                    <option value="bank_transfer">Bank Transfer Directly to Wholesaler</option>
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Payments are settled directly with each wholesaler. Orders remain marked as Unpaid until the
                    supplier confirms receipt.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Order Notes (Optional)</label>
                  <input
                    type="text"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Transport instructions, GST billing note..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="pt-4 border-t border-slate-200 space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Supplier Orders to Create</span>
                    <span className="font-mono font-semibold">{supplierGroups.length}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-slate-900">
                    <span>Grand Total</span>
                    <span className="font-mono tabular-nums">{formatINR(grandTotal)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60"
                >
                  {submitting ? 'Placing Supplier Orders...' : `Place ${supplierGroups.length} Order(s)`}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </MarketplaceLayout>
  );
}
