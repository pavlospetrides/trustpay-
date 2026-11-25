-- Adds the final `rejected` invoice status for reject and approval withdrawal (issue #30).
-- The hosted development project has no CLI migration history: apply this file by hand
-- (docs/supabase-setup.md) and never run `supabase db push` against it.

alter table public.invoices drop constraint invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('ready','needs_review','blocked','hold','approved','rejected'));
