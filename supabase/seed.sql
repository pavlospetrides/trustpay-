-- Synthetic development fixtures only. The guard requires an explicit session setting.
do $$ begin
  if current_setting('trustpay.allow_synthetic_seed', true) is distinct from 'development' then
    raise exception 'Synthetic seed requires explicit development confirmation';
  end if;
end $$;

insert into public.organizations(id,name,registration_number,country)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Asteria Synthetic Ltd','DEMO-ASTERIA','CY'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Orion Synthetic Ltd','DEMO-ORION','CY')
on conflict (id) do nothing;

insert into public.suppliers(id,organization_id,public_id,name,registration_number,country)
values
  ('00000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','SUP-001','Aegean Supplies Synthetic Ltd','DEMO-AS','CY'),
  ('00000000-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','SUP-002','Meridian Office Synthetic Ltd','DEMO-MO','CY'),
  ('00000000-0000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','SUP-003','Kastro Maintenance Synthetic Ltd','DEMO-KM','CY'),
  ('00000000-0000-4000-8000-000000000004','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','SUP-004','Palm Tree Logistics Synthetic Ltd','DEMO-PT','CY'),
  ('00000000-0000-4000-8000-000000000005','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','SUP-005','New Supplier Synthetic Ltd','DEMO-NEW','CY'),
  ('00000000-0000-4000-8000-000000000006','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','SUP-001','Orion Private Synthetic Supplier','DEMO-ORION-S','CY')
on conflict (organization_id,public_id) do nothing;
