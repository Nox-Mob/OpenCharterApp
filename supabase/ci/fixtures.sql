-- CI-only fixtures for the replay job (.github/workflows/supabase-db.yml): the demo accounts and
-- organizations the smoke test expects. The workflow passes the password in PGOPTIONS
-- (fixture.demo_password); it is generated per run and never stored.
\ir ../scripts/demo-test-accounts.sql
