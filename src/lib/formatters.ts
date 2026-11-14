import type { Inventory, PricingTier, Product } from '../types/database';

export function formatINR(amount: number | string | null | undefined): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount ?? 0);
  if (Number.isNaN(num)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getAvailableStock(product: Product | null | undefined): number {
  if (!product || !product.inventory) return 0;
  if (Array.isArray(product.inventory)) {
    return product.inventory[0]?.available_stock ?? 0;
  }
  return (product.inventory as Inventory).available_stock ?? 0;
}

export function getPrimaryImageUrl(product: Product | null | undefined): string | null {
  if (!product?.product_images || product.product_images.length === 0) return null;
  const sorted = [...product.product_images].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
  return sorted[0]?.image_url || null;
}

export function resolveUnitPriceForQuantity(
  basePrice: number,
  tiers: PricingTier[] | undefined,
  quantity: number
): number {
  if (!tiers || tiers.length === 0) return Number(basePrice);
  const matching = tiers
    .filter((t) => quantity >= t.min_qty && (t.max_qty === null || quantity <= t.max_qty))
    .sort((a, b) => b.min_qty - a.min_qty);
  if (matching.length > 0) {
    return Number(matching[0].unit_price);
  }
  return Number(basePrice);
}

export function extractErrorMessage(err: unknown, fallback = 'An unexpected error occurred.'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
