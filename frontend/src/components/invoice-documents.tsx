"use client";

import { sourceText } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { authConfigured } from "@/lib/supabase";
import { ErrorState, Loading, Panel } from "@/components/ui/primitives";

export function InvoiceDocuments({ invoiceId }: { invoiceId: string }) {
  const { t, message: localizeMessage, number } = useI18n();

  const load = useCallback(() => api.documents(invoiceId), [invoiceId]);
  const feed = useApi(load);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!authConfigured) return null;
  async function upload() {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      await api.uploadDocument(invoiceId, file);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await feed.refresh();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : sourceText("upload-failed")); }
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : sourceText("download-failed")); }
  }
  return <Panel className="invoice-documents"><h2>{t("private-invoice-evidence")}</h2><p>{t("pdf-png-or-jpeg-up-to-10-mb")}</p>
    {feed.loading ? <Loading/> : feed.error ? <ErrorState message={feed.error} retry={feed.refresh}/> :
      feed.data?.length ? <ul>{feed.data.map(document => <li key={document.id}><span>{document.content_type} · {number(Math.round(document.size_bytes / 1024))} {t("kb")}</span><button type="button" className="button quiet" onClick={() => void download(document.id)}>{t("download")}</button></li>)}</ul> : <p className="muted">{t("no-documents-attached")}</p>}
    <div className="document-upload">
      <input ref={fileInput} type="file" hidden accept="application/pdf,image/png,image/jpeg" aria-label={t("choose-invoice-document")} onChange={event => setFile(event.target.files?.[0] || null)}/>
      <button type="button" className="button quiet" disabled={busy} onClick={() => fileInput.current?.click()}>{t("choose-invoice-document")}</button>
      <span className="muted" aria-live="polite">{file ? t("selected-file", { p0: file.name }) : t("no-file-selected")}</span>
      <button type="button" className="button secondary" disabled={!file || busy} onClick={() => void upload()}>{busy ? t("uploading") : t("upload-document")}</button>
    </div>
    {error && <div className="notice danger" role="alert">{localizeMessage(error)}</div>}
  </Panel>;
}
