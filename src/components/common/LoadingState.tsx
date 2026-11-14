import { Loader2 } from 'lucide-react';

export function LoadingState({ label = 'Loading data...' }: { label?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center text-slate-500">
      <Loader2 className="w-6 h-6 animate-spin text-teal-700 mb-3" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-pulse">
      <div className="h-11 bg-slate-100 border-b border-slate-200" />
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="h-14 border-b border-slate-100 px-4 flex items-center gap-4">
          <div className="h-3.5 bg-slate-200 rounded w-1/4" />
          <div className="h-3.5 bg-slate-100 rounded w-1/3" />
          <div className="h-3.5 bg-slate-100 rounded w-1/6 ml-auto" />
        </div>
      ))}
    </div>
  );
}
