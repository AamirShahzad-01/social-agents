import { createServerClient } from './server';

/**
 * @deprecated This method is deprecated. Use Cloudinary for all media uploads.
 * See src/lib/python-backend/api/cloudinary.ts
 */
export async function uploadBase64Image(
  base64Data: string,
  fileName: string,
  bucket: string = 'media'
): Promise<string> {
  throw new Error(
    'DEPRECATED: Supabase Storage is no longer supported for new media. ' +
    'Please use Cloudinary via the Python Backend API. ' +
    'See src/lib/python-backend/api/cloudinary.ts'
  );
}

/**
 * @deprecated This method is deprecated. Use Cloudinary for all media deletions.
 * See src/lib/python-backend/api/cloudinary.ts
 */
export async function deleteFileFromStorage(
  fileUrl: string,
  bucket: string = 'media'
): Promise<void> {
  // Gracefully handle legacy deletions or throw error?
  // Since we migrated, we should probably throw or log warning.
  // For safety, let's throw to identify if any code still uses it.
  throw new Error(
    'DEPRECATED: Supabase Storage is no longer supported. ' +
    'Please use Cloudinary via the Python Backend API. ' +
    'See src/lib/python-backend/api/cloudinary.ts'
  );
}
