import { requireSupabase } from './supabase';

export type StorageBucket = 'product-images' | 'business-logos' | 'profile-pictures';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `Unsupported file type (${file.type || 'unknown'}). Please upload JPG, PNG, or WEBP images only.`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File "${file.name}" exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`;
  }
  return null;
}

export async function uploadUserImage(
  bucket: StorageBucket,
  userId: string,
  file: File,
  subfolder = 'general'
): Promise<{ publicUrl: string; storagePath: string }> {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const supabase = requireSupabase();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `${userId}/${subfolder}/${safeName}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });

  if (uploadError) {
    throw new Error(`Image upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return {
    publicUrl: data.publicUrl,
    storagePath,
  };
}
