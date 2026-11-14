import { useEffect, useState } from 'react';
import { CheckCircle2, Database, KeyRound, RefreshCw, ShieldCheck, Terminal, XCircle } from 'lucide-react';

interface HealthStatus {
  clientSupabaseUrlConfigured: boolean;
  clientSupabaseAnonKeyConfigured: boolean;
  serverSupabaseConfigured: boolean;
}

export function ConfigRequiredBanner() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const checkHealth = async () => {
    setChecking(true);
    try {
      const resp = await fetch('/api/health');
      if (resp.ok) {
        const json = (await resp.json()) as HealthStatus;
        setHealth(json);
      }
    } catch {
      // Ignore network errors during initial check
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const StatusRow = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs">
      <span className="font-mono text-slate-800">{label}</span>
      {ok ? (
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
          <CheckCircle2 className="w-4 h-4" />
          <span>Detected</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
          <XCircle className="w-4 h-4" />
          <span>Missing</span>
        </span>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-3xl w-full bg-white border border-slate-200 rounded-xl p-6 sm:p-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Connect OM – Open Market to Supabase
              </h1>
              <p className="text-sm text-slate-600">
                Follow these 3 beginner steps to link your centralized PostgreSQL database.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            disabled={checking}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>Reload & Test Connection</span>
          </button>
        </div>

        {/* Live Environment Diagnostic */}
        {health && (
          <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <StatusRow ok={health.clientSupabaseUrlConfigured} label="VITE_SUPABASE_URL" />
            <StatusRow ok={health.clientSupabaseAnonKeyConfigured} label="VITE_SUPABASE_ANON_KEY" />
            <StatusRow ok={health.serverSupabaseConfigured} label="SUPABASE_SERVICE_ROLE_KEY" />
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-900">
          <p className="font-semibold mb-1">Live Database Mode Enforced</p>
          <p>
            OM never uses mock data or local demo records. Once you add your Supabase keys to{' '}
            <strong>Secrets</strong> (in AI Studio) or <code className="font-mono bg-amber-100 px-1 rounded">.env</code>{' '}
            and restart the app, the live marketplace opens immediately.
          </p>
        </div>

        <div className="space-y-4 text-sm text-slate-700">
          <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg">
            <KeyRound className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">1. Copy Keys from Supabase Dashboard</h2>
              <p className="mt-1 text-slate-600">
                Open your project at <span className="font-medium text-slate-800">supabase.com</span> →{' '}
                <strong>Project Settings → API</strong>, then add these variables to your{' '}
                <strong>AI Studio Secrets panel</strong> (or <code className="font-mono bg-slate-100 px-1 rounded">.env</code>):
              </p>
              <pre className="mt-2 bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-xs overflow-x-auto">
{`VITE_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_PUBLISHABLE_OR_ANON_KEY"
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SECRET_SERVICE_ROLE_KEY"`}
              </pre>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg">
            <Terminal className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-slate-900">2. Run the 4 SQL Migrations in Supabase SQL Editor</h2>
              <p className="mt-1 text-slate-600">
                In Supabase Dashboard → <strong>SQL Editor → New query</strong>, paste and run each file from{' '}
                <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">supabase/migrations/</code> in order:
              </p>
              <ul className="mt-2 space-y-1 font-mono text-xs text-slate-800">
                <li>1) 001_initial_schema.sql (20 PostgreSQL tables)</li>
                <li>2) 002_rls_policies.sql (Row Level Security rules)</li>
                <li>3) 003_storage_buckets.sql (Product, logo & avatar buckets)</li>
                <li>4) 004_functions_and_seed_config.sql (Order RPCs, categories & plans)</li>
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg">
            <ShieldCheck className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-slate-900">3. Create Your First Administrator</h2>
              <p className="mt-1 text-slate-600">
                In Supabase Dashboard → <strong>Authentication → Users → Add user</strong>, create your admin
                email/password (with Auto Confirm checked), then run{' '}
                <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">supabase/admin_provisioning.sql</code>{' '}
                in the SQL Editor.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
