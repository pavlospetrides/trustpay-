import { sourceText } from "../../i18n/core";
import { createClient } from "@supabase/supabase-js";
import { MAX_DOCUMENT_BYTES } from "./document";

type Bucket = {
  upload(path: string, data: Buffer, options: { contentType: string; upsert: false }): Promise<{ error: unknown }>;
  download(path: string): Promise<{ data: Blob | null; error: unknown }>;
  remove(paths: string[]): Promise<{ error: unknown }>;
};
type StorageClient = { storage: { from(name: string): Bucket } };

export class PrivateInvoiceStorage {
  constructor(private readonly client: StorageClient) {}
  private bucket(): Bucket { return this.client.storage.from("invoice-documents"); }
  async upload(path: string, contentType: string, data: Buffer): Promise<void> {
    const result = await this.bucket().upload(path, data, { contentType, upsert: false });
    if (result.error) throw new Error(sourceText("private-storage-rejected-the-upload"));
  }
  async download(path: string): Promise<Buffer> {
    const result = await this.bucket().download(path);
    if (result.error || !result.data) throw new Error(sourceText("private-document-unavailable"));
    const data = Buffer.from(await result.data.arrayBuffer());
    if (data.length > MAX_DOCUMENT_BYTES) throw new Error(sourceText("private-document-exceeds-configured-limit"));
    return data;
  }
  async remove(path: string): Promise<void> {
    const result = await this.bucket().remove([path]);
    if (result.error) throw new Error(sourceText("private-document-cleanup-failed"));
  }
}

let storage: PrivateInvoiceStorage | null = null;
export function privateInvoiceStorage(): PrivateInvoiceStorage {
  if (storage) return storage;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(sourceText("private-invoice-storage-is-not-configured"));
  storage = new PrivateInvoiceStorage(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as StorageClient);
  return storage;
}
