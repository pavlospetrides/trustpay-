"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { authConfigured } from "@/lib/supabase";
import { ErrorState, Loading, Panel } from "@/components/ui/primitives";

export function InvoiceDocuments({ invoiceId }: { invoiceId: string }) {
  const load = useCallback(() => api.documents(invoiceId), [invoiceId]);
  const feed = useApi(load);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!authConfigured) return null;
  async function upload() {
    if (!file || busy) return;
    setBusy(true); setError("");
    try { await api.uploadDocument(invoiceId, file); setFile(null); await feed.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  async function download(documentId: string) {
    setError("");
    try {
      const blob = await api.downloadDocument(invoiceId, documentId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `invoice-${documentId}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Download failed"); }
  }
  return <Panel className="invoice-documents"><h2>Private invoice evidence</h2><p>PDF, PNG, JPEG or WEBP. Up to 10 MB. Access is limited to your organization.</p>
    {feed.loading ? <Loading/> : feed.error ? <ErrorState message={feed.error} retry={feed.refresh}/> :
      feed.data?.length ? <ul>{feed.data.map(document => <li key={document.id}><span>{document.content_type} · {(document.size_bytes / 1024).toFixed(0)} KB</span><button type="button" className="button quiet" onClick={() => void download(document.id)}>Download</button></li>)}</ul> : <p className="muted">No documents attached.</p>}
    <div className="document-upload"><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="Choose invoice document" onChange={event => setFile(event.target.files?.[0] || null)}/><button type="button" className="button secondary" disabled={!file || busy} onClick={() => void upload()}>{busy ? "Uploading…" : "Upload document"}</button></div>
    {error && <div className="notice danger" role="alert">{error}</div>}
  </Panel>;
}
