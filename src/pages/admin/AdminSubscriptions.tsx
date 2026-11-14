import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Edit2, Plus } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDate, formatINR } from '../../lib/formatters';
import type { PaymentRecord, Subscription, SubscriptionPlan } from '../../types/database';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingState } from '../../components/common/LoadingState';

interface SubWithPayment extends Subscription {
  payments?: PaymentRecord[];
}

export function AdminSubscriptions() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubWithPayment[]>([]);
  const [paymentsBySub, setPaymentsBySub] = useState<Record<string, PaymentRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Plan edit modal
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [planCode, setPlanCode] = useState('');
  const [planName, setPlanName] = useState('');
  const [planPrice, setPlanPrice] = useState('');
  const [planLimit, setPlanLimit] = useState('');
  const [planGrace, setPlanGrace] = useState('3');
  const [savingPlan, setSavingPlan] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const [{ data: pData, error: pErr }, { data: sData, error: sErr }, { data: payData }] =
        await Promise.all([
          supabase.from('subscription_plans').select('*').order('price_inr'),
          supabase
            .from('subscriptions')
            .select('*, subscription_plans(*), profiles(id, full_name, email)')
            .order('created_at', { ascending: false }),
          supabase.from('payments').select('*').eq('payment_purpose', 'subscription'),
        ]);

      if (pErr) throw pErr;
      if (sErr) throw sErr;
      setPlans((pData as SubscriptionPlan[]) || []);
      setSubscriptions((sData as SubWithPayment[]) || []);

      const map: Record<string, PaymentRecord> = {};
      for (const pay of (payData as PaymentRecord[]) || []) {
        if (pay.subscription_id) map[pay.subscription_id] = pay;
      }
      setPaymentsBySub(map);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load subscription management data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNewPlan = () => {
    setEditingPlan(null);
    setPlanCode('');
    setPlanName('');
    setPlanPrice('');
    setPlanLimit('');
    setPlanGrace('3');
    setPlanFormOpen(true);
  };

  const openEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setPlanCode(plan.code);
    setPlanName(plan.name);
    setPlanPrice(String(plan.price_inr));
    setPlanLimit(String(plan.max_active_products));
    setPlanGrace(String(plan.grace_period_days));
    setPlanFormOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPlan(true);
    setError(null);
    setMsg(null);
    try {
      const supabase = requireSupabase();
      const payload = {
        code: planCode.trim().toUpperCase(),
        name: planName.trim(),
        price_inr: Number(planPrice),
        max_active_products: parseInt(planLimit, 10),
        grace_period_days: parseInt(planGrace, 10),
      };
      if (editingPlan) {
        const { error: updErr } = await supabase
          .from('subscription_plans')
          .update(payload)
          .eq('id', editingPlan.id);
        if (updErr) throw updErr;
        setMsg(`Updated plan "${payload.name}".`);
      } else {
        const { error: insErr } = await supabase.from('subscription_plans').insert(payload);
        if (insErr) throw insErr;
        setMsg(`Created plan "${payload.name}".`);
      }
      setPlanFormOpen(false);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to save subscription plan.'));
    } finally {
      setSavingPlan(false);
    }
  };

  const handleVerifySubscription = async (
    sub: SubWithPayment,
    action: 'approve' | 'reject' | 'suspend'
  ) => {
    setError(null);
    setMsg(null);
    try {
      const supabase = requireSupabase();
      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData.session?.access_token;

      let handled = false;
      if (token) {
        const resp = await fetch(`/api/admin/subscriptions/${sub.id}/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action }),
        });
        if (resp.ok) handled = true;
      }

      if (!handled) {
        if (action === 'approve') {
          const now = new Date();
          const cycleDays = sub.subscription_plans?.billing_cycle_days || 30;
          const graceDays = sub.subscription_plans?.grace_period_days || 3;
          const expiry = new Date(now.getTime() + cycleDays * 86400000);
          const grace = new Date(expiry.getTime() + graceDays * 86400000);

          const { error: subErr } = await supabase
            .from('subscriptions')
            .update({
              status: 'active',
              start_date: now.toISOString(),
              expiry_date: expiry.toISOString(),
              grace_until: grace.toISOString(),
            })
            .eq('id', sub.id);
          if (subErr) throw subErr;

          await supabase
            .from('payments')
            .update({ status: 'verified', verified_at: now.toISOString() })
            .eq('subscription_id', sub.id);
        } else if (action === 'reject') {
          await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', sub.id);
          await supabase.from('payments').update({ status: 'rejected' }).eq('subscription_id', sub.id);
        } else {
          await supabase.from('subscriptions').update({ status: 'suspended' }).eq('id', sub.id);
        }
      }

      setMsg(`Subscription ${action} completed.`);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to update subscription.'));
    }
  };

  return (
    <DashboardLayout title="Subscription Plans & Payment Verification">
      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {msg && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900">
          {msg}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading subscription plans and accounts..." />
      ) : (
        <div className="space-y-8">
          {/* Plans Configuration */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Wholesaler Subscription Plans</h2>
              <button
                type="button"
                onClick={openNewPlan}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
              >
                <Plus className="w-4 h-4" />
                <span>Create Plan</span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((p) => (
                <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-mono font-semibold text-teal-800">{p.code}</p>
                      <h3 className="text-base font-bold text-slate-900">{p.name}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditPlan(p)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-md"
                      aria-label="Edit plan"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-3 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {formatINR(p.price_inr)} <span className="text-xs font-sans font-normal text-slate-500">/ mo</span>
                  </p>
                  <p className="mt-2 text-xs text-slate-600">
                    Max Active Products: <strong>{p.max_active_products.toLocaleString('en-IN')}</strong> · Grace:{' '}
                    {p.grace_period_days} days
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Wholesaler Subscriptions Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-600" />
              <h2 className="text-base font-bold text-slate-900">
                Wholesaler Subscriptions ({subscriptions.length})
              </h2>
            </div>

            {subscriptions.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No wholesaler subscriptions created yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold">Wholesaler</th>
                      <th className="text-left py-3 px-4 font-semibold">Plan</th>
                      <th className="text-left py-3 px-4 font-semibold">Payment Ref</th>
                      <th className="text-left py-3 px-4 font-semibold">Validity</th>
                      <th className="text-left py-3 px-4 font-semibold">Status</th>
                      <th className="text-right py-3 px-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subscriptions.map((sub) => {
                      const pay = paymentsBySub[sub.id];
                      return (
                        <tr key={sub.id}>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{sub.profiles?.full_name || 'Wholesaler'}</p>
                            <p className="text-xs text-slate-500">{sub.profiles?.email}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900">{sub.subscription_plans?.name}</p>
                            <p className="text-xs font-mono text-slate-500">
                              {formatINR(sub.subscription_plans?.price_inr)}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {pay ? (
                              <div>
                                <p className="font-mono text-slate-900">{pay.reference_number || '—'}</p>
                                <StatusBadge status={pay.status} />
                              </div>
                            ) : (
                              <span className="text-slate-400">No payment record</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            <p>Start: {formatDate(sub.start_date)}</p>
                            <p>Expiry: {formatDate(sub.expiry_date)}</p>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={sub.status} />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {sub.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleVerifySubscription(sub, 'approve')}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-md"
                                  >
                                    Verify & Activate
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleVerifySubscription(sub, 'reject')}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 border border-rose-200 rounded-md"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {sub.status === 'active' && (
                                <button
                                  type="button"
                                  onClick={() => handleVerifySubscription(sub, 'suspend')}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 border border-rose-200 rounded-md"
                                >
                                  Suspend
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {planFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-900">
              {editingPlan ? `Edit Plan: ${editingPlan.name}` : 'Create Subscription Plan'}
            </h3>
            <form onSubmit={handleSavePlan} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Plan Code *</label>
                <input
                  type="text"
                  required
                  value={planCode}
                  onChange={(e) => setPlanCode(e.target.value.toUpperCase())}
                  placeholder="e.g., ENTERPRISE"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Plan Name *</label>
                <input
                  type="text"
                  required
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Monthly Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={planPrice}
                    onChange={(e) => setPlanPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Product Limit *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={planLimit}
                    onChange={(e) => setPlanLimit(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Grace Period (Days) *</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={planGrace}
                  onChange={(e) => setPlanGrace(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPlanFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPlan}
                  className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg disabled:opacity-60"
                >
                  {savingPlan ? 'Saving...' : 'Save Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
