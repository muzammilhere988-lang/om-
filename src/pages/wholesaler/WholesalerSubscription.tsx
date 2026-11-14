import React, { useCallback, useEffect, useState } from 'react';
import { Check, CreditCard } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDate, formatINR } from '../../lib/formatters';
import type { PaymentRecord, Subscription, SubscriptionPlan } from '../../types/database';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingState } from '../../components/common/LoadingState';

export function WholesalerSubscription() {
  const { user, refreshProfile } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [publishedCount, setPublishedCount] = useState<number>(0);

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'upi_direct' | 'bank_transfer'>('upi_direct');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadSubscriptionData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const [
        { data: planData, error: plErr },
        { data: subData, error: suErr },
        { data: payData, error: paErr },
        { count: activeProdCount },
      ] = await Promise.all([
        supabase.from('subscription_plans').select('*').eq('is_active', true).order('price_inr'),
        supabase
          .from('subscriptions')
          .select('*, subscription_plans(*)')
          .eq('wholesaler_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('payments')
          .select('*')
          .eq('payer_id', user.id)
          .eq('payment_purpose', 'subscription')
          .order('created_at', { ascending: false }),
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('wholesaler_id', user.id)
          .eq('listing_status', 'published')
          .eq('is_removed', false),
      ]);

      if (plErr) throw plErr;
      if (suErr) throw suErr;
      if (paErr) throw paErr;

      setPlans((planData as SubscriptionPlan[]) || []);
      setSubscriptions((subData as Subscription[]) || []);
      setPayments((payData as PaymentRecord[]) || []);
      setPublishedCount(activeProdCount ?? 0);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load subscription details.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadSubscriptionData();
  }, [loadSubscriptionData]);

  const handleSubmitSubscriptionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !user?.id) return;
    if (!referenceNumber.trim()) {
      setError('Please enter your UPI UTR or Bank transfer reference number for verification.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const supabase = requireSupabase();
      const { data: newSub, error: subErr } = await supabase
        .from('subscriptions')
        .insert({
          wholesaler_id: user.id,
          plan_id: selectedPlan.id,
          status: 'pending',
        })
        .select('id')
        .single();

      if (subErr) throw subErr;

      const { error: payErr } = await supabase.from('payments').insert({
        payer_id: user.id,
        payment_purpose: 'subscription',
        subscription_id: newSub.id,
        amount: selectedPlan.price_inr,
        currency: 'INR',
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim(),
        status: 'pending_verification',
        notes: `Submitted by wholesaler for ${selectedPlan.name}`,
      });

      if (payErr) throw payErr;

      setSelectedPlan(null);
      setReferenceNumber('');
      setSuccessMsg(
        'Subscription request and payment reference submitted. Your plan will activate once verified by the OM administrator.'
      );
      await Promise.all([loadSubscriptionData(), refreshProfile()]);
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to submit subscription request.'));
    } finally {
      setSubmitting(false);
    }
  };

  const currentSub = subscriptions.find((s) => s.status === 'active') || subscriptions[0] || null;
  const maxLimit = currentSub?.subscription_plans?.max_active_products ?? 0;

  return (
    <DashboardLayout title="Wholesaler Subscription & Billing">
      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {successMsg && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900">
          {successMsg}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading subscription plans..." />
      ) : (
        <div className="space-y-8">
          {/* Current Subscription Status */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Current Plan Status</p>
                {currentSub ? (
                  <>
                    <div className="flex items-center gap-3 mt-1.5">
                      <h2 className="text-xl font-bold text-slate-900">
                        {currentSub.subscription_plans?.name || 'Subscription Plan'}
                      </h2>
                      <StatusBadge status={currentSub.status} size="md" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                      <span>Start Date: {formatDate(currentSub.start_date)}</span>
                      <span>Expiry Date: {formatDate(currentSub.expiry_date)}</span>
                      <span>Grace Period Until: {formatDate(currentSub.grace_until)}</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-base font-semibold text-slate-900">Your subscription is not active.</p>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-right">
                <p className="text-xs text-slate-500">Published Products Usage</p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {publishedCount} / {currentSub?.status === 'active' ? maxLimit : 0}
                </p>
              </div>
            </div>
          </div>

          {/* Available Monthly Plans */}
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-4">Monthly Wholesaler Plans</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between"
                >
                  <div>
                    <p className="text-xs font-mono font-semibold text-teal-800">{plan.code}</p>
                    <h3 className="text-lg font-bold text-slate-900 mt-1">{plan.name}</h3>
                    <p className="text-xs text-slate-600 mt-1">{plan.description}</p>
                    <div className="mt-4 pb-4 border-b border-slate-200">
                      <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                        {formatINR(plan.price_inr)}
                      </span>
                      <span className="text-xs text-slate-500"> / {plan.billing_cycle_days} days</span>
                    </div>
                    <p className="mt-4 text-xs font-semibold text-slate-900">
                      Limit: Up to {plan.max_active_products.toLocaleString('en-IN')} active products
                    </p>
                    <ul className="mt-3 space-y-2 text-xs text-slate-600">
                      {(plan.features || []).map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className="mt-6 w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800"
                  >
                    {currentSub?.status === 'active' ? 'Upgrade / Renew with Plan' : 'Select Plan'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Payment History */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">Subscription Payment History</h2>
            </div>
            {payments.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No subscription payment records submitted yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold">Date</th>
                      <th className="text-left py-3 px-4 font-semibold">Method & Reference</th>
                      <th className="text-right py-3 px-4 font-semibold">Amount</th>
                      <th className="text-left py-3 px-4 font-semibold">Verification Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((pay) => (
                      <tr key={pay.id}>
                        <td className="py-3 px-4 text-xs text-slate-600">{formatDate(pay.created_at)}</td>
                        <td className="py-3 px-4">
                          <p className="text-xs font-semibold uppercase text-slate-800">
                            {pay.payment_method.replace('_', ' ')}
                          </p>
                          <p className="text-xs font-mono text-slate-500">Ref: {pay.reference_number || '—'}</p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                          {formatINR(pay.amount)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={pay.status} />
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

      {/* Submit Subscription Payment Verification Modal */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <CreditCard className="w-5 h-5 text-slate-900" />
              <h3 className="text-lg font-bold text-slate-900">Subscribe: {selectedPlan.name}</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Plan fee: <strong className="font-mono">{formatINR(selectedPlan.price_inr)}</strong> for{' '}
              {selectedPlan.billing_cycle_days} days. Transfer the subscription fee to OM&apos;s designated account
              and submit your transaction reference below. Subscriptions are never marked paid until verified.
            </p>

            <form onSubmit={handleSubmitSubscriptionRequest} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'upi_direct' | 'bank_transfer')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="upi_direct">UPI Transfer</option>
                  <option value="bank_transfer">NEFT / IMPS / Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Transaction / UTR Reference Number *
                </label>
                <input
                  type="text"
                  required
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Enter 12-digit UTR or bank reference"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedPlan(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit for Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
