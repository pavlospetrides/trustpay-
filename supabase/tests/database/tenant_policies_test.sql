begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users(id,email) values
  ('11111111-1111-4111-8111-111111111111','rls-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222','rls-b@example.invalid');
insert into public.organizations(id,name,country) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','RLS Synthetic A','CY'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','RLS Synthetic B','CY');
insert into public.organization_memberships(organization_id,user_id,role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','viewer'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','approver');
insert into public.suppliers(id,organization_id,public_id,name) values
  ('00000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','RLS-A','Supplier A'),
  ('00000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','RLS-B','Supplier B');
insert into public.invoice_intakes(id,organization_id,uploaded_by,storage_path,content_type,size_bytes,sha256,status)
values ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/33333333-3333-4333-8333-333333333333/33333333-3333-4333-8333-333333333333.pdf',
  'application/pdf',100,repeat('a',64),'needs_review');

select ok((select relrowsecurity from pg_class where oid='public.suppliers'::regclass), 'suppliers RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.supplier_bank_accounts'::regclass), 'bank accounts RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.audit_logs'::regclass), 'audit RLS enabled');
select ok((select b.public = false from storage.buckets b where b.id='invoice-documents'), 'invoice bucket is private');

set local role anon;
select throws_ok('select count(*) from public.suppliers', '42501', null, 'anon cannot read suppliers');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is((select count(*) from public.suppliers where public_id='RLS-A'), 1::bigint, 'member reads own supplier');
select is((select count(*) from public.invoice_intakes), 1::bigint, 'member reads own intake');
select throws_ok('update public.invoice_intakes set status=''analyzed'' where false', '42501', null, 'client cannot change intake state');
select is((select count(*) from public.suppliers where public_id='RLS-B'), 0::bigint, 'member cannot read another organization');
select throws_ok('select count(*) from public.supplier_bank_accounts', '42501', null, 'encrypted accounts are server only');
select throws_ok('update public.invoices set status=''approved'' where false', '42501', null, 'client cannot approve directly');
select throws_ok('insert into public.audit_logs(organization_id,action,target_type,title,detail) values (''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',''FAKE'',''invoice'',''fake'',''fake'')', '42501', null, 'client cannot forge audit');
select ok(not private.has_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',array['approver']), 'viewer lacks approver role');
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is((select count(*) from public.suppliers where public_id='RLS-A'), 0::bigint, 'second user cannot read first organization');
select is((select count(*) from public.invoice_intakes), 0::bigint, 'other organization cannot read intake');
select is((select count(*) from public.suppliers where public_id='RLS-B'), 1::bigint, 'second user reads own organization');

select * from finish();
rollback;
