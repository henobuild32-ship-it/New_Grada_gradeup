import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getSupabaseServerClient } from './supabase-server';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'gradeup';

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
