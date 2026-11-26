-- Explicit duplicate reviews for invoice numbers that match another record only after normalisation (issue #36, PR #37).
-- One row per (invoice, matched record): an authorized reviewer records "distinct" or "duplicate" with a reason.
-- Rows are append-only and final. Server-written only; members can read their own organization's rows.
-- The hosted development project has no CLI migration history: apply this file by hand
-- (docs/supabase-setup.md) and never run `supabase db push` against it.

create table public.duplicate_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  invoice_id uuid not null,
  matched_invoice_id uuid,
  matched_payment_id uuid references public.payment_records(id),
  decision text not null check (decision in ('distinct','duplicate')),
  reason text not null check (length(trim(reason)) >= 12),
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  foreign key (organization_id,invoice_id) references public.invoices(organization_id,id),
  foreign key (organization_id,matched_invoice_id) references public.invoices(organization_id,id),
  check ((matched_invoice_id is null) <> (matched_payment_id is null)),
  check (matched_invoice_id is distinct from invoice_id)
);
create unique index duplicate_reviews_pair_idx on public.duplicate_reviews
  (organization_id, invoice_id, coalesce(matched_invoice_id, matched_payment_id));
create index duplicate_reviews_matched_idx on public.duplicate_reviews (organization_id, matched_invoice_id);

create trigger duplicate_reviews_no_update_delete before update or delete on public.duplicate_reviews
for each row execute function private.reject_snapshot_mutation();

revoke all on public.duplicate_reviews from anon, authenticated;
grant select on public.duplicate_reviews to authenticated;
alter table public.duplicate_reviews enable row level security;
create policy duplicate_reviews_read on public.duplicate_reviews for select to authenticated
using (private.is_member(organization_id));
