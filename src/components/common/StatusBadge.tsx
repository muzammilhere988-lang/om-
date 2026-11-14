import {
  AlertCircle,
  CheckCircle2,
  Clock,
  PackageCheck,
  ShieldAlert,
  Truck,
  XCircle,
} from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const STATUS_MAP: Record<
  string,
  { label: string; classes: string; icon: 'check' | 'clock' | 'x' | 'alert' | 'truck' | 'delivered' }
> = {
  active: { label: 'Active', classes: 'text-emerald-800 bg-emerald-50 border-emerald-200', icon: 'check' },
  approved: { label: 'Approved', classes: 'text-emerald-800 bg-emerald-50 border-emerald-200', icon: 'check' },
  published: { label: 'Published', classes: 'text-emerald-800 bg-emerald-50 border-emerald-200', icon: 'check' },
  in_stock: { label: 'In Stock', classes: 'text-emerald-800 bg-emerald-50 border-emerald-200', icon: 'check' },
  verified: { label: 'Verified', classes: 'text-emerald-800 bg-emerald-50 border-emerald-200', icon: 'check' },
  verified_paid: { label: 'Verified Paid', classes: 'text-emerald-800 bg-emerald-50 border-emerald-200', icon: 'check' },
  delivered: { label: 'Delivered', classes: 'text-emerald-800 bg-emerald-50 border-emerald-200', icon: 'delivered' },
  accepted: { label: 'Accepted', classes: 'text-teal-800 bg-teal-50 border-teal-200', icon: 'check' },
  replied: { label: 'Replied', classes: 'text-teal-800 bg-teal-50 border-teal-200', icon: 'check' },
  processing: { label: 'Processing', classes: 'text-sky-800 bg-sky-50 border-sky-200', icon: 'clock' },
  shipped: { label: 'Shipped', classes: 'text-indigo-800 bg-indigo-50 border-indigo-200', icon: 'truck' },
  pending: { label: 'Pending', classes: 'text-amber-800 bg-amber-50 border-amber-200', icon: 'clock' },
  pending_verification: { label: 'Pending Verification', classes: 'text-amber-800 bg-amber-50 border-amber-200', icon: 'clock' },
  open: { label: 'Open', classes: 'text-amber-800 bg-amber-50 border-amber-200', icon: 'clock' },
  made_to_order: { label: 'Made to Order', classes: 'text-amber-800 bg-amber-50 border-amber-200', icon: 'clock' },
  draft: { label: 'Draft', classes: 'text-slate-700 bg-slate-100 border-slate-200', icon: 'clock' },
  unpublished: { label: 'Unpublished', classes: 'text-slate-700 bg-slate-100 border-slate-200', icon: 'alert' },
  unpaid: { label: 'Unpaid (Direct)', classes: 'text-slate-700 bg-slate-100 border-slate-200', icon: 'clock' },
  closed: { label: 'Closed', classes: 'text-slate-700 bg-slate-100 border-slate-200', icon: 'check' },
  dismissed: { label: 'Dismissed', classes: 'text-slate-700 bg-slate-100 border-slate-200', icon: 'x' },
  out_of_stock: { label: 'Out of Stock', classes: 'text-rose-800 bg-rose-50 border-rose-200', icon: 'x' },
  rejected: { label: 'Rejected', classes: 'text-rose-800 bg-rose-50 border-rose-200', icon: 'x' },
  suspended: { label: 'Suspended', classes: 'text-rose-800 bg-rose-50 border-rose-200', icon: 'alert' },
  expired: { label: 'Expired', classes: 'text-rose-800 bg-rose-50 border-rose-200', icon: 'alert' },
  cancelled: { label: 'Cancelled', classes: 'text-rose-800 bg-rose-50 border-rose-200', icon: 'x' },
  failed: { label: 'Failed', classes: 'text-rose-800 bg-rose-50 border-rose-200', icon: 'x' },
  action_taken: { label: 'Action Taken', classes: 'text-teal-800 bg-teal-50 border-teal-200', icon: 'check' },
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const normalized = (status || '').toLowerCase();
  const cfg = STATUS_MAP[normalized] || {
    label: status || 'Unknown',
    classes: 'text-slate-700 bg-slate-100 border-slate-200',
    icon: 'alert' as const,
  };

  const iconClass = size === 'sm' ? 'w-3.5 h-3.5 shrink-0' : 'w-4 h-4 shrink-0';

  const renderIcon = () => {
    switch (cfg.icon) {
      case 'check':
        return <CheckCircle2 className={iconClass} />;
      case 'clock':
        return <Clock className={iconClass} />;
      case 'x':
        return <XCircle className={iconClass} />;
      case 'truck':
        return <Truck className={iconClass} />;
      case 'delivered':
        return <PackageCheck className={iconClass} />;
      default:
        return <ShieldAlert className={iconClass} />;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded font-medium whitespace-nowrap shrink-0 ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      } ${cfg.classes}`}
    >
      {renderIcon()}
      <span>{cfg.label}</span>
    </span>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-700">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
