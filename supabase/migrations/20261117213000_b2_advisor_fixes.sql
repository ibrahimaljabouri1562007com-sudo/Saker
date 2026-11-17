-- صقر · B2 follow-up (2026-11-17): the two items Supabase's own advisor raised after the guard.
-- 1. SECURITY: public.rls_auto_enable() — created by Supabase for the «automatic RLS» option — sat in the API schema,
--    callable by anyone (even signed out) at /rest/v1/rpc/rls_auto_enable. Nobody needs to call it: the event trigger
--    `ensure_rls` fires it by itself, and Postgres does not check a caller's EXECUTE right for event triggers.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 2. PERFORMANCE: who-am-I checks evaluated once per request instead of once per row (`(select …)` = computed once).
alter policy read on public.app_users using (user_id = (select auth.uid()) or (select private.is_admin()));
alter policy read on public.audit_log using ((select private.is_admin()));
