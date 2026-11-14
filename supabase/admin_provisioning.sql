-- ============================================================================
-- OM – OPEN MARKET | First Administrator Provisioning Script
-- ============================================================================
-- Public admin registration is DISABLED for security.
-- Follow these steps to securely create your first ADMIN account:
--
-- STEP 1: Go to Supabase Dashboard -> Authentication -> Users -> "Add user" -> "Create new user".
--         Enter your Admin email and a strong password, and check "Auto Confirm User".
-- STEP 2: Run the SQL below in Supabase Dashboard -> SQL Editor, replacing
--         'admin@yourdomain.com' with the exact email you just created.

DO $$
DECLARE
  v_uid UUID;
  v_email TEXT := 'admin@yourdomain.com'; -- <-- REPLACE WITH YOUR ADMIN EMAIL
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE LOWER(email) = LOWER(v_email);

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No auth.users account found for %. Create the user in Authentication -> Users first.', v_email;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, mobile, role, account_status)
  VALUES (v_uid, 'OM Platform Administrator', v_email, '+91-0000000000', 'ADMIN', 'active')
  ON CONFLICT (id) DO UPDATE
    SET role = 'ADMIN',
        account_status = 'active';
END $$;
