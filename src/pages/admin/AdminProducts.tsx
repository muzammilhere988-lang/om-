import React, { useCallback, useEffect, useState } from 'react';
import { Package, Plus, Search, ShieldOff } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatINR, slugify } from '../../lib/formatters';
import type { Category, Product, Subcategory } from '../../types/database';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';

export function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // New category / subcategory inputs
  const [newCatName, setNewCatName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubCatId, setNewSubCatId] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const [{ data: prods, error: pErr }, { data: cats, error: cErr }, { data: subs, error: sErr }] =
        await Promise.all([
          supabase
            .from('products')
            .select('*, businesses(id, business_name), categories(id, name)')
            .order('created_at', { ascending: false }),
          supabase.from('categories').select('*').order('sort_order'),
          supabase.from('subcategories').select('*').order('name'),
        ]);
      if (pErr) throw pErr;
      if (cErr) throw cErr;
      if (sErr) throw sErr;
      setProducts((prods as Product[]) || []);
      const catList = (cats as Category[]) || [];
      setCategories(catList);
      setSubcategories((subs as Subcategory[]) || []);
      if (catList.length > 0 && !newSubCatId) {
        setNewSubCatId(catList[0].id);
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load products and taxonomy.'));
    } finally {
      setLoading(false);
    }
  }, [newSubCatId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const toggleProductRemoval = async (product: Product) => {
    setError(null);
    setMsg(null);
    try {
      const supabase = requireSupabase();
      const nextRemoved = !product.is_removed;
      const { error: updErr } = await supabase
        .from('products')
        .update({
          is_removed: nextRemoved,
          removal_reason: nextRemoved ? 'Removed by administrator for policy compliance' : null,
        })
        .eq('id', product.id);
      if (updErr) throw updErr;
      setMsg(nextRemoved ? `"${product.name}" removed from marketplace.` : `"${product.name}" restored.`);
      await loadAll();
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to update product status.'));
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setError(null);
    try {
      const supabase = requireSupabase();
      const { error: insErr } = await supabase.from('categories').insert({
        name: newCatName.trim(),
        slug: slugify(newCatName),
        sort_order: categories.length + 1,
      });
      if (insErr) throw insErr;
      setNewCatName('');
      setMsg('Category created.');
      await loadAll();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to create category.'));
    }
  };

  const handleAddSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim() || !newSubCatId) return;
    setError(null);
    try {
      const supabase = requireSupabase();
      const { error: insErr } = await supabase.from('subcategories').insert({
        category_id: newSubCatId,
        name: newSubName.trim(),
        slug: slugify(newSubName),
      });
      if (insErr) throw insErr;
      setNewSubName('');
      setMsg('Subcategory created.');
      await loadAll();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to create subcategory.'));
    }
  };

  const toggleCategoryActive = async (cat: Category) => {
    try {
      const supabase = requireSupabase();
      const { error: updErr } = await supabase
        .from('categories')
        .update({ is_active: !cat.is_active })
        .eq('id', cat.id);
      if (updErr) throw updErr;
      await loadAll();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to toggle category.'));
    }
  };

  const filteredProducts = products.filter((p) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      p.name.toLowerCase().includes(term) ||
      p.sku.toLowerCase().includes(term) ||
      (p.businesses?.business_name || '').toLowerCase().includes(term)
    );
  });

  return (
    <DashboardLayout title="Platform Products & Category Taxonomy">
      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {msg && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900">
          {msg}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading platform listings & taxonomy..." />
      ) : (
        <div className="space-y-8">
          {/* Dynamic Categories & Subcategories Management */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-base font-bold text-slate-900 mb-3">Marketplace Categories</h2>
              <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="New category name..."
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </form>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {categories.map((c) => (
                  <div key={c.id} className="px-3.5 py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleCategoryActive(c)}
                      className={`text-xs font-medium px-2.5 py-1 rounded border ${
                        c.is_active
                          ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                          : 'text-slate-600 bg-slate-100 border-slate-200'
                      }`}
                    >
                      {c.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-base font-bold text-slate-900 mb-3">Subcategories</h2>
              <form onSubmit={handleAddSubcategory} className="flex flex-wrap gap-2 mb-4">
                <select
                  value={newSubCatId}
                  onChange={(e) => setNewSubCatId(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="New subcategory name..."
                  className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </form>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {subcategories.map((s) => {
                  const parent = categories.find((c) => c.id === s.category_id);
                  return (
                    <div key={s.id} className="px-3.5 py-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{s.name}</span>
                      <span className="text-slate-500">{parent?.name || 'Category'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* All Platform Products */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">All Marketplace Listings ({filteredProducts.length})</h2>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product, SKU, or supplier..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Package className="w-6 h-6" strokeWidth={1.5} />}
                  title="No products available yet."
                  description="Products created by wholesalers will appear here for administrative oversight."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold">Product & SKU</th>
                      <th className="text-left py-3 px-4 font-semibold">Wholesaler</th>
                      <th className="text-right py-3 px-4 font-semibold">Price</th>
                      <th className="text-left py-3 px-4 font-semibold">Status</th>
                      <th className="text-right py-3 px-4 font-semibold">Moderation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{p.name}</p>
                          <p className="text-xs font-mono text-slate-500">
                            {p.sku} · {p.categories?.name || 'General'}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{p.businesses?.business_name || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                          {formatINR(p.wholesale_price)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={p.is_removed ? 'rejected' : p.listing_status} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => toggleProductRemoval(p)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                              p.is_removed
                                ? 'text-teal-800 border-teal-200 hover:bg-teal-50'
                                : 'text-rose-700 border-rose-200 hover:bg-rose-50'
                            }`}
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                            <span>{p.is_removed ? 'Restore Listing' : 'Remove Prohibited'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
