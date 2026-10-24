import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getSupabaseServerClient } from './supabase-server';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'gradeup';
const PRIVATE_BUCKET = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || 'gradeup-private';

export interface StorageResult {
  url: string;
  provider: 'supabase' | 'local';
}

let resolvedBucket: string | null = null;

/**
 * Résout le bucket Supabase réel en tolérant la casse du nom configuré.
 * Retourne le nom du bucket réel (tel que créé dans Supabase) ou null.
 */
async function resolveBucket(client: NonNullable<ReturnType<typeof getSupabaseServerClient>>): Promise<string | null> {
  if (resolvedBucket) return resolvedBucket;

  // 1) Le nom configuré existe tel quel -> on l'utilise directement.
  const direct = await client.storage.getBucket(BUCKET);
  if (!direct.error) {
    resolvedBucket = direct.data.name;
    return resolvedBucket;
  }

  // 2) Sinon, on cherche un bucket dont le nom correspond en ignorant la casse.
  const { data: buckets, error } = await client.storage.listBuckets();
  if (!error && buckets?.length) {
    const wanted = BUCKET.toLowerCase();
    const match = buckets.find((b) => b.name.toLowerCase() === wanted);
    if (match) {
      resolvedBucket = match.name;
      return resolvedBucket;
    }
  }

  // 3) Aucun bucket trouvé -> on tente de le créer (service role).
  const { error: createErr } = await client.storage.createBucket(BUCKET, { public: true });
  if (!createErr) {
    resolvedBucket = BUCKET;
    return resolvedBucket;
  }

  console.warn(`[storage] Impossibile de résoudre le bucket Supabase "${BUCKET}": ${direct.error?.message} / ${createErr?.message}`);
  resolvedBucket = null;
  return null;
}

/**
 * Uploads a file to Supabase Storage when configured (service role key + bucket),
 * otherwise falls back to the local filesystem under /public/uploads.
 * Returns a publicly reachable URL.
 */
export async function uploadFile(
  buffer: Buffer,
  path: string,
  contentType: string
): Promise<StorageResult> {
  const client = getSupabaseServerClient();

  if (client) {
    const bucket = await resolveBucket(client);
    if (bucket) {
      const { error } = await client.storage
        .from(bucket)
        .upload(path, buffer, { contentType, upsert: true });

      if (!error) {
        const { data } = client.storage.from(bucket).getPublicUrl(path);
        return { url: data.publicUrl, provider: 'supabase' };
      }
      console.warn(`[storage] Supabase upload failed, falling back to local FS: ${error.message}`);
    }
  }

  const uploadsDir = join(process.cwd(), 'public', 'uploads');
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(join(uploadsDir, path), buffer);
  return { url: `/uploads/${path}`, provider: 'local' };
}

export function isCloudStorageConfigured(): boolean {
  return getSupabaseServerClient() !== null;
}

/** Store originals that contain student information in a private Supabase bucket. */
export async function uploadPrivateFile(buffer: Buffer, path: string, contentType: string): Promise<string> {
  const client = getSupabaseServerClient();
  if (!client) throw new Error('Private cloud storage is not configured.');

  const { data: existing, error: lookupError } = await client.storage.getBucket(PRIVATE_BUCKET);
  if (lookupError) {
    const { error: createError } = await client.storage.createBucket(PRIVATE_BUCKET, { public: false });
    if (createError) throw new Error('Private storage is unavailable.');
  } else if (existing.public) {
    throw new Error('The configured private storage bucket is public.');
  }

  const { error } = await client.storage.from(PRIVATE_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error('The original document could not be stored securely.');
  return path;
}

export async function createPrivateFileUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const client = getSupabaseServerClient();
  if (!client) throw new Error('Private cloud storage is not configured.');
  const { data: bucket, error: bucketError } = await client.storage.getBucket(PRIVATE_BUCKET);
  if (bucketError || !bucket || bucket.public) throw new Error('Private storage is unavailable.');
  const { data, error } = await client.storage.from(PRIVATE_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error('The original document is unavailable.');
  return data.signedUrl;
}

export async function deletePrivateFile(path: string): Promise<void> {
  const client = getSupabaseServerClient();
  if (!client) return;
  const { error } = await client.storage.from(PRIVATE_BUCKET).remove([path]);
  if (error) console.warn('[storage] Could not remove temporary private file.');
}
