# PEOPLE — who may use صقر, and how to change it (Supabase dashboard)

Project: Supabase **Saker** (`ayrijizubulczzympslg`). Every change below is written to `audit_log` (who · when ·
before → after). Nobody is ever deleted once they have done something — access is taken away by the role `none`.

## Add a person
1. **Authentication → Users → Add user → Create new user**: their email, a password, tick **Auto Confirm User**.
   Use an inbox the person really owns — or, for a test account, an `@example.com` address (nobody can own one).
2. They appear by themselves in `app_users` with the role **`none`** (no access yet).
3. Give the role — either way:
   - **Table Editor → `app_users` → the `role` cell →** `admin` or `boss`, or
   - **SQL Editor:** `select private.set_role('their@email.com', 'boss');`
4. At their first sign-in they link an authenticator app (QR on screen), then use its 6-digit code every time.

## Change a role (admin · boss · none)
- **SQL Editor:** `select private.set_role('their@email.com', 'admin');` — or the `role` cell in Table Editor.
- `none` = no access at all (they can still sign in to Supabase, but صقر shows them nothing and saves nothing).

## Change an email
- **SQL Editor:** `select private.change_email('old@email.com', 'new@email.com');`
  Same account, same password, same linked phone; `app_users` follows. (The dashboard has no email editor.)

## A lost or new phone
- **Authentication → Users → click the person →** in the panel on the right, **scroll all the way down → Danger zone →
  Remove MFA factors**. At their next sign-in they see the QR again and link the new phone.

## Remove a person
- Has done anything in صقر → **set the role to `none`** (and optionally **Ban user** in the same panel).
- Never used, role `none` → **Delete user** in that panel is allowed (anything else is refused, on purpose).

## Where these rules live
`supabase/migrations/…_b5_people.sql` (rows appear by themselves, emails follow) · `…_b5_unused_account_delete.sql` ·
`…_b6_require_mfa.sql` (the 6-digit code is required by the database) · `…_people_tools.sql` (`set_role`,
`change_email` — callable only from the dashboard, never from the web).
