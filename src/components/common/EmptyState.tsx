import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 text-center flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mb-4">
        {icon || <Inbox className="w-6 h-6" strokeWidth={1.5} />}
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-600 max-w-md">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
