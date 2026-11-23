-- Reviewed invoice drafts are server-written and tenant-scoped.
-- Full extracted fields, including IBAN, are AES-GCM ciphertext in fields_encrypted.
create table public.invoice_intakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  uploaded_by uuid not null references auth.users(id),
  storage_path text not null unique,
  content_type text not null check (content_type in ('application/pdf','image/png','image/jpeg')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  sha256 char(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text,
  status text not null check (status in ('needs_review','provider_unavailable','reviewed','analyzed')),
  fields_encrypted bytea,
  uncertain_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(uncertain_fields) = 'array'),
  extraction_method text,
  error_code text,
  explanation text,
  explanation_method text check (explanation_method in ('verified_policy','openai_summary')),
  invoice_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,uploaded_by,idempotency_key),
  unique (organization_id,invoice_id),
  foreign key (organization_id,invoice_id) references public.invoices(organization_id,id),
  check (storage_path ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(pdf|png|jpg)$')
);
create index invoice_intakes_org_created_idx on public.invoice_intakes(organization_id,created_at desc);
revoke all on public.invoice_intakes from anon, authenticated;
grant select (id,organization_id,uploaded_by,content_type,size_bytes,sha256,status,
  uncertain_fields,extraction_method,error_code,explanation,explanation_method,invoice_id,created_at,updated_at)
  on public.invoice_intakes to authenticated;
alter table public.invoice_intakes enable row level security;
create policy invoice_intakes_read on public.invoice_intakes for select to authenticated
using (private.is_member(organization_id));
