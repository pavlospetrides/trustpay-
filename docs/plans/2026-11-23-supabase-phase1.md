# Supabase Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a tenant-isolated Supabase PostgreSQL mode to the existing TrustPay demo while preserving local SQLite behavior and the Crystal UI.

**Architecture:** Keep the pure Python risk engine. Supabase Auth verifies bearer tokens; FastAPI resolves membership and scopes every privileged database operation to an organization. PostgreSQL stores historical assessments and workflow events. The browser uses a publishable key solely for Auth and sends its access token to FastAPI.

**Tech Stack:** PostgreSQL 15+, Supabase Auth/Storage, psycopg 3, FastAPI, Next.js 16, React 19.

**Spec:** User-supplied Phase 1 Supabase request (23 November 2026).

## Global constraints

- Preserve existing SQLite API and tests; PostgreSQL mode must fail closed.
- Do not seed or migrate a shared database automatically.
- No real Jinius endpoint or payment initiation.
- Do not place database or service-role credentials in browser code.
- Use synthetic data only.

## Review focus

- Cross-organization IDs in URLs and request bodies must reveal no business records.
- Approval must fail for the verifier and for any non-approver role.
- A changed account must remain unverified until authorized independent evidence is recorded.
- Database and Auth outages must fail visibly, never switch to SQLite.
- Direct Supabase Data API access must not expose encrypted IBANs or allow policy writes.

### Task 1: Schema and policies

- [x] Add tables, constraints, RLS, storage bucket, and least-privilege grants in migrations.
- [x] Add pgTAP tests for cross-tenant access, role checks, and immutable policy records.
- [x] Validate migration syntax and run pgTAP against a disposable local Supabase stack in CI.

### Task 2: Backend persistence and security

- [x] Write failing tests for IBAN normalization, encryption, Auth validation and approval guards.
- [x] Implement credential configuration, Auth validation, PostgreSQL repository and atomic transitions.
- [x] Run new and existing Python tests.

### Task 3: Auth and private documents

- [x] Add frontend login, logout, route protection and bearer-token forwarding.
- [x] Add server-validated private invoice document upload and authorized retrieval.
- [x] Run frontend tests, TypeScript, lint and production build.

### Task 4: Demo and delivery

- [x] Add nonautomatic synthetic seed data including a 14-payment supplier.
- [x] Document architecture, setup, limitations, and exact checks.
- [x] Review diff and secrets, commit a feature branch, push and open a PR for human review.
