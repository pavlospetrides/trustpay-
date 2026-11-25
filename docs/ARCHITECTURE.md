# TrustPay architecture

```text
Browser and Supabase Auth
          |
          v
Next.js 16 (single Node.js process, port 3000)
  |-- Crystal App Router UI
  `-- /api/health and /api/v1/* Route Handlers
        |-- verified Supabase user and organization membership (hosted mode)
        |-- deterministic TypeScript risk rules and maker-checker policy
        |-- local SQLite or tenant-scoped PostgreSQL repositories
        |-- private Supabase Storage invoice evidence
        |-- optional OpenAI extraction and evidence summary
        `-- synthetic Jinius adapter; live adapter disconnected
```

The local SQLite mode contains only fictional records and simulated actors. The hosted development mode uses existing Supabase PostgreSQL tables, RLS, Auth, and private Storage; PostgreSQL writes and audit events share transactions. The server checks role, tenant, risk score, status, and distinct actors before accepting a verification or approval. Duplicate paid invoices stay blocked. No route sends a bank payment or proves account ownership.

[API matrix and security constraints](node-migration-checklist.md) · [Supabase setup](supabase-setup.md) · [Jinius boundary](jinius-integration-architecture.md)
