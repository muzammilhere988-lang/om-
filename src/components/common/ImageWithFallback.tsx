import { useState } from 'react';
import { Package } from 'lucide-react';

interface ImageWithFallbackProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function ImageWithFallback({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackLabel,
}: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className="w-full h-full bg-slate-100 flex flex-col items-center justify-center p-4 text-center text-slate-400 select-none"
        role="img"
        aria-label={alt}
      >
        <Package className="w-8 h-8 mb-1.5 text-slate-300" strokeWidth={1.5} />
        {fallbackLabel && (
          <span className="text-xs font-medium text-slate-500 line-clamp-2 max-w-[16ch]">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
