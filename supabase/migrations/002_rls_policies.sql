-- ============================================================================
-- OM – OPEN MARKET | Migration 002: Row Level Security (RLS) Policies
-- ============================================================================
-- Run this second in your Supabase Dashboard -> SQL Editor.

-- Helper functions (SECURITY DEFINER prevents infinite RLS recursion)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN' AND account_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_wholesaler_subscription(target_wholesaler_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.wholesaler_id = target_wholesaler_id
      AND s.status = 'active'
      AND (s.grace_until >= NOW() OR s.expiry_date >= NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_product_publicly_visible(target_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    JOIN public.businesses b ON b.id = p.business_id
    JOIN public.profiles pr ON pr.id = p.wholesaler_id
    WHERE p.id = target_product_id
      AND p.listing_status = 'published'
      AND p.is_removed = FALSE
      AND b.verification_status = 'approved'
      AND pr.account_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_account_status()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_status FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_business_type(target_business_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_type FROM public.businesses WHERE id = target_business_id;
$$;

CREATE OR REPLACE FUNCTION public.get_business_verification_status(target_business_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT verification_status FROM public.businesses WHERE id = target_business_id;
$$;

CREATE OR REPLACE FUNCTION public.get_product_is_removed(target_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_removed FROM public.products WHERE id = target_product_id;
$$;

-- Enable RLS on all 20 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- 1. PROFILES
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());

-- Prevent users from changing their own role or account_status
DROP POLICY IF EXISTS "profiles_update_own_safe" ON public.profiles;
CREATE POLICY "profiles_update_own_safe" ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = public.current_user_role()
    AND account_status = public.current_user_account_status()
  );

DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. BUSINESSES
DROP POLICY IF EXISTS "businesses_public_read_approved_wholesalers" ON public.businesses;
CREATE POLICY "businesses_public_read_approved_wholesalers" ON public.businesses
  FOR SELECT USING (
    (business_type = 'WHOLESALER' AND verification_status = 'approved')
    OR owner_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.wholesaler_id = auth.uid() AND o.retailer_id = businesses.owner_id
    )
  );

DROP POLICY IF EXISTS "businesses_owner_insert" ON public.businesses;
CREATE POLICY "businesses_owner_insert" ON public.businesses
  FOR INSERT WITH CHECK (owner_id = auth.uid() AND verification_status = 'pending');

-- Owner cannot self-approve or change business_type
DROP POLICY IF EXISTS "businesses_owner_update_safe" ON public.businesses;
CREATE POLICY "businesses_owner_update_safe" ON public.businesses
  FOR UPDATE USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND business_type = public.get_business_type(id)
    AND verification_status = public.get_business_verification_status(id)
  );

DROP POLICY IF EXISTS "businesses_admin_all" ON public.businesses;
CREATE POLICY "businesses_admin_all" ON public.businesses
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. CATEGORIES & 4. SUBCATEGORIES
DROP POLICY IF EXISTS "categories_public_read" ON public.categories;
CREATE POLICY "categories_public_read" ON public.categories
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "categories_admin_write" ON public.categories;
CREATE POLICY "categories_admin_write" ON public.categories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "subcategories_public_read" ON public.subcategories;
CREATE POLICY "subcategories_public_read" ON public.subcategories
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "subcategories_admin_write" ON public.subcategories;
CREATE POLICY "subcategories_admin_write" ON public.subcategories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. PRODUCTS
DROP POLICY IF EXISTS "products_select_visible_or_owner_or_admin" ON public.products;
CREATE POLICY "products_select_visible_or_owner_or_admin" ON public.products
  FOR SELECT USING (
    wholesaler_id = auth.uid()
    OR public.is_admin()
    OR public.is_product_publicly_visible(id)
  );

DROP POLICY IF EXISTS "products_wholesaler_insert" ON public.products;
CREATE POLICY "products_wholesaler_insert" ON public.products
  FOR INSERT WITH CHECK (
    wholesaler_id = auth.uid()
    AND public.current_user_role() = 'WHOLESALER'
    AND is_removed = FALSE
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id AND b.owner_id = auth.uid() AND b.business_type = 'WHOLESALER'
    )
  );

DROP POLICY IF EXISTS "products_wholesaler_update" ON public.products;
CREATE POLICY "products_wholesaler_update" ON public.products
  FOR UPDATE USING (wholesaler_id = auth.uid() AND public.current_user_role() = 'WHOLESALER')
  WITH CHECK (
    wholesaler_id = auth.uid()
    AND is_removed = public.get_product_is_removed(id)
  );

DROP POLICY IF EXISTS "products_wholesaler_delete" ON public.products;
CREATE POLICY "products_wholesaler_delete" ON public.products
  FOR DELETE USING (wholesaler_id = auth.uid() AND public.current_user_role() = 'WHOLESALER');

DROP POLICY IF EXISTS "products_admin_all" ON public.products;
CREATE POLICY "products_admin_all" ON public.products
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6. PRODUCT IMAGES
DROP POLICY IF EXISTS "product_images_select" ON public.product_images;
CREATE POLICY "product_images_select" ON public.product_images
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.wholesaler_id = auth.uid())
    OR public.is_product_publicly_visible(product_id)
  );

DROP POLICY IF EXISTS "product_images_wholesaler_write" ON public.product_images;
CREATE POLICY "product_images_wholesaler_write" ON public.product_images
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.wholesaler_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.wholesaler_id = auth.uid())
  );

-- 7. INVENTORY
DROP POLICY IF EXISTS "inventory_select" ON public.inventory;
CREATE POLICY "inventory_select" ON public.inventory
  FOR SELECT USING (
    wholesaler_id = auth.uid()
    OR public.is_admin()
    OR public.is_product_publicly_visible(product_id)
  );

DROP POLICY IF EXISTS "inventory_wholesaler_insert" ON public.inventory;
CREATE POLICY "inventory_wholesaler_insert" ON public.inventory
  FOR INSERT WITH CHECK (wholesaler_id = auth.uid());

DROP POLICY IF EXISTS "inventory_wholesaler_update" ON public.inventory;
CREATE POLICY "inventory_wholesaler_update" ON public.inventory
  FOR UPDATE USING (wholesaler_id = auth.uid())
  WITH CHECK (wholesaler_id = auth.uid());

-- 8. PRICING TIERS
DROP POLICY IF EXISTS "pricing_tiers_select" ON public.pricing_tiers;
CREATE POLICY "pricing_tiers_select" ON public.pricing_tiers
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.wholesaler_id = auth.uid())
    OR public.is_product_publicly_visible(product_id)
  );

DROP POLICY IF EXISTS "pricing_tiers_wholesaler_write" ON public.pricing_tiers;
CREATE POLICY "pricing_tiers_wholesaler_write" ON public.pricing_tiers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.wholesaler_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.wholesaler_id = auth.uid())
  );

-- 9. SUBSCRIPTION PLANS
DROP POLICY IF EXISTS "subscription_plans_public_read" ON public.subscription_plans;
CREATE POLICY "subscription_plans_public_read" ON public.subscription_plans
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "subscription_plans_admin_write" ON public.subscription_plans;
CREATE POLICY "subscription_plans_admin_write" ON public.subscription_plans
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 10. SUBSCRIPTIONS (Wholesalers can view & submit pending requests; only Admin/RPC/service_role activates)
DROP POLICY IF EXISTS "subscriptions_select_own_or_admin" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own_or_admin" ON public.subscriptions
  FOR SELECT USING (wholesaler_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "subscriptions_wholesaler_request_pending" ON public.subscriptions;
CREATE POLICY "subscriptions_wholesaler_request_pending" ON public.subscriptions
  FOR INSERT WITH CHECK (
    wholesaler_id = auth.uid()
    AND public.current_user_role() = 'WHOLESALER'
    AND status = 'pending'
    AND start_date IS NULL
    AND expiry_date IS NULL
  );

DROP POLICY IF EXISTS "subscriptions_admin_all" ON public.subscriptions;
CREATE POLICY "subscriptions_admin_all" ON public.subscriptions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 11. ORDERS & 12. ORDER ITEMS
DROP POLICY IF EXISTS "orders_select_participants_or_admin" ON public.orders;
CREATE POLICY "orders_select_participants_or_admin" ON public.orders
  FOR SELECT USING (
    retailer_id = auth.uid()
    OR wholesaler_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "order_items_select_participants_or_admin" ON public.order_items;
CREATE POLICY "order_items_select_participants_or_admin" ON public.order_items
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND (o.retailer_id = auth.uid() OR o.wholesaler_id = auth.uid())
    )
  );

-- 13. CARTS & 14. CART ITEMS
DROP POLICY IF EXISTS "carts_owner_all" ON public.carts;
CREATE POLICY "carts_owner_all" ON public.carts
  FOR ALL USING (retailer_id = auth.uid()) WITH CHECK (retailer_id = auth.uid());

DROP POLICY IF EXISTS "cart_items_owner_all" ON public.cart_items;
CREATE POLICY "cart_items_owner_all" ON public.cart_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.retailer_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.retailer_id = auth.uid())
  );

-- 15. ENQUIRIES
DROP POLICY IF EXISTS "enquiries_select_participants_or_admin" ON public.enquiries;
CREATE POLICY "enquiries_select_participants_or_admin" ON public.enquiries
  FOR SELECT USING (
    retailer_id = auth.uid() OR wholesaler_id = auth.uid() OR public.is_admin()
  );

DROP POLICY IF EXISTS "enquiries_retailer_insert" ON public.enquiries;
CREATE POLICY "enquiries_retailer_insert" ON public.enquiries
  FOR INSERT WITH CHECK (retailer_id = auth.uid() AND public.current_user_role() = 'RETAILER');

DROP POLICY IF EXISTS "enquiries_wholesaler_reply" ON public.enquiries;
CREATE POLICY "enquiries_wholesaler_reply" ON public.enquiries
  FOR UPDATE USING (wholesaler_id = auth.uid())
  WITH CHECK (wholesaler_id = auth.uid());

-- 16. REVIEWS
DROP POLICY IF EXISTS "reviews_public_read" ON public.reviews;
CREATE POLICY "reviews_public_read" ON public.reviews
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "reviews_verified_retailer_insert" ON public.reviews;
CREATE POLICY "reviews_verified_retailer_insert" ON public.reviews
  FOR INSERT WITH CHECK (
    retailer_id = auth.uid()
    AND public.current_user_role() = 'RETAILER'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.retailer_id = auth.uid()
        AND oi.product_id = reviews.product_id
        AND o.status = 'delivered'
    )
  );

-- 17. PAYMENTS
DROP POLICY IF EXISTS "payments_select_participants_or_admin" ON public.payments;
CREATE POLICY "payments_select_participants_or_admin" ON public.payments
  FOR SELECT USING (
    payer_id = auth.uid() OR payee_id = auth.uid() OR public.is_admin()
  );

-- Wholesaler can submit a pending subscription payment proof record; never verified!
DROP POLICY IF EXISTS "payments_insert_pending_subscription_proof" ON public.payments;
CREATE POLICY "payments_insert_pending_subscription_proof" ON public.payments
  FOR INSERT WITH CHECK (
    payer_id = auth.uid()
    AND payment_purpose = 'subscription'
    AND status = 'pending_verification'
    AND verified_by IS NULL
    AND verified_at IS NULL
  );

DROP POLICY IF EXISTS "payments_admin_all" ON public.payments;
CREATE POLICY "payments_admin_all" ON public.payments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 18. NOTIFICATIONS
DROP POLICY IF EXISTS "notifications_owner_select" ON public.notifications;
CREATE POLICY "notifications_owner_select" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_owner_update_read" ON public.notifications;
CREATE POLICY "notifications_owner_update_read" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_admin_select" ON public.notifications;
CREATE POLICY "notifications_admin_select" ON public.notifications
  FOR SELECT USING (public.is_admin());

-- 19. PRODUCT REPORTS
DROP POLICY IF EXISTS "product_reports_select_own_or_admin" ON public.product_reports;
CREATE POLICY "product_reports_select_own_or_admin" ON public.product_reports
  FOR SELECT USING (reporter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "product_reports_insert_authenticated" ON public.product_reports;
CREATE POLICY "product_reports_insert_authenticated" ON public.product_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid() AND status = 'open');

DROP POLICY IF EXISTS "product_reports_admin_update" ON public.product_reports;
CREATE POLICY "product_reports_admin_update" ON public.product_reports
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 20. STOCK MOVEMENTS
DROP POLICY IF EXISTS "stock_movements_select_owner_or_admin" ON public.stock_movements;
CREATE POLICY "stock_movements_select_owner_or_admin" ON public.stock_movements
  FOR SELECT USING (wholesaler_id = auth.uid() OR public.is_admin());
