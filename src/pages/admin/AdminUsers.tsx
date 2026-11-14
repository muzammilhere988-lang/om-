import { useCallback, useEffect, useState } from 'react';
import { Eye, Search, Users } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatDate } from '../../lib/formatters';
import type { Business, Profile } from '../../types/database';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';
import { ConfirmModal } from '../../components/common/ConfirmModal';

interface UserWithBusiness extends Profile {
  businesses?: Business[] | Business | null;
}

export function AdminUsers() {
  const [users, setUsers] = useState<UserWithBusiness[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'WHOLESALER' | 'RETAILER' | 'ADMIN'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [inspectUser, setInspectUser] = useState<UserWithBusiness | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'suspend' | 'activate' | 'approve_biz' | 'reject_biz';
    user: UserWithBusiness;
    business?: Business;
  } | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('*, businesses(*)')
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setUsers((data as UserWithBusiness[]) || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load platform users.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const getBiz = (u: UserWithBusiness): Business | null => {
    if (!u.businesses) return null;
    return Array.isArray(u.businesses) ? u.businesses[0] || null : u.businesses;
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;
    setProcessing(true);
    setError(null);
    setActionMsg(null);
    try {
      const supabase = requireSupabase();
      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData.session?.access_token;

      if (confirmAction.type === 'suspend' || confirmAction.type === 'activate') {
        const nextStatus = confirmAction.type === 'suspend' ? 'suspended' : 'active';
        let handled = false;
        if (token) {
          const resp = await fetch(`/api/admin/users/${confirmAction.user.id}/status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ account_status: nextStatus }),
          });
          if (resp.ok) handled = true;
        }
        if (!handled) {
          const { error: updErr } = await supabase
            .from('profiles')
            .update({ account_status: nextStatus })
            .eq('id', confirmAction.user.id);
          if (updErr) throw updErr;
        }
        setActionMsg(`User account marked as ${nextStatus}.`);
      } else if (confirmAction.business) {
        const nextBizStatus = confirmAction.type === 'approve_biz' ? 'approved' : 'rejected';
        let handled = false;
        if (token) {
          const resp = await fetch(`/api/admin/wholesalers/${confirmAction.business.id}/approval`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status: nextBizStatus }),
          });
          if (resp.ok) handled = true;
        }
        if (!handled) {
          const { error: updErr } = await supabase
            .from('businesses')
            .update({
              verification_status: nextBizStatus,
              approved_at: nextBizStatus === 'approved' ? new Date().toISOString() : null,
            })
            .eq('id', confirmAction.business.id);
          if (updErr) throw updErr;
        }
        setActionMsg(`Wholesaler "${confirmAction.business.business_name}" ${nextBizStatus}.`);
      }

      setConfirmAction(null);
      await loadUsers();
    } catch (err) {
      setError(extractErrorMessage(err, 'Administrative operation failed.'));
    } finally {
      setProcessing(false);
    }
  };

  const filtered = users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    const biz = getBiz(u);
    return (
      u.full_name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (biz?.business_name || '').toLowerCase().includes(term) ||
      (biz?.city || '').toLowerCase().includes(term)
    );
  });

  return (
    <DashboardLayout title="User & Wholesaler Approval Management">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
          {(['ALL', 'WHOLESALER', 'RETAILER', 'ADMIN'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                roleFilter === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, business, or city..."
            className="w-full pl-10 pr-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          />
        </div>
      </div>

      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
      )}
      {actionMsg && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900">
          {actionMsg}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading registered users..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" strokeWidth={1.5} />}
          title="No users found."
          description="Registered wholesalers and retailers will appear here once created."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold">User & Contact</th>
                  <th className="text-left py-3 px-4 font-semibold">Role</th>
                  <th className="text-left py-3 px-4 font-semibold">Business / Shop</th>
                  <th className="text-left py-3 px-4 font-semibold">Account Status</th>
                  <th className="text-right py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => {
                  const biz = getBiz(u);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{u.full_name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                        <p className="text-xs font-mono text-slate-500">{u.mobile || '—'}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-mono font-semibold text-slate-800">{u.role}</span>
                      </td>
                      <td className="py-3 px-4">
                        {biz ? (
                          <div>
                            <p className="font-medium text-slate-900">{biz.business_name}</p>
                            <p className="text-xs text-slate-500">
                              {biz.city}, {biz.state}
                            </p>
                            {u.role === 'WHOLESALER' && (
                              <div className="mt-1">
                                <StatusBadge status={biz.verification_status} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No business profile</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={u.account_status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setInspectUser(u)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md"
                            aria-label="View profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {u.role === 'WHOLESALER' && biz && biz.verification_status !== 'approved' && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({ type: 'approve_biz', user: u, business: biz })
                              }
                              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-md hover:bg-emerald-800"
                            >
                              Approve Seller
                            </button>
                          )}

                          {u.role === 'WHOLESALER' && biz && biz.verification_status === 'pending' && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({ type: 'reject_biz', user: u, business: biz })
                              }
                              className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 border border-rose-200 rounded-md hover:bg-rose-50"
                            >
                              Reject
                            </button>
                          )}

                          {u.role !== 'ADMIN' && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  type: u.account_status === 'active' ? 'suspend' : 'activate',
                                  user: u,
                                })
                              }
                              className={`px-2.5 py-1.5 text-xs font-medium border rounded-md ${
                                u.account_status === 'active'
                                  ? 'text-rose-700 border-rose-200 hover:bg-rose-50'
                                  : 'text-teal-800 border-teal-200 hover:bg-teal-50'
                              }`}
                            >
                              {u.account_status === 'active' ? 'Suspend' : 'Reactivate'}
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
        </div>
      )}

      {/* Profile Inspection Modal */}
      {inspectUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-900">{inspectUser.full_name}</h3>
            <p className="text-xs text-slate-500">
              {inspectUser.role} · Joined {formatDate(inspectUser.created_at)}
            </p>
            <dl className="mt-4 space-y-2 text-sm border-t border-slate-200 pt-4">
              <div className="flex justify-between">
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium text-slate-900">{inspectUser.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Mobile</dt>
                <dd className="font-mono text-slate-900">{inspectUser.mobile || '—'}</dd>
              </div>
              {getBiz(inspectUser) && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Business Name</dt>
                    <dd className="font-medium text-slate-900">{getBiz(inspectUser)!.business_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Category</dt>
                    <dd className="text-slate-900">{getBiz(inspectUser)!.business_category}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">GSTIN</dt>
                    <dd className="font-mono text-slate-900">{getBiz(inspectUser)!.gst_number || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Address</dt>
                    <dd className="text-slate-900 mt-0.5">
                      {getBiz(inspectUser)!.address}, {getBiz(inspectUser)!.city},{' '}
                      {getBiz(inspectUser)!.state} – {getBiz(inspectUser)!.pin_code}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectUser(null)}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(confirmAction)}
        title={
          confirmAction?.type === 'approve_biz'
            ? 'Approve Wholesaler Business?'
            : confirmAction?.type === 'reject_biz'
            ? 'Reject Wholesaler Application?'
            : confirmAction?.type === 'suspend'
            ? 'Suspend User Account?'
            : 'Reactivate User Account?'
        }
        message={
          confirmAction?.type === 'approve_biz'
            ? `Approving "${confirmAction.business?.business_name}" allows them to publish wholesale products directly to the common marketplace.`
            : confirmAction?.type === 'reject_biz'
            ? `Rejecting "${confirmAction.business?.business_name}" prevents them from listing products on OM.`
            : confirmAction?.type === 'suspend'
            ? `Suspending ${confirmAction.user.full_name} immediately blocks their dashboard access and hides their listings.`
            : `Reactivating ${confirmAction?.user.full_name} restores their marketplace access.`
        }
        variant={confirmAction?.type === 'approve_biz' || confirmAction?.type === 'activate' ? 'primary' : 'danger'}
        confirmLabel="Confirm Action"
        loading={processing}
        onConfirm={executeConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
    </DashboardLayout>
  );
}
