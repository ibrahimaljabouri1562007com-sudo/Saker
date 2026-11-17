-- صقر · B0, the pipe check (2026-11-17): the first blueprint to travel GitHub → Supabase.
-- A schema for the database's own helpers (role checks, rule triggers, the health audit). It is NOT exposed through
-- the Data API, so nothing in it can ever be called from the browser directly.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
comment on schema private is 'صقر: internal helpers (role checks, rule triggers) - never exposed through the API';
