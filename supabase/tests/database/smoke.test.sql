-- Runs in CI against a real local Supabase stack (supabase test db), complementing the
-- PGlite suite in tests/db with the genuine auth and storage schemas.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'every public table has row-level security enabled');

select is((select status::text from public.framework_versions where label = 'v1'), 'published', 'framework v1 is published');

select is((select count(*)::int from public.domains), 9, 'nine domains are seeded');

select ok(exists (select 1 from storage.buckets where id = 'evidence' and not public), 'evidence bucket exists and is private');

select throws_ok(
  $$update public.audit_log set action = 'x'$$,
  'audit_log is append-only (invariant 8)');

select * from finish();
rollback;
