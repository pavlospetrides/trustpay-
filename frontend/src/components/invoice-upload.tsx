"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { FileUp, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { validateInvoiceFile } from "@/lib/intake";
import { authConfigured } from "@/lib/supabase";
import { Panel } from "./ui/primitives";

export function InvoiceUpload() {
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
      setError(cause instanceof Error ? cause.message : "Upload failed. Try again.");
      setBusy(false);
    }
  }

  if (!authConfigured) return null;
  return <Panel className="intake-upload-panel">
    <div className="section-head"><div><span className="overline">PRIVATE INVOICE INTAKE</span><h2>Upload and review an invoice</h2><p>Extract proposed fields, correct them, then run the auditable risk check.</p></div><ShieldCheck size={25} aria-hidden="true"/></div>
    <div className={`intake-dropzone ${dragging ? "is-dragging" : ""}`}
      onDragEnter={event => { event.preventDefault(); setDragging(true); }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={event => { event.preventDefault(); setDragging(false); }}
      onDrop={drop}>
      <FileUp size={30} aria-hidden="true"/>
      <strong>{file ? file.name : "Drop a synthetic invoice here"}</strong>
      <span>{file ? `${(file.size / 1024).toFixed(0)} KB selected` : "PDF, PNG, JPEG, or WEBP · up to 10 MB"}</span>
      <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
        aria-label="Choose invoice file" onChange={event => choose(event.target.files?.item(0) || null)}/>
      <button type="button" className="button secondary" disabled={busy} onClick={() => input.current?.click()}>Choose file</button>
    </div>
    {busy && <div className="intake-progress" role="status"><progress aria-label="Uploading and extracting invoice"/>Uploading and extracting proposed fields…</div>}
    {error && <div className="notice danger" role="alert">{error}</div>}
    <div className="intake-upload-actions"><span>Use fictional invoices only. Original files stay in private Storage.</span><button className="button primary" type="button" disabled={!file || busy} onClick={() => void upload()}>Upload invoice</button></div>
  </Panel>;
}
