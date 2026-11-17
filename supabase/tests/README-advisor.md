# Supabase advisor — accepted warnings (decided 2026-11-17)

**`authenticated_security_definer_function_executable` (WARN) on the 24 write functions of B3 — INTENTIONAL.**
These functions ARE the one write door: the browser has no write right on any table, so every save must go through
a function that runs with the owner's rights (SECURITY DEFINER) and checks, first thing, that the caller is the Admin
(`private.require_admin()` → 42501). Proven by `b3_functions_test.sql` (Boss / stranger / anonymous all refused).
The advisor's suggested alternative — SECURITY INVOKER + table write grants — would let a signed-in user write tables
directly and is exactly what the design forbids. Do not "fix" this warning.

Any OTHER advisor finding (especially anything reachable by `anon`) is a real issue: fix it.
