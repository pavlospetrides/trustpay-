import { describe, expect, it } from "vitest";
import { PrivateInvoiceStorage } from "./private-storage";

describe("private invoice Storage boundary", () => {
  it("uploads without upsert and downloads only through the private bucket", async () => {
    const calls: unknown[] = [];
    const fake = { storage: { from: (bucket: string) => { calls.push(bucket); return {
      upload: async (path: string, _data: Buffer, options: unknown) => { calls.push([path, options]); return { error: null }; },
      download: async (path: string) => { calls.push(path); return { data: new Blob(["PDF"]), error: null }; },
      remove: async () => ({ error: null }),
    }; } } };
    const storage = new PrivateInvoiceStorage(fake);
    const path = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/doc.pdf";
    await storage.upload(path, "application/pdf", Buffer.from("%PDF-"));
    expect((await storage.download(path)).toString()).toBe("PDF");
    expect(calls).toContain("invoice-documents");
    expect(calls).toContainEqual([path, { contentType: "application/pdf", upsert: false }]);
  });
});
