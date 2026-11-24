-- Additive only: idempotent provider imports and sync-run counts (issue #18).
-- The hosted development project has no CLI migration history: apply this file by hand
-- (docs/supabase-setup.md) and never run `supabase db push` against it.

alter table public.sync_runs
  add column records_created integer not null default 0 check (records_created >= 0),
  add column records_needs_review integer not null default 0 check (records_needs_review >= 0),
  add column records_skipped integer not null default 0 check (records_skipped >= 0),
  add constraint sync_runs_organization_id_id_key unique (organization_id,id);

-- One row per provider invoice revision. The unique key is the sync's idempotency guarantee.
-- Records that cannot be resolved (unknown supplier, missing/invalid IBAN) stay here for human review
-- and never become invoices automatically.
create table public.integration_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  sync_run_id uuid not null,
  provider text not null,
  external_id text not null,
  revision text not null,
  source text not null,
  status text not null check (status in ('assessed','needs_review')),
  review_reason text,
  invoice_id uuid,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,provider,external_id,revision),
  unique (organization_id,invoice_id),
  check ((status = 'assessed') = (invoice_id is not null)),
  foreign key (organization_id,connection_id) references public.integration_connections(organization_id,id),
  foreign key (organization_id,sync_run_id) references public.sync_runs(organization_id,id),
  foreign key (organization_id,invoice_id) references public.invoices(organization_id,id)
);
create index integration_imports_org_status_idx
  on public.integration_imports(organization_id,provider,status,created_at desc);

revoke all on public.integration_imports from anon, authenticated;
grant select on public.integration_imports to authenticated;
alter table public.integration_imports enable row level security;
create policy integration_imports_read on public.integration_imports for select to authenticated
using (private.is_member(organization_id));
-- No client write policies: the authenticated FastAPI sync is the only write path.
