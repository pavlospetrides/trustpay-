"use client";
import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useRef, type PointerEvent } from "react";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
import type { Invoice } from "@/lib/types";

import { Badge } from "./ui/primitives";

/** The supplied liquid card's layered surface and tilt, adapted to an invoice.
 * No checkout fields, WebGL loop, or payment animation are used. */
export function AssessmentCard({ invoice }: { invoice: Invoice }) {
  const { t, euro, statusLabel, riskText } = useI18n();

  const card = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  function move(event: PointerEvent<HTMLDivElement>) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || event.pointerType === "touch") return;
    const element = card.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    const x = ((event.clientY - box.top) / box.height - .5) * -5;
    const y = ((event.clientX - box.left) / box.width - .5) * 5;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { element.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`; });
  }
  function reset() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (card.current) card.current.style.transform = "";
  }

  return <div className="card-scene" onPointerMove={move} onPointerLeave={reset}>
    <div ref={card} className={`assessment-card assessment-${invoice.status}`}>
      <div className="card-shine" aria-hidden="true"/>
      <div className="card-head"><span><ShieldCheck size={20}/> {t("trust-assessment")}</span><ArrowUpRight size={19} aria-hidden="true"/></div>
      <div className="card-middle"><span className="card-label">{t("review-priority.heading")}</span><div><strong>{invoice.risk}</strong><span>/ 100</span></div><p>{riskText(invoice.reason)}</p></div>
      <div className="card-bottom"><div><span className="card-label">{t("supplier.heading")}</span><strong><bdi>{invoice.supplier}</bdi></strong></div><div><span className="card-label">{t("invoice-amount")}</span><strong>{invoice.invoice} · {euro(invoice.amount_cents)}</strong></div></div>
    </div>
    <div className="card-caption"><Badge status={invoice.status}/><span>{statusLabel(invoice.status)} {t("no-payment-suffix")}</span></div>
  </div>;
}
