import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, MapPin, PackageSearch, Search, SlidersHorizontal } from 'lucide-react';
import { MarketplaceLayout } from '../../layouts/MarketplaceLayout';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatINR, getAvailableStock, getPrimaryImageUrl } from '../../lib/formatters';
import type { Category, Product, Subcategory } from '../../types/database';
import { ImageWithFallback } from '../../components/common/ImageWithFallback';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';

const PAGE_SIZE = 12;

export function MarketplacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(() => searchParams.get('category') || '');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState(() => searchParams.get('location') || '');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'in_stock' | 'made_to_order'>('all');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc'>('newest');

  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Load dynamic categories from Supabase
  useEffect(() => {
    const fetchTaxonomy = async () => {
      try {
        const supabase = requireSupabase();
        const [{ data: catData }, { data: subData }] = await Promise.all([
          supabase.from('categories').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
          supabase.from('subcategories').select('*').eq('is_active', true).order('name', { ascending: true }),
        ]);
        setCategories((catData as Category[]) || []);
        setSubcategories((subData as Subcategory[]) || []);
      } catch {
        // Handled in main product load
      }
    };
    fetchTaxonomy();
  }, []);

  const fetchProducts = useCallback(
    async (pageIndex: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const supabase = requireSupabase();
        const from = pageIndex * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
          .from('products')
          .select(
            `
            *,
            businesses!inner(id, business_name, city, state, verification_status),
            categories(id, name, slug),
            subcategories(id, name, slug),
            product_images(id, image_url, is_primary, sort_order),
            inventory(available_stock, reserved_stock)
          `,
            { count: 'exact' }
          )
          .eq('listing_status', 'published')
          .eq('is_removed', false);

        if (selectedCategoryId) {
          query = query.eq('category_id', selectedCategoryId);
        }
        if (selectedSubcategoryId) {
          query = query.eq('subcategory_id', selectedSubcategoryId);
        }
        if (availabilityFilter !== 'all') {
          query = query.eq('availability_status', availabilityFilter);
        }
        if (minPrice.trim() && !Number.isNaN(Number(minPrice))) {
          query = query.gte('wholesale_price', Number(minPrice));
        }
        if (maxPrice.trim() && !Number.isNaN(Number(maxPrice))) {
          query = query.lte('wholesale_price', Number(maxPrice));
        }

        // Order
        if (sortBy === 'price_asc') {
          query = query.order('wholesale_price', { ascending: true });
        } else if (sortBy === 'price_desc') {
          query = query.order('wholesale_price', { ascending: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        query = query.range(from, to);

        const { data, count, error: prodErr } = await query;
        if (prodErr) throw prodErr;

        let rows = (data as Product[]) || [];

        // Client-side refinement for joined supplier name / city / product / brand text when searching
        const term = searchQuery.trim().toLowerCase();
        if (term) {
          rows = rows.filter((p) => {
            const nameMatch = p.name.toLowerCase().includes(term);
            const brandMatch = (p.brand || '').toLowerCase().includes(term);
            const skuMatch = p.sku.toLowerCase().includes(term);
            const supplierMatch = (p.businesses?.business_name || '').toLowerCase().includes(term);
            return nameMatch || brandMatch || skuMatch || supplierMatch;
          });
        }

        const locTerm = locationFilter.trim().toLowerCase();
        if (locTerm) {
          rows = rows.filter((p) => {
            const city = (p.businesses?.city || '').toLowerCase();
            const state = (p.businesses?.state || '').toLowerCase();
            return city.includes(locTerm) || state.includes(locTerm);
          });
        }

        setTotalCount(count ?? rows.length);
        if (append) {
          setProducts((prev) => [...prev, ...rows]);
        } else {
          setProducts(rows);
        }
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to load marketplace products.'));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      selectedCategoryId,
      selectedSubcategoryId,
      availabilityFilter,
      minPrice,
      maxPrice,
      sortBy,
      searchQuery,
      locationFilter,
    ]
  );

  const urlCategoryParam = searchParams.get('category') || '';

  useEffect(() => {
    setSelectedCategoryId(urlCategoryParam);
    setSelectedSubcategoryId('');
  }, [urlCategoryParam]);

  useEffect(() => {
    setPage(0);
    fetchProducts(0, false);
  }, [fetchProducts]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchProducts(nextPage, true);
  };

  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setSelectedSubcategoryId('');
    if (categoryId) {
      setSearchParams({ category: categoryId });
    } else {
      setSearchParams({});
    }
  };

  const visibleSubcategories = subcategories.filter(
    (s) => !selectedCategoryId || s.category_id === selectedCategoryId
  );

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategoryId('');
    setSelectedSubcategoryId('');
    setLocationFilter('');
    setAvailabilityFilter('all');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('newest');
    setSearchParams({});
  };

  return (
    <MarketplaceLayout>
      {/* Compact Catalog Header */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wider uppercase text-teal-800">
              Public Wholesale Directory
            </p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Wholesale Product Catalog
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
              Browse live wholesale listings, compare bulk pricing slabs, and inspect verified
              suppliers — open to everyone without login.
            </p>
          </div>
          <Link
            to="/wholesalers"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <span>View Verified Suppliers</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* Common Marketplace Catalog */}
      <section id="catalog" className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Search + Sort Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 mb-6">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by product name, brand, SKU, or wholesaler name..."
                aria-label="Search marketplace products"
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
              <div className="relative flex-1 sm:w-48">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  placeholder="City or State..."
                  aria-label="Filter by supplier location"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'newest' | 'price_asc' | 'price_desc')}
                aria-label="Sort products"
                className="px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="newest">Sort: Newest Listed</option>
                <option value="price_asc">Sort: Lowest Price</option>
                <option value="price_desc">Sort: Highest Price</option>
              </select>

              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Filters</span>
              </button>
            </div>
          </div>

          {/* Dynamic Category Tabs (Wrapped, No Horizontal Scrollbar) */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectCategory('')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                selectedCategoryId === ''
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Expanded Filter Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Subcategory</label>
                <select
                  value={selectedSubcategoryId}
                  onChange={(e) => setSelectedSubcategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">All Subcategories</option>
                  {visibleSubcategories.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Availability</label>
                <select
                  value={availabilityFilter}
                  onChange={(e) =>
                    setAvailabilityFilter(e.target.value as 'all' | 'in_stock' | 'made_to_order')
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">All Availability</option>
                  <option value="in_stock">In Stock Only</option>
                  <option value="made_to_order">Made to Order</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Min Price (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Max Price (₹)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="No limit"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Wholesale Catalog</h2>
          <p className="text-xs font-mono text-slate-500 tabular-nums">
            Showing {products.length} of {totalCount} listings
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">
            {error}
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading live wholesale listings from Supabase..." />
        ) : products.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="w-6 h-6" strokeWidth={1.5} />}
            title="No products available yet."
            description="No approved wholesale listings match your current search or filters. Once approved wholesalers publish products, they will appear here automatically."
            action={
              (searchQuery || selectedCategoryId || locationFilter || minPrice || maxPrice) && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  Clear All Filters
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => {
                const imgUrl = getPrimaryImageUrl(product);
                const stock = getAvailableStock(product);
                return (
                  <article
                    key={product.id}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col hover:border-slate-300 transition-transform duration-150 hover:-translate-y-0.5"
                  >
                    <Link
                      to={`/products/${product.id}`}
                      className="block aspect-[4/3] bg-white border-b border-slate-100 p-3 overflow-hidden"
                    >
                      <ImageWithFallback
                        src={imgUrl}
                        alt={product.name}
                        fallbackLabel={product.name}
                        className="w-full h-full object-contain"
                      />
                    </Link>

                    <div className="p-5 flex-1 flex flex-col">
                      {/* Unboxed quiet metadata */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                        <span>{product.categories?.name || 'General'}</span>
                        {product.brand && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{product.brand}</span>
                          </>
                        )}
                      </div>

                      <Link to={`/products/${product.id}`} className="mt-1.5 block">
                        <h3 className="text-base font-semibold text-slate-900 line-clamp-2 hover:text-teal-800 transition-colors">
                          {product.name}
                        </h3>
                      </Link>

                      <div className="mt-3 flex items-baseline justify-between gap-2">
                        <div>
                          <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                            {formatINR(product.wholesale_price)}
                          </span>
                          <span className="text-xs text-slate-500 ml-1">/ {product.unit}</span>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-slate-700 font-medium">
                          MOQ: {product.moq} {product.unit}
                        </span>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
                        <div className="min-w-0">
                          <Link
                            to={`/wholesalers/${product.business_id}`}
                            className="font-medium text-slate-800 hover:underline truncate block"
                          >
                            {product.businesses?.business_name || 'Verified Supplier'}
                          </Link>
                          <p className="text-slate-500 truncate">
                            {product.businesses?.city}, {product.businesses?.state}
                          </p>
                        </div>
                        <StatusBadge
                          status={
                            stock <= 0 && product.availability_status !== 'made_to_order'
                              ? 'out_of_stock'
                              : product.availability_status
                          }
                        />
                      </div>

                      <div className="mt-4">
                        <Link
                          to={`/products/${product.id}`}
                          className="w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {products.length < totalCount && (
              <div className="mt-10 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60"
                >
                  {loadingMore ? 'Loading more products...' : 'Load More Products'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </MarketplaceLayout>
  );
}
