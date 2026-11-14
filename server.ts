import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import type { Request, Response, NextFunction } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getAdminSupabase() {
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

interface AuthedRequest extends Request {
  authUser?: {
    id: string;
    email?: string;
    role: string;
    account_status: string;
  };
}

async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const adminClient = getAdminSupabase();
    if (!adminClient) {
      res.status(503).json({
        error: 'Server-side Supabase service role is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your server environment.',
      });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Missing bearer authorization token.' });
      return;
    }

    const { data: userData, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !userData.user) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }

    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, role, account_status')
      .eq('id', userData.user.id)
      .single();

    if (profileErr || !profile || profile.role !== 'ADMIN' || profile.account_status !== 'active') {
      res.status(403).json({ error: 'Administrator privileges required.' });
      return;
    }

    req.authUser = {
      id: userData.user.id,
      email: userData.user.email,
      role: profile.role,
      account_status: profile.account_status,
    };
    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Authorization failed';
    res.status(500).json({ error: msg });
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const publicUrlSet = Boolean(
      (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').startsWith('https://')
    );
    const publicAnonKeySet = Boolean(
      process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY
    );
    res.json({
      status: 'ok',
      service: 'OM – Open Market',
      clientSupabaseUrlConfigured: publicUrlSet,
      clientSupabaseAnonKeyConfigured: publicAnonKeySet,
      serverSupabaseConfigured: Boolean(supabaseUrl && serviceRoleKey),
      environment: isProduction ? 'production' : 'development',
    });
  });

  // Privileged Admin Action: Approve / Reject / Suspend Wholesaler Business
  app.post('/api/admin/wholesalers/:businessId/approval', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const adminClient = getAdminSupabase()!;
    const { businessId } = req.params;
    const { status, reason } = req.body as { status?: string; reason?: string };

    if (!status || !['approved', 'rejected', 'suspended', 'pending'].includes(status)) {
      res.status(400).json({ error: 'Invalid verification status.' });
      return;
    }

    const { data: biz, error: fetchErr } = await adminClient
      .from('businesses')
      .select('id, owner_id, business_name')
      .eq('id', businessId)
      .single();

    if (fetchErr || !biz) {
      res.status(404).json({ error: 'Wholesaler business not found.' });
      return;
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
      res.status(400).json({ error: updateErr.message });
      return;
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

    res.json({ success: true, businessId, status });
  });

  // Privileged Admin Action: Suspend / Reactivate User Account
  app.post('/api/admin/users/:userId/status', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const adminClient = getAdminSupabase()!;
    const { userId } = req.params;
    const { account_status } = req.body as { account_status?: string };

    if (!account_status || !['active', 'suspended', 'rejected'].includes(account_status)) {
      res.status(400).json({ error: 'Invalid account status.' });
      return;
    }

    if (userId === req.authUser?.id && account_status !== 'active') {
      res.status(400).json({ error: 'Administrators cannot suspend their own active account.' });
      return;
    }

    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({ account_status })
      .eq('id', userId);

    if (updateErr) {
      res.status(400).json({ error: updateErr.message });
      return;
    }

    await adminClient.from('notifications').insert({
      user_id: userId,
      title: `Account Status: ${account_status.toUpperCase()}`,
      message: `An administrator updated your account status to ${account_status}.`,
      type: 'account',
      link_path: '/profile',
    });

    res.json({ success: true, userId, account_status });
  });

  // Privileged Admin Action: Verify Subscription Payment & Activate Plan
  app.post('/api/admin/subscriptions/:subscriptionId/verify', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const adminClient = getAdminSupabase()!;
    const { subscriptionId } = req.params;
    const { action, notes } = req.body as { action?: 'approve' | 'reject' | 'suspend'; notes?: string };

    const { data: sub, error: subErr } = await adminClient
      .from('subscriptions')
      .select('*, subscription_plans(*)')
      .eq('id', subscriptionId)
      .single();

    if (subErr || !sub) {
      res.status(404).json({ error: 'Subscription not found.' });
      return;
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
      res.json({ success: true, status: 'suspended' });
      return;
    }

    if (action === 'reject') {
      await adminClient.from('subscriptions').update({ status: 'cancelled' }).eq('id', subscriptionId);
      await adminClient
        .from('payments')
        .update({
          status: 'rejected',
          verified_by: req.authUser!.id,
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
      res.json({ success: true, status: 'cancelled' });
      return;
    }

    // Approve & activate
    const now = new Date();
    const cycleDays = sub.subscription_plans?.billing_cycle_days || 30;
    const graceDays = sub.subscription_plans?.grace_period_days || 3;
    const expiryDate = new Date(now.getTime() + cycleDays * 86400000);
    const graceUntil = new Date(expiryDate.getTime() + graceDays * 86400000);

    // Expire previous active subscriptions for this wholesaler
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
      res.status(400).json({ error: actErr.message });
      return;
    }

    await adminClient
      .from('payments')
      .update({
        status: 'verified',
        verified_by: req.authUser!.id,
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

    res.json({ success: true, status: 'active', expiry_date: expiryDate.toISOString() });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OM – Open Market server running on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
