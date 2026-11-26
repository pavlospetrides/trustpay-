"use client";

import { sourceText } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { FileUp, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { validateInvoiceFile } from "@/lib/intake";
import { authConfigured } from "@/lib/supabase";
import { Panel } from "./ui/primitives";

export function InvoiceUpload() {
  const { t, message: localizeMessage, number } = useI18n();

  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function choose(next: File | null) {
    setError("");
    if (!next) return;
    const problem = validateInvoiceFile(next);
    if (problem) { setFile(null); setError(problem); return; }
    setFile(next);
    setKey(crypto.randomUUID());
  }

  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files.item(0));
  }

  async function upload() {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      const intake = await api.uploadIntake(file, key);
      router.push(`/app/intakes/${encodeURIComponent(intake.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : sourceText("upload-failed-try-again"));
      setBusy(false);
    }
  }

  if (!authConfigured) return null;
  return <Panel className="intake-upload-panel">
    <div className="section-head"><div><span className="overline">{t("private-invoice-intake")}</span><h2>{t("upload-and-review-an-invoice")}</h2><p>{t("extract-proposed-fields-correct-them-then-run-the")}</p></div><ShieldCheck size={25} aria-hidden="true"/></div>
    <div className={`intake-dropzone ${dragging ? "is-dragging" : ""}`}
      onDragEnter={event => { event.preventDefault(); setDragging(true); }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={event => { event.preventDefault(); setDragging(false); }}
      onDrop={drop}>
      <FileUp size={30} aria-hidden="true"/>
      <strong>{file ? <bdi>{file.name}</bdi> : t("drop-a-synthetic-invoice-here")}</strong>
      <span>{file ? t("upload.selected-size", { p0: number(Math.round(file.size / 1024)) }) : t("pdf-png-or-jpeg-up-to-10-mb-2")}</span>
      <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        aria-label={t("choose-invoice-file")} onChange={event => choose(event.target.files?.item(0) || null)}/>
      <button type="button" className="button secondary" disabled={busy} onClick={() => input.current?.click()}>{t("choose-file")}</button>
    </div>
    {busy && <div className="intake-progress" role="status"><progress aria-label={t("uploading-and-extracting-invoice")}/>{t("uploading-and-extracting-proposed-fields")}</div>}
    {error && <div className="notice danger" role="alert">{localizeMessage(error)}</div>}
    <div className="intake-upload-actions"><span>{t("use-fictional-invoices-only-original-files-stay-in")}</span><button className="button primary" type="button" disabled={!file || busy} onClick={() => void upload()}>{t("upload-invoice")}</button></div>
  </Panel>;
}
