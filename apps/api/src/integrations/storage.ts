import { createClient } from '@supabase/supabase-js';

/**
 * Private document storage (Supabase Storage). Uses the service-role key and
 * is the only place that touches Storage. Clients never get permanent URLs:
 * uploads use short-lived signed upload tokens, downloads use 60-second
 * signed URLs issued only after the API has authorised (and audited) access.
 */
export interface StorageAdapter {
  createSignedUpload(bucket: string, path: string): Promise<{ signedUrl: string; token: string; path: string }>;
  /** Metadata of an uploaded object, or null if it does not exist. */
  stat(bucket: string, path: string): Promise<{ sizeBytes: number; mimeType: string } | null>;
  createSignedDownload(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
}

export function createSupabaseStorage(opts: { supabaseUrl: string; serviceRoleKey: string }): StorageAdapter {
  const client = createClient(opts.supabaseUrl, opts.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async createSignedUpload(bucket, path) {
      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
      if (error || !data) throw new Error(`Could not create upload URL: ${error?.message ?? 'no data'}`);
      return { signedUrl: data.signedUrl, token: data.token, path: data.path };
    },
    async stat(bucket, path) {
      const slash = path.lastIndexOf('/');
      const folder = slash >= 0 ? path.slice(0, slash) : '';
      const name = slash >= 0 ? path.slice(slash + 1) : path;
      const { data, error } = await client.storage.from(bucket).list(folder, { search: name, limit: 10 });
      if (error) throw new Error(`Could not read upload: ${error.message}`);
      const obj = data?.find((o) => o.name === name);
      if (!obj) return null;
      const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
      return { sizeBytes: Number(meta.size ?? 0), mimeType: String(meta.mimetype ?? '') };
    },
    async createSignedDownload(bucket, path, expiresInSeconds) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
      if (error || !data) throw new Error(`Could not create download URL: ${error?.message ?? 'no data'}`);
      return data.signedUrl;
    },
  };
}
