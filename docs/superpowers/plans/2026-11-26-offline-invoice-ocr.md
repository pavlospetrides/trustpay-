# Offline Invoice OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a measured, offline Greek/English OCR reader that feeds text and layout to TrustPay's existing OpenAI analyzer.

**Architecture:** PDF.js selects native text or rendered OCR per page. A local OCR worker retains word boxes and confidence. The analyzer accepts text-only evidence. A feature gate preserves the existing Vision reader until critical-field accuracy is proven.

**Tech Stack:** Node.js 24, TypeScript, PDF.js, Sharp, Tesseract.js WASM with packaged English/Greek language files, OpenAI Responses API, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-offline-invoice-ocr.md`

## Global Constraints

- Preserve 10 MB and ten-page upload limits and 20 million image-pixel cap.
- No runtime downloads or Python/native compilation during installation.
- Never infer an IBAN or payment destination from OCR ambiguity.
- Keep existing OpenAI Vision capability and explicit external-document opt-in.
- Keep production Vision default unless OCR reaches the critical-field baseline.

## Review Focus

- Mixed digital and scanned pages: classify and process each page independently.
- Rotated and skewed images: normalize or mark uncertain with real OCR evidence.
- Multiple accounts and lookalike characters: flag conflicts and block automatic selection.
- Multi-page tables: retain source page and row order.
- Weak OCR or unavailable local assets: bounded retry, clear error, human review.

---

### Task 1: Local OCR engine and PDF layout

**Files:** `frontend/src/lib/server/invoices/ocr-reader.ts`, its tests, `frontend/package.json`, local language assets.

- [ ] Write tests using real Greek/English digital, scanned, rotated and photographed documents; assert page decisions, text, boxes, no downloads and bounded retries.
- [ ] Run the tests red.
- [ ] Implement PDF.js page text extraction/rendering and local OCR worker with preprocessing and quality scores.
- [ ] Run the tests green and inspect actual OCR text and timings.

### Task 2: Text-only OpenAI analysis and intake

**Files:** `frontend/src/lib/server/ai/provider.ts`, `frontend/src/lib/server/invoices/extract-invoice.ts`, related tests and review UI if required.

- [ ] Write a failing test that verifies text/layout input without document bytes and preserved universal output.
- [ ] Run it red; implement OCR analysis and explicit Vision fallback.
- [ ] Run it green and verify low-confidence fields appear as uncertain in review.

### Task 3: Benchmark and rollout gate

**Files:** benchmark test/script, safe report in `docs/`, `docs/STATUS.md`, configuration docs.

- [ ] Add an opt-in live benchmark over every supplied file and unseen synthetic scans/photos; measure CER, financial fields, time and token cost separately.
- [ ] Run actual OCR and compare with 454/456 Vision baseline. Preserve Vision default if critical fields regress.
- [ ] Verify interface population, Windows clean install, full tests, typecheck, lint, build, diff and sensitive-data scan.
- [ ] Commit, push, open linked PR and request human review.
