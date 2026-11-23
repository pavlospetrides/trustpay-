# Database policy tests

The executable pgTAP suite is at `supabase/tests/database/tenant_policies_test.sql`, the directory used by `supabase test db`. It exercises tenant reads under two Auth identities and direct client write bypasses. Run it only against a disposable local Supabase database.

`tests/rls/test_postgres_api.py` adds tenant and approval integration checks when `TRUSTPAY_TEST_DATABASE_URL` and a disposable Supabase Auth test environment are available. These tests are never pointed at a shared database by default.
