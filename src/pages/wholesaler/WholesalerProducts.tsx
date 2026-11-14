import React, { useCallback, useEffect, useState } from 'react';
import { Edit2, ImagePlus, Package, Plus, Trash2, X } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatINR, getAvailableStock, getPrimaryImageUrl } from '../../lib/formatters';
import { uploadUserImage, validateImageFile } from '../../lib/storage';
import type {
  AvailabilityStatus,
  Category,
  ListingStatus,
  Product,
  Subcategory,
} from '../../types/database';
import { ImageWithFallback } from '../../components/common/ImageWithFallback';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';
import { ConfirmModal } from '../../components/common/ConfirmModal';

interface TierInput {
  min_qty: string;
  max_qty: string;
  unit_price: string;
}

export function WholesalerProducts() {
  const { user, business } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal state for Add / Edit
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [sku, setSku] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [moq, setMoq] = useState('1');
  const [availableStock, setAvailableStock] = useState('0');
  const [unit, setUnit] = useState('piece');
  const [availabilityStatus, setAvailabilityStatus] = useState<AvailabilityStatus>('in_stock');
  const [listingStatus, setListingStatus] = useState<ListingStatus>('draft');

  const [tiers, setTiers] = useState<TierInput[]>([]);
  const [existingImages, setExistingImages] = useState<{ id: string; image_url: string; is_primary: boolean }[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const [{ data: prodData, error: pErr }, { data: catData }, { data: subData }] = await Promise.all([
        supabase
          .from('products')
          .select(
            `
            *,
            categories(id, name),
            subcategories(id, name),
            product_images(id, image_url, is_primary, sort_order),
            inventory(available_stock, reserved_stock),
            pricing_tiers(id, min_qty, max_qty, unit_price)
          `
          )
          .eq('wholesaler_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('subcategories').select('*').eq('is_active', true).order('name'),
      ]);

      if (pErr) throw pErr;
      setProducts((prodData as Product[]) || []);
      setCategories((catData as Category[]) || []);
      setSubcategories((subData as Subcategory[]) || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load products.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAddForm = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setCategoryId(categories[0]?.id || '');
    setSubcategoryId('');
    setBrand('');
    setSku('');
    setWholesalePrice('');
    setMoq('1');
    setAvailableStock('0');
    setUnit('piece');
    setAvailabilityStatus('in_stock');
    setListingStatus('draft');
    setTiers([]);
    setExistingImages([]);
    setNewImageFiles([]);
    setError(null);
    setFormOpen(true);
  };

  const openEditForm = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description);
    setCategoryId(product.category_id || '');
    setSubcategoryId(product.subcategory_id || '');
    setBrand(product.brand || '');
    setSku(product.sku);
    setWholesalePrice(String(product.wholesale_price));
    setMoq(String(product.moq));
    setAvailableStock(String(getAvailableStock(product)));
    setUnit(product.unit);
    setAvailabilityStatus(product.availability_status);
    setListingStatus(product.listing_status);
    setTiers(
      (product.pricing_tiers || [])
        .sort((a, b) => a.min_qty - b.min_qty)
        .map((t) => ({
          min_qty: String(t.min_qty),
          max_qty: t.max_qty === null ? '' : String(t.max_qty),
          unit_price: String(t.unit_price),
        }))
    );
    setExistingImages(
      [...(product.product_images || [])].sort((a, b) => a.sort_order - b.sort_order)
    );
    setNewImageFiles([]);
    setError(null);
    setFormOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const err = validateImageFile(file);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);
    setNewImageFiles((prev) => [...prev, ...files]);
  };

  const handleRemoveExistingImage = async (imgId: string) => {
    try {
      const supabase = requireSupabase();
      const { error: delErr } = await supabase.from('product_images').delete().eq('id', imgId);
      if (delErr) throw delErr;
      setExistingImages((prev) => prev.filter((i) => i.id !== imgId));
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to remove image.'));
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !business?.id) {
      setError('Wholesaler business profile not found.');
      return;
    }

    const priceNum = Number(wholesalePrice);
    const moqNum = parseInt(moq, 10);
    const stockNum = parseInt(availableStock, 10);

    if (Number.isNaN(priceNum) || priceNum <= 0) {
      setError('Wholesale price must be greater than zero.');
      return;
    }
    if (Number.isNaN(moqNum) || moqNum < 1) {
      setError('Minimum order quantity (MOQ) must be at least 1.');
      return;
    }
    if (Number.isNaN(stockNum) || stockNum < 0) {
      setError('Available stock cannot be negative.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const supabase = requireSupabase();
      let productId = editingProduct?.id;

      const payload = {
        wholesaler_id: user.id,
        business_id: business.id,
        category_id: categoryId || null,
        subcategory_id: subcategoryId || null,
        name: name.trim(),
        description: description.trim(),
        brand: brand.trim() || null,
        sku: sku.trim(),
        wholesale_price: priceNum,
        moq: moqNum,
        unit: unit.trim() || 'piece',
        availability_status: stockNum === 0 && availabilityStatus === 'in_stock' ? 'out_of_stock' : availabilityStatus,
        listing_status: listingStatus,
      };

      if (editingProduct) {
        const { error: updErr } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id)
          .eq('wholesaler_id', user.id);
        if (updErr) throw updErr;

        // Adjust stock difference atomically if changed
        const prevStock = getAvailableStock(editingProduct);
        const delta = stockNum - prevStock;
        if (delta !== 0) {
          const { error: stockErr } = await supabase.rpc('adjust_product_stock', {
            p_product_id: editingProduct.id,
            p_delta: delta,
            p_movement_type: 'adjustment',
            p_note: 'Updated via product editor',
          });
          if (stockErr) throw stockErr;
        }
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('products')
          .insert(payload)
          .select('id')
          .single();
        if (insErr) throw insErr;
        productId = inserted.id;

        // Create inventory record + initial stock movement
        const { error: invErr } = await supabase.from('inventory').insert({
          product_id: productId,
          wholesaler_id: user.id,
          available_stock: 0,
          reserved_stock: 0,
        });
        if (invErr) throw invErr;

        if (stockNum > 0) {
          const { error: adjErr } = await supabase.rpc('adjust_product_stock', {
            p_product_id: productId,
            p_delta: stockNum,
            p_movement_type: 'initial',
            p_note: 'Initial product stock',
          });
          if (adjErr) throw adjErr;
        }
      }

      // Sync Bulk Pricing Tiers
      if (productId) {
        await supabase.from('pricing_tiers').delete().eq('product_id', productId);
        const validTiers = tiers
          .filter((t) => Number(t.min_qty) >= 1 && Number(t.unit_price) > 0)
          .map((t) => ({
            product_id: productId,
            min_qty: parseInt(t.min_qty, 10),
            max_qty: t.max_qty.trim() ? parseInt(t.max_qty, 10) : null,
            unit_price: Number(t.unit_price),
          }));

        if (validTiers.length > 0) {
          const { error: tierErr } = await supabase.from('pricing_tiers').insert(validTiers);
          if (tierErr) throw tierErr;
        }

        // Upload new product images
        for (let i = 0; i < newImageFiles.length; i++) {
          const file = newImageFiles[i];
          const { publicUrl, storagePath } = await uploadUserImage(
            'product-images',
            user.id,
            file,
            productId
          );
          const isPrimary = existingImages.length === 0 && i === 0;
          await supabase.from('product_images').insert({
            product_id: productId,
            image_url: publicUrl,
            storage_path: storagePath,
            is_primary: isPrimary,
            sort_order: existingImages.length + i,
          });
        }
      }

      setFormOpen(false);
      setSuccessMsg(editingProduct ? 'Product updated successfully.' : 'Product saved successfully.');
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to save product.'));
    } finally {
      setSaving(false);
    }
  };

  const togglePublishStatus = async (product: Product) => {
    if (!user?.id) return;
    setError(null);
    setSuccessMsg(null);
    const nextStatus: ListingStatus = product.listing_status === 'published' ? 'unpublished' : 'published';
    try {
      const supabase = requireSupabase();
      const { error: updErr } = await supabase
        .from('products')
        .update({ listing_status: nextStatus })
        .eq('id', product.id)
        .eq('wholesaler_id', user.id);
      if (updErr) throw updErr;
      setSuccessMsg(`"${product.name}" is now ${nextStatus}.`);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not change product listing status.'));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !user?.id) return;
    setDeleting(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const { error: delErr } = await supabase
        .from('products')
        .delete()
        .eq('id', deleteTarget.id)
        .eq('wholesaler_id', user.id);
      if (delErr) throw delErr;
      setDeleteTarget(null);
      setSuccessMsg('Product deleted permanently.');
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Cannot delete product (it may be referenced by existing orders; unpublish it instead).'));
    } finally {
      setDeleting(false);
    }
  };

  const filteredSubs = subcategories.filter((s) => s.category_id === categoryId);

  return (
    <DashboardLayout title="Wholesaler Product Management">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <p className="text-sm text-slate-600">
          Create listings, configure bulk pricing tiers, and upload multi-image product galleries.
        </p>
        <button
          type="button"
          onClick={openAddForm}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Product</span>
        </button>
      </div>

      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {successMsg && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900">
          {successMsg}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading your wholesale catalog..." />
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Package className="w-6 h-6" strokeWidth={1.5} />}
          title="No products available yet."
          description="Add your first wholesale product with pricing tiers and stock levels to start receiving retailer orders."
          action={
            <button
              type="button"
              onClick={openAddForm}
              className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg"
            >
              Add First Product
            </button>
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold">Product</th>
                  <th className="text-left py-3 px-4 font-semibold">SKU & Category</th>
                  <th className="text-right py-3 px-4 font-semibold">Wholesale Price</th>
                  <th className="text-right py-3 px-4 font-semibold">MOQ / Stock</th>
                  <th className="text-left py-3 px-4 font-semibold">Status</th>
                  <th className="text-right py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((prod) => {
                  const stock = getAvailableStock(prod);
                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                            <ImageWithFallback src={getPrimaryImageUrl(prod)} alt={prod.name} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate max-w-[220px]">{prod.name}</p>
                            <p className="text-xs text-slate-500">{prod.brand || 'Unbranded'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-mono text-xs text-slate-800">{prod.sku}</p>
                        <p className="text-xs text-slate-500">{prod.categories?.name || 'Uncategorized'}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatINR(prod.wholesale_price)}
                        <span className="block text-xs font-sans font-normal text-slate-500">per {prod.unit}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                        <p className="text-slate-900 font-semibold">Stock: {stock}</p>
                        <p className="text-slate-500">MOQ: {prod.moq}</p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={prod.is_removed ? 'rejected' : prod.listing_status} />
                          <StatusBadge status={prod.availability_status} />
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => togglePublishStatus(prod)}
                            className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-100"
                          >
                            {prod.listing_status === 'published' ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditForm(prod)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md"
                            aria-label="Edit product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(prod)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 border border-rose-200 rounded-md"
                            aria-label="Delete product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                {editingProduct ? `Edit Product: ${editingProduct.name}` : 'Add Wholesale Product'}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Basmati Rice 25kg Commercial Sack"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
                  <select
                    required
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      setSubcategoryId('');
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Subcategory</label>
                  <select
                    value={subcategoryId}
                    onChange={(e) => setSubcategoryId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Select Subcategory</option>
                    {filteredSubs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Brand or manufacturer"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">SKU *</label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    placeholder="e.g., OM-GR-1001"
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Product Description *</label>
                  <textarea
                    rows={3}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Specifications, packaging details, shelf life, warranty, and dispatch terms..."
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Base Wholesale Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value)}
                    placeholder="e.g., 100.00"
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Unit *</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="piece">piece</option>
                    <option value="box">box</option>
                    <option value="pack">pack</option>
                    <option value="dozen">dozen</option>
                    <option value="kg">kg</option>
                    <option value="liter">liter</option>
                    <option value="set">set</option>
                    <option value="carton">carton</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Minimum Order Quantity (MOQ) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={moq}
                    onChange={(e) => setMoq(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Available Stock *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={availableStock}
                    onChange={(e) => setAvailableStock(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Availability *</label>
                  <select
                    value={availabilityStatus}
                    onChange={(e) => setAvailabilityStatus(e.target.value as AvailabilityStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="in_stock">In Stock</option>
                    <option value="out_of_stock">Out of Stock</option>
                    <option value="made_to_order">Made to Order</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Listing Status *</label>
                  <select
                    value={listingStatus}
                    onChange={(e) => setListingStatus(e.target.value as ListingStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="draft">Draft (Hidden)</option>
                    <option value="published">Published (Visible in Marketplace)</option>
                    <option value="unpublished">Unpublished</option>
                  </select>
                </div>
              </div>

              {/* Quantity-Based Bulk Pricing Tiers */}
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Bulk Pricing Tiers (Optional)</h3>
                    <p className="text-xs text-slate-500">
                      Example: 1–10 pieces ₹100, 11–50 pieces ₹90, 51+ pieces ₹80.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTiers((prev) => [...prev, { min_qty: '', max_qty: '', unit_price: '' }])}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    + Add Tier
                  </button>
                </div>

                {tiers.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {tiers.map((tier, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <input
                          type="number"
                          min={1}
                          placeholder="Min Qty"
                          value={tier.min_qty}
                          onChange={(e) =>
                            setTiers((prev) =>
                              prev.map((t, i) => (i === idx ? { ...t, min_qty: e.target.value } : t))
                            )
                          }
                          className="col-span-3 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                        />
                        <input
                          type="number"
                          min={1}
                          placeholder="Max Qty (blank = ∞)"
                          value={tier.max_qty}
                          onChange={(e) =>
                            setTiers((prev) =>
                              prev.map((t, i) => (i === idx ? { ...t, max_qty: e.target.value } : t))
                            )
                          }
                          className="col-span-4 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Unit Price (₹)"
                          value={tier.unit_price}
                          onChange={(e) =>
                            setTiers((prev) =>
                              prev.map((t, i) => (i === idx ? { ...t, unit_price: e.target.value } : t))
                            )
                          }
                          className="col-span-4 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => setTiers((prev) => prev.filter((_, i) => i !== idx))}
                          className="col-span-1 p-1.5 text-rose-600 hover:text-rose-800"
                          aria-label="Remove tier"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Multi-Image Upload */}
              <div className="pt-4 border-t border-slate-200">
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Product Photographs (JPG, PNG, WEBP up to 5MB each)
                </label>

                {existingImages.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-3">
                    {existingImages.map((img) => (
                      <div key={img.id} className="relative w-20 h-20 rounded-lg border border-slate-200 overflow-hidden">
                        <img src={img.image_url} alt="Product" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingImage(img.id)}
                          className="absolute top-1 right-1 bg-slate-900/80 text-white rounded-full p-0.5"
                          aria-label="Delete image"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <label className="flex items-center justify-center gap-2 px-4 py-4 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 text-sm text-slate-600">
                  <ImagePlus className="w-4 h-4" />
                  <span>
                    {newImageFiles.length > 0
                      ? `${newImageFiles.length} new image(s) queued for upload`
                      : 'Upload one or more product photos'}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageSelect}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete Product Listing?"
        message={`Are you sure you want to permanently delete "${deleteTarget?.name}"? Products with existing order history should be unpublished instead.`}
        confirmLabel="Delete Product"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
