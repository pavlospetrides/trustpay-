"use client";
import Link from "next/link";
import { useCallback } from "react";
import { Fingerprint, ScanSearch } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
export function LandingFragment(){const load=useCallback(()=>api.invoice("INV-2409"),[]);const feed=useApi(load);const x=feed.data;return <div className="landing-fragment" data-ui><div className="fragment-header"><ScanSearch size={20}/><span>LIVE WORKFLOW PREVIEW</span><span className="fragment-dot"/></div>{feed.error?<div className="fragment-score"><span>Local API unavailable</span><p>{feed.error}</p><button className="button secondary" onClick={feed.refresh}>Retry connection</button></div>:<div className="fragment-score"><span>{x?.supplier||"Loading assessment…"}</span><strong>{x?.risk??"—"} <small>/ 100</small></strong><p>{x?.reason||"Reading the server assessment."}</p></div>}<div className="fragment-steps"><span>01 · Assess</span><span>02 · Verify</span><span>03 · Approve internally</span></div><div className="fragment-foot"><Fingerprint size={18}/>{x?<Link href={`/app/payments/${x.id}`}>Inspect {x.invoice} in the workspace →</Link>:"Scores come from the local Python service."}</div></div>}


