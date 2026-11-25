-- WEBP originals remain private and tenant scoped like PDF, PNG and JPEG.
alter table public.invoice_intakes drop constraint invoice_intakes_content_type_check;
alter table public.invoice_intakes add constraint invoice_intakes_content_type_check
  check (content_type in ('application/pdf','image/png','image/jpeg','image/webp'));
alter table public.invoice_intakes drop constraint invoice_intakes_storage_path_check;
alter table public.invoice_intakes add constraint invoice_intakes_storage_path_check
  check (storage_path ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(pdf|png|jpg|webp)$');
alter table public.invoice_documents drop constraint invoice_documents_content_type_check;
alter table public.invoice_documents add constraint invoice_documents_content_type_check
  check (content_type in ('application/pdf','image/png','image/jpeg','image/webp'));
alter table public.invoice_documents drop constraint invoice_documents_storage_path_check;
alter table public.invoice_documents add constraint invoice_documents_storage_path_check
  check (storage_path ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(pdf|png|jpg|webp)$');
update storage.buckets set allowed_mime_types = array['application/pdf','image/png','image/jpeg','image/webp']
  where id = 'invoice-documents';
