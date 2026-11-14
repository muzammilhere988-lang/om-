import React, { useCallback, useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDateTime, getAvailableStock } from '../../lib/formatters';
import type { Product, StockMovement } from '../../types/database';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';

export function WholesalerInventory() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<'restock' | 'manual_reduction'>('restock');
  const [adjustQty, setAdjustQty] = useState('10');
  const [adjustNote, setAdjustNote] = useState('');
  const [saving, setSaving] = useState(false);

  const loadInventory = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const [{ data: prods, error: pErr }, { data: movs, error: mErr }] = await Promise.all([
        supabase
          .from('products')
          .select('*, inventory(available_stock, reserved_stock, low_stock_threshold)')
          .eq('wholesaler_id', user.id)
          .order('name'),
        supabase
          .from('stock_movements')
          .select('*, products(name, sku, unit)')
          .eq('wholesaler_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      if (pErr) throw pErr;
      if (mErr) throw mErr;
      setProducts((prods as Product[]) || []);
      setMovements((movs as StockMovement[]) || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load inventory.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    const qty = parseInt(adjustQty, 10);
    if (Number.isNaN(qty) || qty <= 0) {
      setError('Quantity must be a positive number.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const supabase = requireSupabase();
      const delta = adjustType === 'restock' ? qty : -qty;
      const { error: rpcErr } = await supabase.rpc('adjust_product_stock', {
        p_product_id: adjustTarget.id,
        p_delta: delta,
        p_movement_type: adjustType,
        p_note: adjustNote.trim() || null,
      });
      if (rpcErr) throw rpcErr;
      setAdjustTarget(null);
      setAdjustNote('');
      setSuccessMsg('Inventory updated and movement recorded.');
      await loadInventory();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to adjust inventory.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Inventory & Stock Movements">
      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {successMsg && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900">
          {successMsg}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading inventory records..." />
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Boxes className="w-6 h-6" strokeWidth={1.5} />}
          title="No inventory items yet."
          description="Add products in your catalog to track available stock, reserved order stock, and movement logs."
        />
      ) : (
        <div className="space-y-8">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">Current Stock Levels</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold">Product</th>
                    <th className="text-left py-3 px-4 font-semibold">SKU</th>
                    <th className="text-right py-3 px-4 font-semibold">Available</th>
                    <th className="text-left py-3 px-4 font-semibold">Availability</th>
                    <th className="text-right py-3 px-4 font-semibold">Update Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => {
                    const stock = getAvailableStock(p);
                    return (
                      <tr key={p.id}>
                        <td className="py-3 px-4 font-medium text-slate-900">{p.name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{p.sku}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                          {stock} {p.unit}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={stock === 0 ? 'out_of_stock' : p.availability_status} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustTarget(p);
                              setAdjustType('restock');
                              setAdjustQty('10');
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-50"
                          >
                            Adjust Stock
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">Recent Stock Movement Audit Log</h2>
            </div>
            {movements.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No stock movements recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left py-2.5 px-4 font-semibold">Timestamp</th>
                      <th className="text-left py-2.5 px-4 font-semibold">Product</th>
                      <th className="text-left py-2.5 px-4 font-semibold">Type</th>
                      <th className="text-right py-2.5 px-4 font-semibold">Change</th>
                      <th className="text-right py-2.5 px-4 font-semibold">Balance</th>
                      <th className="text-left py-2.5 px-4 font-semibold">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                          {formatDateTime(m.created_at)}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">{m.products?.name || 'Product'}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{m.movement_type}</td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono font-semibold tabular-nums ${
                            m.change_amount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {m.change_amount >= 0 ? `+${m.change_amount}` : m.change_amount}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                          {m.new_stock}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{m.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-900">Adjust Stock: {adjustTarget.name}</h3>
            <p className="text-xs text-slate-500 mt-1">
              Current available stock: {getAvailableStock(adjustTarget)} {adjustTarget.unit}
            </p>
            <form onSubmit={handleAdjustStock} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Action Type *</label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value as 'restock' | 'manual_reduction')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="restock">Add Stock (Restock)</option>
                  <option value="manual_reduction">Reduce Stock (Damage / Offline Sale)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quantity *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reason / Note</label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="e.g., New warehouse batch received"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg disabled:opacity-60"
                >
                  {saving ? 'Updating...' : 'Save Stock Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
