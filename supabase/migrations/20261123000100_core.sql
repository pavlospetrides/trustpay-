-- TrustPay tenant data. Apply only to an explicitly designated development project.
create schema if not exists private;
revoke all on schema private from public, anon;

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) > 0),
  registration_number text, country char(2) not null, status text not null default 'active'
    check (status in ('active','suspended')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','admin','analyst','approver','viewer')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index memberships_user_idx on public.organization_memberships(user_id, organization_id);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  public_id text not null, name text not null check (length(trim(name)) > 0),
  registration_number text, vat_number text, country char(2),
  status text not null default 'active' check (status in ('active','inactive','review')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id,id), unique (organization_id,public_id)
);
create index suppliers_name_warning_idx on public.suppliers(organization_id, lower(name));

create table public.supplier_bank_accounts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  supplier_id uuid not null,
  encrypted_iban bytea not null, iban_fingerprint char(64) not null,
  iban_last4 char(4) not null,
  verification_status text not null default 'candidate'
    check (verification_status in ('candidate','verified','rejected')),
  first_seen_at timestamptz not null default now(), last_verified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (organization_id,supplier_id) references public.suppliers(organization_id,id),
  unique (organization_id,id), unique (organization_id,supplier_id,id),
  unique (organization_id,supplier_id,iban_fingerprint),
  check (verification_status <> 'verified' or last_verified_at is not null)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  public_id text not null, supplier_id uuid not null,
  external_source text not null default 'manual', external_invoice_id text,
  invoice_number text not null, issue_date date not null, due_date date,
  currency char(3) not null default 'EUR', total_amount numeric(18,2) not null check (total_amount > 0),
  bank_account_id uuid not null,
  status text not null default 'needs_review'
    check (status in ('ready','needs_review','blocked','hold','approved')),
  verified_by uuid references auth.users(id), approved_by uuid references auth.users(id),
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,supplier_id) references public.suppliers(organization_id,id),
  foreign key (organization_id,supplier_id,bank_account_id)
    references public.supplier_bank_accounts(organization_id,supplier_id,id),
  unique (organization_id,id), unique (organization_id,public_id),
  unique (organization_id,id,bank_account_id)
);
create index invoices_org_date_idx on public.invoices(organization_id,issue_date desc);
create index invoices_duplicate_idx on public.invoices(organization_id,supplier_id,lower(invoice_number));

create table public.payment_records (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  supplier_id uuid not null, invoice_id uuid,
  historical_invoice_number text,
  bank_account_id uuid not null, amount numeric(18,2) not null check (amount > 0),
  currency char(3) not null default 'EUR',
  status text not null check (status in ('paid','failed','reversed','pending')),
  paid_at timestamptz, source text not null, external_reference text,
  created_at timestamptz not null default now(),
  foreign key (organization_id,supplier_id) references public.suppliers(organization_id,id),
  foreign key (organization_id,invoice_id) references public.invoices(organization_id,id),
  foreign key (organization_id,supplier_id,bank_account_id)
    references public.supplier_bank_accounts(organization_id,supplier_id,id)
);
create index payments_history_idx on public.payment_records(organization_id,supplier_id,paid_at desc);

create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  invoice_id uuid not null, score integer not null check (score between 0 and 100),
  severity text not null check (severity in ('low','review','critical')),
  kind text not null, recommended_status text not null,
  engine_version text not null, assessed_at timestamptz not null default now(),
  explanation text not null, evidence jsonb not null default '{}'::jsonb,
  foreign key (organization_id,invoice_id) references public.invoices(organization_id,id),
  unique (organization_id,id)
);
create index assessments_invoice_idx on public.risk_assessments(organization_id,invoice_id,assessed_at desc);

create table public.risk_signals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  assessment_id uuid not null, code text not null, severity text not null,
  weight integer not null check (weight between 0 and 100),
  explanation text not null, evidence jsonb not null default '{}'::jsonb,
  foreign key (organization_id,assessment_id) references public.risk_assessments(organization_id,id)
);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  invoice_id uuid not null, bank_account_id uuid not null,
  verification_type text not null, status text not null default 'pending'
    check (status in ('pending','verified','rejected')),
  initiated_by uuid references auth.users(id), completed_by uuid references auth.users(id),
  verified_at timestamptz, evidence_reference text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (organization_id,invoice_id) references public.invoices(organization_id,id),
  foreign key (organization_id,invoice_id,bank_account_id)
    references public.invoices(organization_id,id,bank_account_id),
  check (status <> 'verified' or (completed_by is not null and verified_at is not null and evidence_reference is not null))
);

create table public.payment_approvals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  invoice_id uuid not null, actor_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved','rejected','held')),
  reason text not null, created_at timestamptz not null default now(),
  foreign key (organization_id,invoice_id) references public.invoices(organization_id,id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  actor_id uuid references auth.users(id), action text not null,
  target_type text not null, target_id text, title text not null, detail text not null,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index audit_org_date_idx on public.audit_logs(organization_id,created_at desc);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  provider text not null, status text not null default 'disconnected'
    check (status in ('disconnected','sandbox','connected','error')),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id,id), unique (organization_id,provider)
);
create table public.sync_runs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  connection_id uuid not null, status text not null check (status in ('running','success','failed')),
  started_at timestamptz not null default now(), finished_at timestamptz,
  records_seen integer not null default 0 check (records_seen >= 0),
  safe_error text,
  foreign key (organization_id,connection_id) references public.integration_connections(organization_id,id)
);

create function private.reject_audit_mutation() returns trigger language plpgsql
security invoker set search_path = '' as $$
begin
  raise exception 'audit logs are append-only';
end;
$$;
create trigger audit_no_update_delete before update or delete on public.audit_logs
for each row execute function private.reject_audit_mutation();
create function private.reject_snapshot_mutation() returns trigger language plpgsql
security invoker set search_path = '' as $$
begin
  raise exception 'historical policy records are append-only';
end;
$$;
create trigger assessments_no_update_delete before update or delete on public.risk_assessments
for each row execute function private.reject_snapshot_mutation();
create trigger signals_no_update_delete before update or delete on public.risk_signals
for each row execute function private.reject_snapshot_mutation();
create trigger approvals_no_update_delete before update or delete on public.payment_approvals
for each row execute function private.reject_snapshot_mutation();

create function private.reject_assessed_invoice_change() returns trigger language plpgsql
security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.risk_assessments a where a.organization_id = old.organization_id and a.invoice_id = old.id) then
    raise exception 'assessed invoice evidence is immutable; create a new invoice version';
  end if;
  return new;
end;
$$;
create trigger assessed_invoice_evidence_immutable
before update of supplier_id, invoice_number, issue_date, currency, total_amount, bank_account_id
on public.invoices for each row execute function private.reject_assessed_invoice_change();

create function private.is_member(org uuid) returns boolean language sql stable
security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;
create function private.has_role(org uuid, allowed text[]) returns boolean language sql stable
security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    where m.organization_id = org and m.user_id = (select auth.uid()) and m.role = any(allowed)
  );
$$;
revoke all on function private.is_member(uuid) from public, anon;
revoke all on function private.has_role(uuid,text[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid), private.has_role(uuid,text[]) to authenticated;

-- Default Supabase public-schema grants vary by project; remove them explicitly.
revoke all on public.organizations, public.organization_memberships, public.suppliers,
  public.supplier_bank_accounts, public.invoices, public.payment_records,
  public.risk_assessments, public.risk_signals, public.verification_requests,
  public.payment_approvals, public.audit_logs, public.integration_connections,
  public.sync_runs from anon, authenticated;
grant select on public.organizations, public.organization_memberships, public.suppliers,
  public.invoices, public.payment_records, public.risk_assessments, public.risk_signals,
  public.verification_requests, public.payment_approvals, public.audit_logs,
  public.integration_connections, public.sync_runs to authenticated;
-- Account ciphertext, fingerprints, verification status, and all policy writes remain server-only.

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_bank_accounts enable row level security;
alter table public.invoices enable row level security;
alter table public.payment_records enable row level security;
alter table public.risk_assessments enable row level security;
alter table public.risk_signals enable row level security;
alter table public.verification_requests enable row level security;
alter table public.payment_approvals enable row level security;
alter table public.audit_logs enable row level security;
alter table public.integration_connections enable row level security;
alter table public.sync_runs enable row level security;

create policy organizations_read on public.organizations for select to authenticated
using (private.is_member(id));
create policy memberships_read on public.organization_memberships for select to authenticated
using (user_id = (select auth.uid()));
create policy suppliers_read on public.suppliers for select to authenticated
using (private.is_member(organization_id));
create policy invoices_read on public.invoices for select to authenticated
using (private.is_member(organization_id));
create policy payments_read on public.payment_records for select to authenticated
using (private.is_member(organization_id));
create policy assessments_read on public.risk_assessments for select to authenticated
using (private.is_member(organization_id));
create policy signals_read on public.risk_signals for select to authenticated
using (private.is_member(organization_id));
create policy verifications_read on public.verification_requests for select to authenticated
using (private.is_member(organization_id));
create policy approvals_read on public.payment_approvals for select to authenticated
using (private.is_member(organization_id));
create policy audit_read on public.audit_logs for select to authenticated
using (private.is_member(organization_id));
create policy integrations_read on public.integration_connections for select to authenticated
using (private.is_member(organization_id));
create policy sync_read on public.sync_runs for select to authenticated
using (private.is_member(organization_id));

-- No client insert/update/delete policies: the authenticated API is the only write path.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('invoice-documents','invoice-documents',false,10485760,
  array['application/pdf','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
create policy invoice_documents_read on storage.objects for select to authenticated
using (bucket_id = 'invoice-documents' and
  case when split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.is_member(split_part(name,'/',1)::uuid) else false end);
