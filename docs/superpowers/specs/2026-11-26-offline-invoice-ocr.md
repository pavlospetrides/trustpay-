# Offline invoice OCR design — 26 November 2026

## Goal

Read unfamiliar digital, scanned and photographed invoices locally, then send text and layout evidence to the existing OpenAI document analysis schema. The current Vision path remains available and is the production default until a measured critical-field gate is met.

## Pipeline

Validate the existing 10 MB / ten-page input boundary. Inspect each PDF page independently with PDF.js text items and coordinates. Use native text when its density and readability are sufficient; render the other pages near 300 DPI, capped at 20 million pixels per page. OCR each required page with locally installed English and Greek data. Apply EXIF rotation, contrast and denoising where useful, then retry weak pages with an alternate preprocessing pass. Keep page, line, word boxes and confidence. Record page boundaries and column/table spacing for the analyzer; never substitute a guessed financial character.

For PDFs with some native text, compare OCR against native words for conflicts. Treat low confidence, missing key fields, competing accounts and discrepancies as review findings. OpenAI receives text and layout only on the OCR path and returns the existing universal schema. Vision may be used when the environment's explicit external-document opt-in allows it and text quality is insufficient. Server-side policy and human approval remain independent of model output.

## Rollout and evidence

The candidate path is opt-in while measured against all 14 supplied files and new unseen scans/photos. Record OCR character error rate separately from financial-field accuracy, elapsed time and API usage/cost. Keep the production Vision default if any critical financial-field score is worse than the 454/456 baseline. Test actual OCR in automated tests and verify review fields in the interface. Package language and WASM resources locally so request processing makes no network downloads. Validate `npm ci` on Windows without Python, Ollama or compilation.

## Constraints

No supplier templates, invented sensitive values, real invoice records, raw account values in public reports, or automatic payment decisions. Human review is required for uncertainty.
