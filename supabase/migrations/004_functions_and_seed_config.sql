-- ============================================================================
-- OM – OPEN MARKET | Migration 004: Atomic Transactions, Triggers & Initial Config
-- ============================================================================
-- Run this fourth in your Supabase Dashboard -> SQL Editor.
-- NOTE: This inserts ONLY initial marketplace categories and subscription plan
-- definitions. ZERO demo users, products, orders, or payments are inserted.

-- 1. Automatic Profile & Business creation upon Auth Signup (blocks ADMIN signup!)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role TEXT;
  safe_role TEXT;
  meta JSONB;
BEGIN
  meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  requested_role := UPPER(COALESCE(meta->>'role', 'RETAILER'));

  -- Security: NEVER allow public registration as ADMIN
  IF requested_role = 'WHOLESALER' THEN
    safe_role := 'WHOLESALER';
  ELSE
    safe_role := 'RETAILER';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, mobile, role, account_status)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(meta->>'full_name'), ''), 'Account User'),
    NEW.email,
    COALESCE(NULLIF(TRIM(meta->>'mobile'), ''), ''),
    safe_role,
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create associated business record if registration metadata includes business_name
  IF NULLIF(TRIM(meta->>'business_name'), '') IS NOT NULL THEN
    INSERT INTO public.businesses (
      owner_id,
      business_type,
      business_name,
      business_category,
      description,
      gst_number,
      contact_person,
      contact_phone,
      contact_email,
      address,
      city,
      state,
      pin_code,
      verification_status,
      approved_at
    )
    VALUES (
      NEW.id,
      safe_role,
      TRIM(meta->>'business_name'),
      COALESCE(NULLIF(TRIM(meta->>'business_category'), ''), 'General Merchandise'),
      NULLIF(TRIM(meta->>'description'), ''),
      NULLIF(TRIM(meta->>'gst_number'), ''),
      COALESCE(NULLIF(TRIM(meta->>'contact_person'), ''), COALESCE(NULLIF(TRIM(meta->>'full_name'), ''), 'Owner')),
      COALESCE(NULLIF(TRIM(meta->>'mobile'), ''), ''),
      NEW.email,
      COALESCE(NULLIF(TRIM(meta->>'address'), ''), ''),
      COALESCE(NULLIF(TRIM(meta->>'city'), ''), ''),
      COALESCE(NULLIF(TRIM(meta->>'state'), ''), ''),
      COALESCE(NULLIF(TRIM(meta->>'pin_code'), ''), ''),
      CASE WHEN safe_role = 'RETAILER' THEN 'approved' ELSE 'pending' END,
      CASE WHEN safe_role = 'RETAILER' THEN NOW() ELSE NULL END
    )
    ON CONFLICT (owner_id) DO NOTHING;
  END IF;

  -- Create empty cart for retailers
  IF safe_role = 'RETAILER' THEN
    INSERT INTO public.carts (retailer_id) VALUES (NEW.id) ON CONFLICT (retailer_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Enforce Wholesaler Business Approval before publishing products (Subscription gate paused)
CREATE OR REPLACE FUNCTION public.enforce_wholesaler_listing_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  biz_status TEXT;
BEGIN
  IF NEW.listing_status = 'published' AND NEW.is_removed = FALSE THEN
    SELECT verification_status INTO biz_status
    FROM public.businesses
    WHERE id = NEW.business_id AND owner_id = NEW.wholesaler_id;

    IF biz_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'Your wholesaler business must be approved by an administrator before publishing products.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_wholesaler_listing_limit ON public.products;
CREATE TRIGGER trg_enforce_wholesaler_listing_limit
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_wholesaler_listing_limit();

-- 3. Atomic Multi-Supplier Checkout RPC
CREATE OR REPLACE FUNCTION public.create_multi_supplier_order(
  p_retailer_name TEXT,
  p_shop_name TEXT,
  p_contact_number TEXT,
  p_delivery_address TEXT,
  p_pin_code TEXT,
  p_fulfillment_type TEXT,
  p_payment_method TEXT,
  p_order_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_account_status TEXT;
  v_cart_id UUID;
  v_checkout_group_id UUID := gen_random_uuid();
  v_supplier RECORD;
  v_item RECORD;
  v_tier_price NUMERIC(12, 2);
  v_unit_price NUMERIC(12, 2);
  v_line_total NUMERIC(12, 2);
  v_order_total NUMERIC(12, 2);
  v_order_id UUID;
  v_order_number TEXT;
  v_created_orders JSONB := '[]'::jsonb;
  v_cart_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT role, account_status INTO v_role, v_account_status
  FROM public.profiles WHERE id = v_user_id;

  IF v_role <> 'RETAILER' OR v_account_status <> 'active' THEN
    RAISE EXCEPTION 'Only active retailer accounts can place orders.';
  END IF;

  IF p_fulfillment_type NOT IN ('delivery', 'pickup') THEN
    RAISE EXCEPTION 'Invalid fulfillment type.';
  END IF;

  IF p_payment_method NOT IN ('cod', 'upi_direct', 'bank_transfer') THEN
    RAISE EXCEPTION 'Invalid payment method.';
  END IF;

  SELECT id INTO v_cart_id FROM public.carts WHERE retailer_id = v_user_id FOR UPDATE;
  IF v_cart_id IS NULL THEN
    RAISE EXCEPTION 'Shopping cart not found.';
  END IF;

  SELECT COUNT(*) INTO v_cart_count FROM public.cart_items WHERE cart_id = v_cart_id;
  IF v_cart_count = 0 THEN
    RAISE EXCEPTION 'Your cart is empty.';
  END IF;

  -- Lock & process each distinct wholesaler separately
  FOR v_supplier IN
    SELECT DISTINCT p.wholesaler_id, p.business_id, b.business_name
    FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
    JOIN public.businesses b ON b.id = p.business_id
    WHERE ci.cart_id = v_cart_id
    ORDER BY p.wholesaler_id
  LOOP
    v_order_total := 0;
    v_order_number := 'OM-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 6));

    INSERT INTO public.orders (
      order_number, checkout_group_id, retailer_id, wholesaler_id, business_id,
      status, total_amount, retailer_name, shop_name, contact_number,
      delivery_address, pin_code, fulfillment_type, payment_method, payment_status, order_notes
    )
    VALUES (
      v_order_number, v_checkout_group_id, v_user_id, v_supplier.wholesaler_id, v_supplier.business_id,
      'pending', 0, TRIM(p_retailer_name), TRIM(p_shop_name), TRIM(p_contact_number),
      TRIM(p_delivery_address), TRIM(p_pin_code), p_fulfillment_type, p_payment_method, 'unpaid', NULLIF(TRIM(COALESCE(p_order_notes, '')), '')
    )
    RETURNING id INTO v_order_id;

    FOR v_item IN
      SELECT
        ci.id AS cart_item_id,
        ci.quantity,
        p.id AS product_id,
        p.name AS product_name,
        p.sku,
        p.unit,
        p.wholesale_price,
        p.moq,
        p.listing_status,
        p.is_removed,
        p.availability_status,
        inv.id AS inventory_id,
        inv.available_stock
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      JOIN public.inventory inv ON inv.product_id = p.id
      WHERE ci.cart_id = v_cart_id AND p.wholesaler_id = v_supplier.wholesaler_id
      FOR UPDATE OF inv
    LOOP
      IF NOT public.is_product_publicly_visible(v_item.product_id) THEN
        RAISE EXCEPTION 'Product "%" is no longer available for purchase.', v_item.product_name;
      END IF;

      IF v_item.availability_status = 'out_of_stock' OR v_item.available_stock < v_item.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for "%" (Available: %, Requested: %).', v_item.product_name, v_item.available_stock, v_item.quantity;
      END IF;

      IF v_item.quantity < v_item.moq THEN
        RAISE EXCEPTION 'Minimum order quantity for "%" is % %.', v_item.product_name, v_item.moq, v_item.unit;
      END IF;

      -- Resolve applicable bulk pricing tier
      SELECT pt.unit_price INTO v_tier_price
      FROM public.pricing_tiers pt
      WHERE pt.product_id = v_item.product_id
        AND v_item.quantity >= pt.min_qty
        AND (pt.max_qty IS NULL OR v_item.quantity <= pt.max_qty)
      ORDER BY pt.min_qty DESC
      LIMIT 1;

      v_unit_price := COALESCE(v_tier_price, v_item.wholesale_price);
      v_line_total := ROUND(v_unit_price * v_item.quantity, 2);
      v_order_total := v_order_total + v_line_total;

      INSERT INTO public.order_items (
        order_id, product_id, product_name, sku, unit, quantity, unit_price, line_total
      )
      VALUES (
        v_order_id, v_item.product_id, v_item.product_name, v_item.sku, v_item.unit,
        v_item.quantity, v_unit_price, v_line_total
      );

      -- Deduct inventory & log stock movement
      UPDATE public.inventory
      SET available_stock = available_stock - v_item.quantity,
          reserved_stock = reserved_stock + v_item.quantity
      WHERE id = v_item.inventory_id;

      IF (v_item.available_stock - v_item.quantity) = 0 THEN
        UPDATE public.products SET availability_status = 'out_of_stock' WHERE id = v_item.product_id;
      END IF;

      INSERT INTO public.stock_movements (
        product_id, wholesaler_id, change_amount, previous_stock, new_stock,
        movement_type, reference_id, note
      )
      VALUES (
        v_item.product_id, v_supplier.wholesaler_id, -v_item.quantity,
        v_item.available_stock, v_item.available_stock - v_item.quantity,
        'order_reserved', v_order_id, 'Reserved by order ' || v_order_number
      );
    END LOOP;

    UPDATE public.orders SET total_amount = v_order_total WHERE id = v_order_id;

    -- Create initial unpaid direct-payment record
    INSERT INTO public.payments (
      payer_id, payee_id, payment_purpose, order_id, amount, currency,
      payment_method, status, notes
    )
    VALUES (
      v_user_id, v_supplier.wholesaler_id, 'order_direct', v_order_id, v_order_total, 'INR',
      p_payment_method, 'pending', 'Direct retailer-to-wholesaler payment awaiting settlement'
    );

    -- Notify wholesaler
    INSERT INTO public.notifications (user_id, title, message, type, link_path)
    VALUES (
      v_supplier.wholesaler_id,
      'New Order Received (' || v_order_number || ')',
      'Order placed by ' || TRIM(p_shop_name) || ' for ₹' || TO_CHAR(v_order_total, 'FM999,999,990.00'),
      'order',
      '/wholesaler/orders'
    );

    v_created_orders := v_created_orders || jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'business_name', v_supplier.business_name,
      'total_amount', v_order_total
    );
  END LOOP;

  -- Clear cart items after successful transaction
  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

  RETURN jsonb_build_object(
    'checkout_group_id', v_checkout_group_id,
    'orders', v_created_orders
  );
END;
$$;

-- 4. Atomic Stock Adjustment RPC for Wholesalers
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id UUID,
  p_delta INTEGER,
  p_movement_type TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_inv RECORD;
  v_new_stock INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_movement_type NOT IN ('restock', 'manual_reduction', 'adjustment', 'initial') THEN
    RAISE EXCEPTION 'Invalid movement type.';
  END IF;

  SELECT * INTO v_inv
  FROM public.inventory
  WHERE product_id = p_product_id AND wholesaler_id = v_user_id
  FOR UPDATE;

  IF v_inv IS NULL THEN
    RAISE EXCEPTION 'Product inventory record not found or unauthorized.';
  END IF;

  v_new_stock := v_inv.available_stock + p_delta;
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'Stock cannot become negative (Current: %, Change: %).', v_inv.available_stock, p_delta;
  END IF;

  UPDATE public.inventory SET available_stock = v_new_stock WHERE id = v_inv.id;

  UPDATE public.products
  SET availability_status = CASE WHEN v_new_stock = 0 THEN 'out_of_stock' ELSE 'in_stock' END
  WHERE id = p_product_id AND availability_status <> 'made_to_order';

  INSERT INTO public.stock_movements (
    product_id, wholesaler_id, change_amount, previous_stock, new_stock, movement_type, note
  )
  VALUES (
    p_product_id, v_user_id, p_delta, v_inv.available_stock, v_new_stock, p_movement_type, p_note
  );

  RETURN v_new_stock;
END;
$$;

-- 5. Atomic Order Status Update RPC (handles stock restoration & notifications)
CREATE OR REPLACE FUNCTION public.update_order_status_secure(
  p_order_id UUID,
  p_new_status TEXT,
  p_status_note TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order RECORD;
  v_item RECORD;
  v_prev_stock INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  -- Retailer can only cancel their own pending order
  IF v_order.retailer_id = v_user_id AND p_new_status = 'cancelled' THEN
    IF v_order.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending orders can be cancelled.';
    END IF;
  ELSIF v_order.wholesaler_id = v_user_id THEN
    IF p_new_status NOT IN ('accepted', 'rejected', 'processing', 'shipped', 'delivered') THEN
      RAISE EXCEPTION 'Invalid status transition for wholesaler.';
    END IF;
    IF v_order.status IN ('rejected', 'cancelled', 'delivered') THEN
      RAISE EXCEPTION 'Order is already finalized (%).', v_order.status;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized to modify this order.';
  END IF;

  UPDATE public.orders
  SET status = p_new_status,
      status_note = COALESCE(NULLIF(TRIM(COALESCE(p_status_note, '')), ''), status_note)
  WHERE id = p_order_id;

  -- Restore stock if rejected or cancelled
  IF p_new_status IN ('rejected', 'cancelled') THEN
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
      SELECT available_stock INTO v_prev_stock FROM public.inventory WHERE product_id = v_item.product_id FOR UPDATE;
      UPDATE public.inventory
      SET available_stock = available_stock + v_item.quantity,
          reserved_stock = GREATEST(0, reserved_stock - v_item.quantity)
      WHERE product_id = v_item.product_id;

      UPDATE public.products
      SET availability_status = 'in_stock'
      WHERE id = v_item.product_id AND availability_status = 'out_of_stock';

      INSERT INTO public.stock_movements (
        product_id, wholesaler_id, change_amount, previous_stock, new_stock,
        movement_type, reference_id, note
      )
      VALUES (
        v_item.product_id, v_order.wholesaler_id, v_item.quantity,
        v_prev_stock, v_prev_stock + v_item.quantity,
        'order_restored', p_order_id, 'Stock restored on order ' || p_new_status
      );
    END LOOP;
  ELSIF p_new_status = 'delivered' THEN
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
      UPDATE public.inventory
      SET reserved_stock = GREATEST(0, reserved_stock - v_item.quantity)
      WHERE product_id = v_item.product_id;
    END LOOP;
  END IF;

  -- Send notification to counterparty
  IF p_new_status = 'cancelled' THEN
    INSERT INTO public.notifications (user_id, title, message, type, link_path)
    VALUES (
      v_order.wholesaler_id,
      'Order Cancelled (' || v_order.order_number || ')',
      v_order.shop_name || ' cancelled order ' || v_order.order_number || '.',
      'order',
      '/wholesaler/orders'
    );
  ELSE
    INSERT INTO public.notifications (user_id, title, message, type, link_path)
    VALUES (
      v_order.retailer_id,
      'Order ' || INITCAP(p_new_status) || ' (' || v_order.order_number || ')',
      'Your order ' || v_order.order_number || ' is now ' || p_new_status || '.',
      'order',
      '/retailer'
    );
  END IF;

  RETURN p_new_status;
END;
$$;

-- 6. Wholesaler Direct Order Payment Confirmation RPC (for COD / direct UPI / Bank transfer)
CREATE OR REPLACE FUNCTION public.confirm_direct_order_payment(
  p_order_id UUID,
  p_reference_number TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL OR v_order.wholesaler_id <> v_user_id THEN
    RAISE EXCEPTION 'Order not found or unauthorized.';
  END IF;

  UPDATE public.orders SET payment_status = 'verified_paid' WHERE id = p_order_id;
  UPDATE public.payments
  SET status = 'verified',
      reference_number = COALESCE(NULLIF(TRIM(COALESCE(p_reference_number, '')), ''), reference_number),
      verified_by = v_user_id,
      verified_at = NOW(),
      notes = 'Direct payment receipt confirmed by wholesaler'
  WHERE order_id = p_order_id AND payment_purpose = 'order_direct';

  INSERT INTO public.notifications (user_id, title, message, type, link_path)
  VALUES (
    v_order.retailer_id,
    'Payment Confirmed (' || v_order.order_number || ')',
    'Supplier confirmed receipt of direct payment for order ' || v_order.order_number || '.',
    'order',
    '/retailer'
  );

  RETURN 'verified_paid';
END;
$$;

-- 7. Initial Marketplace Categories (System Taxonomy Configuration)
INSERT INTO public.categories (name, slug, description, sort_order) VALUES
  ('Grocery', 'grocery', 'Staples, grains, pulses, packaged food, beverages, and FMCG bulk supplies', 1),
  ('Electronics', 'electronics', 'Consumer electronics, appliances, LED lighting, and electrical supplies', 2),
  ('Mobile accessories', 'mobile-accessories', 'Chargers, cables, cases, screen protectors, and audio accessories', 3),
  ('Clothing', 'clothing', 'Wholesale apparel, ethnic wear, casualwear, uniforms, and textiles', 4),
  ('Footwear', 'footwear', 'Casual shoes, formal footwear, sandals, slippers, and sports footwear', 5),
  ('Cosmetics', 'cosmetics', 'Personal care, skincare, grooming, beauty, and salon wholesale supplies', 6),
  ('Stationery', 'stationery', 'Office supplies, notebooks, paper products, pens, and school essentials', 7),
  ('Household products', 'household-products', 'Cleaning agents, detergents, utility items, and daily home essentials', 8),
  ('Kitchen products', 'kitchen-products', 'Cookware, steel utensils, storage containers, and kitchenware', 9),
  ('Packaging materials', 'packaging-materials', 'Corrugated boxes, tapes, stretch film, pouches, and shipping supplies', 10),
  ('General merchandise', 'general-merchandise', 'Multi-category trade goods, hardware, seasonal items, and assorted stock', 11)
ON CONFLICT (slug) DO NOTHING;

-- Initial Subcategories (System Taxonomy)
INSERT INTO public.subcategories (category_id, name, slug)
SELECT c.id, sub.name, sub.slug
FROM public.categories c
CROSS JOIN LATERAL (
  VALUES
    ('grocery', 'Grains & Pulses', 'grains-pulses'),
    ('grocery', 'Edible Oils & Spices', 'edible-oils-spices'),
    ('grocery', 'Beverages & Snacks', 'beverages-snacks'),
    ('electronics', 'LED & Electricals', 'led-electricals'),
    ('electronics', 'Small Appliances', 'small-appliances'),
    ('mobile-accessories', 'Cables & Chargers', 'cables-chargers'),
    ('mobile-accessories', 'Cases & Tempered Glass', 'cases-tempered-glass'),
    ('clothing', 'Men''s Apparel', 'mens-apparel'),
    ('clothing', 'Women''s Apparel', 'womens-apparel'),
    ('footwear', 'Sports & Casual', 'sports-casual'),
    ('cosmetics', 'Skincare & Haircare', 'skincare-haircare'),
    ('stationery', 'Paper & Notebooks', 'paper-notebooks'),
    ('household-products', 'Cleaning & Laundry', 'cleaning-laundry'),
    ('kitchen-products', 'Cookware & Utensils', 'cookware-utensils'),
    ('packaging-materials', 'Boxes & Tapes', 'boxes-tapes'),
    ('general-merchandise', 'Assorted Trade Goods', 'assorted-trade-goods')
) AS sub(cat_slug, name, slug)
WHERE c.slug = sub.cat_slug
ON CONFLICT (category_id, slug) DO NOTHING;

-- 8. Initial Subscription Plans (System Pricing Configuration)
INSERT INTO public.subscription_plans (code, name, description, price_inr, billing_cycle_days, grace_period_days, max_active_products, features)
VALUES
  (
    'STARTER',
    'Starter Plan',
    'For new wholesalers launching their digital B2B catalog on OM.',
    299.00,
    30,
    3,
    50,
    '["Up to 50 active product listings", "Public wholesaler profile", "Direct retailer orders & enquiries", "Bulk pricing tiers"]'::jsonb
  ),
  (
    'GROWTH',
    'Growth Plan',
    'For established distributors scaling multi-category wholesale inventory.',
    599.00,
    30,
    5,
    500,
    '["Up to 500 active product listings", "Multi-image product galleries", "Inventory movement audit logs", "Priority marketplace indexing"]'::jsonb
  ),
  (
    'PREMIUM',
    'Premium Plan',
    'For high-volume manufacturers and regional wholesale hubs.',
    999.00,
    30,
    7,
    2000,
    '["Up to 2,000 active product listings", "Full bulk tier pricing suite", "Dedicated account verification badge", "Extended 7-day renewal grace period"]'::jsonb
  )
ON CONFLICT (code) DO NOTHING;

-- 9. Automatic Notifications for Enquiries, Approvals & Subscription Changes
CREATE OR REPLACE FUNCTION public.notify_on_enquiry_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, title, message, type, link_path)
    VALUES (
      NEW.wholesaler_id,
      'New Retailer Enquiry',
      'Subject: ' || NEW.subject,
      'enquiry',
      '/wholesaler/enquiries'
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.reply_message IS NULL AND NEW.reply_message IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, link_path)
    VALUES (
      NEW.retailer_id,
      'Supplier Responded to Your Enquiry',
      'Reply received for "' || NEW.subject || '".',
      'enquiry',
      '/retailer/enquiries'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_enquiry ON public.enquiries;
CREATE TRIGGER trg_notify_on_enquiry
  AFTER INSERT OR UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_enquiry_change();

CREATE OR REPLACE FUNCTION public.notify_on_business_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.business_type = 'WHOLESALER' AND OLD.verification_status IS DISTINCT FROM NEW.verification_status THEN
    INSERT INTO public.notifications (user_id, title, message, type, link_path)
    VALUES (
      NEW.owner_id,
      'Wholesaler Verification: ' || INITCAP(NEW.verification_status),
      CASE
        WHEN NEW.verification_status = 'approved' THEN
          'Your business "' || NEW.business_name || '" is approved! You can now publish wholesale products to the marketplace.'
        ELSE
          'Your wholesaler verification status changed to ' || NEW.verification_status || '.'
      END,
      'account',
      '/wholesaler'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_business_verification ON public.businesses;
CREATE TRIGGER trg_notify_on_business_verification
  AFTER UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_business_verification();

