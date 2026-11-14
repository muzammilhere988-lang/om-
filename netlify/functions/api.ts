import { createClient } from '@supabase/supabase-js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function getAdminSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function requireAdmin(req: Request) {
  const adminClient = getAdminSupabase();
  if (!adminClient) {
    return {
      error: jsonResponse(
        {
          error:
            'Server-side Supabase service role is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify Environment Variables.',
        },
        503
      ),
    };
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { error: jsonResponse({ error: 'Missing bearer authorization token.' }, 401) };
  }

  const { data: userData, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !userData.user) {
    return { error: jsonResponse({ error: 'Invalid or expired session token.' }, 401) };
  }

  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('id, role, account_status')
    .eq('id', userData.user.id)
    .single();

  if (profileErr || !profile || profile.role !== 'ADMIN' || profile.account_status !== 'active') {
    return { error: jsonResponse({ error: 'Administrator privileges required.' }, 403) };
  }

  return {
    adminClient,
    authUser: {
      id: userData.user.id,
      email: userData.user.email,
      role: profile.role as string,
      account_status: profile.account_status as string,
    },
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const url = new URL(req.url);
  const routePath = url.pathname
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '') || '/';

  // Health check
  if (req.method === 'GET' && routePath === '/health') {
    const publicUrlSet = Boolean(
      (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').startsWith('https://')
    );
    const publicAnonKeySet = Boolean(
      process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY
    );
    const serverSupabaseConfigured = Boolean(
      (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    return jsonResponse({
      status: 'ok',
      service: 'OM – Open Market',
      clientSupabaseUrlConfigured: publicUrlSet,
      clientSupabaseAnonKeyConfigured: publicAnonKeySet,
      serverSupabaseConfigured,
      environment: 'netlify',
    });
  }

  // POST /admin/wholesalers/:businessId/approval
  const wholesalerApprovalMatch = routePath.match(/^\/admin\/wholesalers\/([^/]+)\/approval$/);
  if (req.method === 'POST' && wholesalerApprovalMatch) {
    const auth = await requireAdmin(req);
    if ('error' in auth && auth.error) return auth.error;
    const { adminClient } = auth;
    const businessId = decodeURIComponent(wholesalerApprovalMatch[1]);

    const body = (await req.json().catch(() => ({}))) as { status?: string; reason?: string };
    const { status, reason } = body;

    if (!status || !['approved', 'rejected', 'suspended', 'pending'].includes(status)) {
      return jsonResponse({ error: 'Invalid verification status.' }, 400);
    }

    const { data: biz, error: fetchErr } = await adminClient
      .from('businesses')
      .select('id, owner_id, business_name')
      .eq('id', businessId)
      .single();

    if (fetchErr || !biz) {
      return jsonResponse({ error: 'Wholesaler business not found.' }, 404);
    }

    const { error: updateErr } = await adminClient
      .from('businesses')
      .update({
        verification_status: status,
        rejection_reason: reason?.trim() || null,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
      })
      .eq('id', businessId);

    if (updateErr) {
      return jsonResponse({ error: updateErr.message }, 400);
    }

    await adminClient.from('notifications').insert({
      user_id: biz.owner_id,
      title: `Wholesaler Account ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message:
        status === 'approved'
          ? `Your business "${biz.business_name}" has been approved. You can now publish wholesale products directly to the marketplace.`
          : `Your wholesaler application status was updated to "${status}".${reason ? ` Note: ${reason}` : ''}`,
      type: 'account',
      link_path: '/wholesaler',
    });

    return jsonResponse({ success: true, businessId, status });
  }

  // POST /admin/users/:userId/status
  const userStatusMatch = routePath.match(/^\/admin\/users\/([^/]+)\/status$/);
  if (req.method === 'POST' && userStatusMatch) {
    const auth = await requireAdmin(req);
    if ('error' in auth && auth.error) return auth.error;
    const { adminClient, authUser } = auth;
    const userId = decodeURIComponent(userStatusMatch[1]);

    const body = (await req.json().catch(() => ({}))) as { account_status?: string };
    const { account_status } = body;

    if (!account_status || !['active', 'suspended', 'rejected'].includes(account_status)) {
      return jsonResponse({ error: 'Invalid account status.' }, 400);
    }

    if (userId === authUser.id && account_status !== 'active') {
      return jsonResponse({ error: 'Administrators cannot suspend their own active account.' }, 400);
    }

    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({ account_status })
      .eq('id', userId);

    if (updateErr) {
      return jsonResponse({ error: updateErr.message }, 400);
    }

    await adminClient.from('notifications').insert({
      user_id: userId,
      title: `Account Status: ${account_status.toUpperCase()}`,
      message: `An administrator updated your account status to ${account_status}.`,
      type: 'account',
      link_path: '/profile',
    });

    return jsonResponse({ success: true, userId, account_status });
  }

  // POST /admin/subscriptions/:subscriptionId/verify
  const subVerifyMatch = routePath.match(/^\/admin\/subscriptions\/([^/]+)\/verify$/);
  if (req.method === 'POST' && subVerifyMatch) {
    const auth = await requireAdmin(req);
    if ('error' in auth && auth.error) return auth.error;
    const { adminClient, authUser } = auth;
    const subscriptionId = decodeURIComponent(subVerifyMatch[1]);

    const body = (await req.json().catch(() => ({}))) as {
      action?: 'approve' | 'reject' | 'suspend';
      notes?: string;
    };
    const { action, notes } = body;

    const { data: sub, error: subErr } = await adminClient
      .from('subscriptions')
      .select('*, subscription_plans(*)')
      .eq('id', subscriptionId)
      .single();

    if (subErr || !sub) {
      return jsonResponse({ error: 'Subscription not found.' }, 404);
    }

    if (action === 'suspend') {
      await adminClient.from('subscriptions').update({ status: 'suspended' }).eq('id', subscriptionId);
      await adminClient.from('notifications').insert({
        user_id: sub.wholesaler_id,
        title: 'Subscription Suspended',
        message: notes || 'Your wholesaler subscription has been suspended by an administrator.',
        type: 'subscription',
        link_path: '/wholesaler/subscription',
      });
      return jsonResponse({ success: true, status: 'suspended' });
    }

    if (action === 'reject') {
      await adminClient.from('subscriptions').update({ status: 'cancelled' }).eq('id', subscriptionId);
      await adminClient
        .from('payments')
        .update({
          status: 'rejected',
          verified_by: authUser.id,
          verified_at: new Date().toISOString(),
          notes: notes || 'Payment verification rejected by administrator',
        })
        .eq('subscription_id', subscriptionId);

      await adminClient.from('notifications').insert({
        user_id: sub.wholesaler_id,
        title: 'Subscription Payment Rejected',
        message: notes || 'Your subscription payment reference could not be verified.',
        type: 'subscription',
        link_path: '/wholesaler/subscription',
      });
      return jsonResponse({ success: true, status: 'cancelled' });
    }

    const now = new Date();
    const cycleDays = sub.subscription_plans?.billing_cycle_days || 30;
    const graceDays = sub.subscription_plans?.grace_period_days || 3;
    const expiryDate = new Date(now.getTime() + cycleDays * 86400000);
    const graceUntil = new Date(expiryDate.getTime() + graceDays * 86400000);

    await adminClient
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('wholesaler_id', sub.wholesaler_id)
      .eq('status', 'active')
      .neq('id', subscriptionId);

    const { error: actErr } = await adminClient
      .from('subscriptions')
      .update({
        status: 'active',
        start_date: now.toISOString(),
        expiry_date: expiryDate.toISOString(),
        grace_until: graceUntil.toISOString(),
      })
      .eq('id', subscriptionId);

    if (actErr) {
      return jsonResponse({ error: actErr.message }, 400);
    }

    await adminClient
      .from('payments')
      .update({
        status: 'verified',
        verified_by: authUser.id,
        verified_at: now.toISOString(),
        notes: notes || 'Verified by administrator',
      })
      .eq('subscription_id', subscriptionId);

    await adminClient.from('notifications').insert({
      user_id: sub.wholesaler_id,
      title: 'Subscription Activated',
      message: `Your ${sub.subscription_plans?.name || 'Wholesaler'} subscription is now active until ${expiryDate.toLocaleDateString('en-IN')}.`,
      type: 'subscription',
      link_path: '/wholesaler/subscription',
    });

    return jsonResponse({ success: true, status: 'active', expiry_date: expiryDate.toISOString() });
  }

  return jsonResponse({ error: 'API route not found.' }, 404);
}
