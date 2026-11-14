-- ============================================================================
-- OM – OPEN MARKET | Migration 005: Pause Subscription Requirement for Now
-- ============================================================================
-- Run this once in Supabase Dashboard -> SQL Editor so approved wholesalers
-- can publish products immediately without needing a subscription plan yet.

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
