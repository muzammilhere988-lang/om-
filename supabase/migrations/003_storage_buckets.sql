-- ============================================================================
-- OM – OPEN MARKET | Migration 003: Supabase Storage Buckets & Policies
-- ============================================================================
-- Run this third in your Supabase Dashboard -> SQL Editor.

-- Create public-read buckets with strict 5MB file size limit & image MIME restrictions
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('business-logos', 'business-logos', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('profile-pictures', 'profile-pictures', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read access for marketplace display
DROP POLICY IF EXISTS "public_read_om_media" ON storage.objects;
CREATE POLICY "public_read_om_media"
ON storage.objects FOR SELECT
USING (bucket_id IN ('product-images', 'business-logos', 'profile-pictures'));

-- Product Images: Only active WHOLESALER can upload/modify/delete inside their own {uid}/ folder
DROP POLICY IF EXISTS "wholesaler_upload_own_product_images" ON storage.objects;
CREATE POLICY "wholesaler_upload_own_product_images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.current_user_role() = 'WHOLESALER'
);

DROP POLICY IF EXISTS "wholesaler_update_own_product_images" ON storage.objects;
CREATE POLICY "wholesaler_update_own_product_images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.current_user_role() = 'WHOLESALER'
);

DROP POLICY IF EXISTS "wholesaler_delete_own_product_images" ON storage.objects;
CREATE POLICY "wholesaler_delete_own_product_images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.current_user_role() = 'WHOLESALER'
);

-- Business Logos & Profile Pictures: Authenticated users can manage only their own {uid}/ folder
DROP POLICY IF EXISTS "user_manage_own_logo_and_avatar_insert" ON storage.objects;
CREATE POLICY "user_manage_own_logo_and_avatar_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('business-logos', 'profile-pictures')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "user_manage_own_logo_and_avatar_update" ON storage.objects;
CREATE POLICY "user_manage_own_logo_and_avatar_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('business-logos', 'profile-pictures')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "user_manage_own_logo_and_avatar_delete" ON storage.objects;
CREATE POLICY "user_manage_own_logo_and_avatar_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id IN ('business-logos', 'profile-pictures')
  AND (storage.foldername(name))[1] = auth.uid()::text
);
