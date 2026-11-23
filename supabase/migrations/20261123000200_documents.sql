create table public.invoice_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  storage_path text not null unique,
  content_type text not null check (content_type in ('application/pdf','image/png','image/jpeg')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id,invoice_id) references public.invoices(organization_id,id),
  check (storage_path ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(pdf|png|jpg)$')
);
create index invoice_documents_lookup_idx on public.invoice_documents(organization_id,invoice_id);
revoke all on public.invoice_documents from anon, authenticated;
grant select on public.invoice_documents to authenticated;
alter table public.invoice_documents enable row level security;
create policy invoice_documents_metadata_read on public.invoice_documents
  for select to authenticated using (private.is_member(organization_id));
