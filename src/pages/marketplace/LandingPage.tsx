import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MotionConfig, motion, useScroll, useSpring, useTransform } from 'motion/react';
import { ArrowRight, ArrowUpRight, Building2, MapPin, PackageSearch, Search, Store, X } from 'lucide-react';
import { MarketplaceLayout } from '../../layouts/MarketplaceLayout';
import { HeroWholesale3D } from '../../components/marketplace/HeroWholesale3D';
import { IndiaOpeningAnimation } from '../../components/marketplace/IndiaOpeningAnimation';
import { ImageWithFallback } from '../../components/common/ImageWithFallback';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingState } from '../../components/common/LoadingState';
import { EmptyState } from '../../components/common/EmptyState';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage, formatINR, getAvailableStock, getPrimaryImageUrl } from '../../lib/formatters';
import type { Category, Product } from '../../types/database';
import showroomImg from '../../assets/images/b2b_wholesale_showroom_1794600277555.jpg';
import logisticsImg from '../../assets/images/b2b_logistics_dispatch_1794600277673.jpg';

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function LandingPage() {
  const heroSectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll();
  const smoothPageProgress = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 28,
    restDelta: 0.001,
  });

  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroSectionRef,
    offset: ['start start', 'end start'],
  });
  const heroCopyY = useTransform(heroScrollProgress, [0, 1], [0, -36]);
  const heroCopyOpacity = useTransform(heroScrollProgress, [0, 0.85], [1, 0.3]);
  const hero3DY = useTransform(heroScrollProgress, [0, 1], [0, 28]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const supabase = requireSupabase();
        const { data } = await supabase
          .from('categories')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        if (data) setCategories(data as Category[]);
      } catch {
        // Categories fallback quietly if unavailable
      }
    };
    loadCategories();
  }, []);

  const loadFeaturedProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductsError(null);
    try {
      const supabase = requireSupabase();
      const hasSearch = Boolean(searchQuery.trim() || locationFilter.trim());
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
        `
        )
        .eq('listing_status', 'published')
        .eq('is_removed', false)
        .order('created_at', { ascending: false })
        .limit(hasSearch ? 48 : 6);

      if (selectedCategoryId) {
        query = query.eq('category_id', selectedCategoryId);
      }

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data as Product[]) || [];
      const term = searchQuery.trim().toLowerCase();
      if (term) {
        rows = rows.filter((p) => {
          const nameMatch = p.name.toLowerCase().includes(term);
          const brandMatch = (p.brand || '').toLowerCase().includes(term);
          const skuMatch = p.sku.toLowerCase().includes(term);
          const supplierMatch = (p.businesses?.business_name || '').toLowerCase().includes(term);
          const categoryMatch = (p.categories?.name || '').toLowerCase().includes(term);
          return nameMatch || brandMatch || skuMatch || supplierMatch || categoryMatch;
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

      setProducts(hasSearch ? rows.slice(0, 12) : rows);
    } catch (err) {
      setProductsError(extractErrorMessage(err, 'Failed to load wholesale products.'));
    } finally {
      setLoadingProducts(false);
    }
  }, [selectedCategoryId, searchQuery, locationFilter]);

  useEffect(() => {
    loadFeaturedProducts();
  }, [loadFeaturedProducts]);

  const marketplaceHref = (() => {
    const params = new URLSearchParams();
    if (selectedCategoryId) params.set('category', selectedCategoryId);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (locationFilter.trim()) params.set('location', locationFilter.trim());
    const qs = params.toString();
    return qs ? `/marketplace?${qs}` : '/marketplace';
  })();

  const scrollToCatalogSection = () => {
    document.getElementById('browse-products')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <MarketplaceLayout>
      <MotionConfig reducedMotion="user">
        <IndiaOpeningAnimation />

        {/* Top Scroll Progress Line */}
        <motion.div
          style={{ scaleX: smoothPageProgress }}
          className="fixed top-0 left-0 right-0 h-[3px] bg-teal-600 origin-left z-50 pointer-events-none"
          aria-hidden="true"
        />

        {/* 1. Corporate B2B Hero Section with Live Interactive 3D Stage & Scroll Parallax */}
        <section
          ref={heroSectionRef}
          className="bg-slate-900 text-white border-b border-slate-800 overflow-hidden"
        >
          <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 items-stretch">
            <motion.div
              style={{ y: heroCopyY, opacity: heroCopyOpacity }}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
              className="lg:col-span-6 px-4 sm:px-6 lg:px-10 py-14 sm:py-20 flex flex-col justify-center relative z-10"
            >
              <p className="text-xs font-medium tracking-wider uppercase text-teal-300">
                Centralized B2B Wholesale Network
              </p>
              <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1] [text-wrap:balance] max-w-2xl">
                Direct wholesale sourcing for verified retailers and distributors.
              </h1>
              <p className="mt-5 text-base text-slate-300 max-w-xl leading-relaxed">
                OM – Open Market brings wholesale catalogs, volume price slabs, and direct supplier
                fulfillment into one structured trade platform across India.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={scrollToCatalogSection}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-slate-900 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-transform duration-150 hover:-translate-y-0.5 whitespace-nowrap shrink-0"
                >
                  <span>Browse Products</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <Link
                  to="/register"
                  className="inline-flex items-center px-6 py-3 border border-slate-600 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-transform duration-150 hover:-translate-y-0.5 whitespace-nowrap shrink-0"
                >
                  Register Your Business
                </Link>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Open catalog access: inspect published products, bulk pricing, and verified suppliers without logging in. Drag the 3D model or scroll down to explore.
              </p>
            </motion.div>

            <motion.div
              style={{ y: hero3DY }}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.08, ease: EASE_OUT_EXPO }}
              className="lg:col-span-6 relative min-h-[360px] lg:min-h-[520px]"
            >
              <HeroWholesale3D />
            </motion.div>
          </div>
        </section>

        {/* 2. Centered Browse Wholesale Products Showcase (No Login Required) */}
        <section
          id="browse-products"
          className="bg-white border-b border-slate-200 py-14 sm:py-20 [perspective:1200px]"
        >
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
              className="text-center max-w-2xl mx-auto mb-8"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-teal-800">
                Open Wholesale Catalog
              </p>
              <h2 className="mt-2 text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
                Browse Wholesale Products
              </h2>
              <p className="mt-2.5 text-sm sm:text-base text-slate-600 leading-relaxed">
                Explore verified wholesale listings, bulk minimum order quantities, and direct supplier pricing—visible to everyone without logging in.
              </p>
            </motion.div>

            {/* Centered Search Bar */}
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.45, delay: 0.06, ease: EASE_OUT_EXPO }}
              className="max-w-3xl mx-auto mb-6"
            >
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products, brand, SKU, or supplier..."
                    aria-label="Search wholesale products"
                    className="w-full pl-10 pr-8 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="sm:w-48 relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    placeholder="City or State..."
                    aria-label="Filter by city or state"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <Link
                  to={marketplaceHref}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Full Filters</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>

            {/* Centered Wrapped Category Selector */}
            {categories.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId('')}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
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
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                      selectedCategoryId === cat.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {productsError && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 text-center">
                {productsError}
              </div>
            )}

            {loadingProducts ? (
              <LoadingState label="Loading wholesale products..." />
            ) : products.length === 0 ? (
              <EmptyState
                icon={<PackageSearch className="w-6 h-6" strokeWidth={1.5} />}
                title="No matching wholesale products found."
                description="Try clearing your search or category filter, or open the full wholesale catalog."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {(searchQuery || locationFilter || selectedCategoryId) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setLocationFilter('');
                          setSelectedCategoryId('');
                        }}
                        className="px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        Reset Search
                      </button>
                    )}
                    <Link
                      to="/marketplace"
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                    >
                      <span>Open Full Products Catalog</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                }
              />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map((product, idx) => {
                    const imgUrl = getPrimaryImageUrl(product);
                    const stock = getAvailableStock(product);
                    return (
                      <motion.article
                        key={product.id}
                        initial={{ opacity: 0, y: 14 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.15 }}
                        transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.2), ease: EASE_OUT_EXPO }}
                        whileHover={{ y: -4, rotateX: 1.5, rotateY: -1.5 }}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col hover:border-slate-300 shadow-sm hover:shadow-md transition-shadow [transform-style:preserve-3d]"
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
                              View Product Details
                            </Link>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>

                <div className="mt-10 text-center">
                  <Link
                    to={marketplaceHref}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-transform duration-150 hover:-translate-y-0.5 whitespace-nowrap"
                  >
                    <span>Browse All Wholesale Products</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </>
            )}
          </div>
        </section>

        {/* 3. Platform Architecture & Capabilities (3D Depth Bento Grid) */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 [perspective:1200px]">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10"
          >
            <div className="max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-wider text-teal-800">
                How OM – Open Market Works
              </p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
                Built for transparent wholesale pricing and dependable order fulfillment.
              </h2>
            </div>
            <Link
              to="/wholesalers"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-teal-800 whitespace-nowrap shrink-0"
            >
              <span>Explore Verified Suppliers</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Card 01: Wide editorial card with showroom photo */}
            <motion.div
              initial={{ opacity: 0, x: -24, y: 20, rotateX: 4 }}
              whileInView={{ opacity: 1, x: 0, y: 0, rotateX: 0 }}
              viewport={{ once: true, amount: 0.18 }}
              transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
              whileHover={{ y: -4, rotateX: 1, rotateY: -1 }}
              className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 sm:grid-cols-12 items-stretch shadow-sm hover:shadow-md transition-shadow [transform-style:preserve-3d]"
            >
              <div className="sm:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-mono font-semibold text-slate-500">01. Common Marketplace</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">
                    One public catalog across all approved wholesalers
                  </h3>
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                    Retailers and procurement teams can compare unit rates, minimum order quantities,
                    and supplier locations from every verified wholesaler in one open catalog—even before signing in.
                  </p>
                </div>
                <div className="mt-6">
                  <Link
                    to="/marketplace"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-800 hover:text-teal-950"
                  >
                    <span>Open Products Catalog</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
              <div className="sm:col-span-5 min-h-[200px] bg-slate-100 overflow-hidden">
                <img
                  src={showroomImg}
                  alt="Organized wholesale trade showroom and bulk merchandise"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </motion.div>

            {/* Card 02: Bulk Pricing Tiers */}
            <motion.div
              initial={{ opacity: 0, x: 24, y: 20, rotateX: 4 }}
              whileInView={{ opacity: 1, x: 0, y: 0, rotateX: 0 }}
              viewport={{ once: true, amount: 0.18 }}
              transition={{ duration: 0.5, delay: 0.06, ease: EASE_OUT_EXPO }}
              whileHover={{ y: -4, rotateX: 1, rotateY: 1 }}
              className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow [transform-style:preserve-3d]"
            >
              <div>
                <p className="text-xs font-mono font-semibold text-slate-500">02. Volume Pricing Slabs</p>
                <h3 className="mt-2 text-xl font-bold text-slate-900">
                  Automatic bulk rate calculation by quantity
                </h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  Suppliers publish clear MOQ thresholds and multi-tier wholesale discounts. When a
                  retailer adjusts order quantity, the system calculates the exact slab rate automatically.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-mono text-slate-600">
                <span>Example Slab: 10–49 units</span>
                <span className="font-semibold text-slate-900">→ 50+ units bulk discount</span>
              </div>
            </motion.div>

            {/* Card 03: Stock Control */}
            <motion.div
              initial={{ opacity: 0, x: -24, y: 20, rotateX: 4 }}
              whileInView={{ opacity: 1, x: 0, y: 0, rotateX: 0 }}
              viewport={{ once: true, amount: 0.18 }}
              transition={{ duration: 0.5, delay: 0.08, ease: EASE_OUT_EXPO }}
              whileHover={{ y: -4, rotateX: -1, rotateY: -1 }}
              className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow [transform-style:preserve-3d]"
            >
              <div>
                <p className="text-xs font-mono font-semibold text-slate-500">03. Live Inventory Ledger</p>
                <h3 className="mt-2 text-xl font-bold text-slate-900">
                  Real-time stock reservation & audit tracking
                </h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  Every order reserves available inventory atomically and automatically splits multi-supplier
                  carts into separate supplier orders so fulfillment stays accurate.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
                Supports Cash on Delivery, Direct UPI, and Bank Transfer settlement.
              </div>
            </motion.div>

            {/* Card 04: Logistics & Verification */}
            <motion.div
              initial={{ opacity: 0, x: 24, y: 20, rotateX: 4 }}
              whileInView={{ opacity: 1, x: 0, y: 0, rotateX: 0 }}
              viewport={{ once: true, amount: 0.18 }}
              transition={{ duration: 0.5, delay: 0.12, ease: EASE_OUT_EXPO }}
              whileHover={{ y: -4, rotateX: -1, rotateY: 1 }}
              className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 sm:grid-cols-12 items-stretch shadow-sm hover:shadow-md transition-shadow [transform-style:preserve-3d]"
            >
              <div className="sm:col-span-5 min-h-[200px] bg-slate-100 overflow-hidden">
                <img
                  src={logisticsImg}
                  alt="Regional B2B fulfillment center and shipping bay"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="sm:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-mono font-semibold text-slate-500">04. Verified Trade Onboarding</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">
                    Admin-reviewed wholesalers & direct enquiries
                  </h3>
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                    Every wholesale seller profile undergoes manual verification before products go live,
                    ensuring retailers connect directly with genuine regional distributors and manufacturers.
                  </p>
                </div>
                <div className="mt-6">
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-teal-800"
                  >
                    <span>Apply as Wholesaler or Retailer</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 4. Role Conversion Split */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-16 [perspective:1200px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 24, rotateX: 4 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              whileHover={{ y: -4, rotateX: 1, rotateY: -1 }}
              transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
              className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow [transform-style:preserve-3d]"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-900 flex items-center justify-center">
                  <Store className="w-5 h-5" />
                </div>
                <h3 className="mt-5 text-xl font-bold text-slate-900">For Retail Shop Owners & Buyers</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Explore the full public catalog freely, compare wholesale rates across multiple suppliers,
                  send direct product enquiries, and manage your procurement orders from one dashboard.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  to="/marketplace"
                  className="px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 whitespace-nowrap"
                >
                  Browse Products
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2.5 border border-slate-300 text-slate-800 text-sm font-medium rounded-lg hover:bg-slate-50 whitespace-nowrap"
                >
                  Create Retailer Account
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24, rotateX: 4 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              whileHover={{ y: -4, rotateX: 1, rotateY: 1 }}
              transition={{ duration: 0.45, delay: 0.08, ease: EASE_OUT_EXPO }}
              className="bg-slate-900 text-white border border-slate-800 rounded-xl p-8 flex flex-col justify-between shadow-sm hover:shadow-lg transition-shadow [transform-style:preserve-3d]"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-slate-800 text-teal-300 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="mt-5 text-xl font-bold">For Wholesalers & Distributors</h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  Publish your wholesale catalog, set MOQ and bulk tier pricing, manage live warehouse
                  inventory, and receive direct orders from verified retail stores.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  to="/register"
                  className="px-4 py-2.5 bg-white text-slate-900 text-sm font-semibold rounded-lg hover:bg-slate-100 whitespace-nowrap"
                >
                  Register as Wholesaler
                </Link>
                <Link
                  to="/login"
                  className="px-4 py-2.5 border border-slate-600 text-white text-sm font-medium rounded-lg hover:bg-slate-800 whitespace-nowrap"
                >
                  Wholesaler Sign In
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </MotionConfig>
    </MarketplaceLayout>
  );
}

