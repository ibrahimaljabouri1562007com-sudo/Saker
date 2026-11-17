# PHASE B PLAN — صقر on its own database (proposed 2026-11-17, for Ibrahim's approval)

**Goal:** the screens we built read and write a real database, rigidly (the database itself refuses wrong data) and
simply (one write door, one read call, one place for the math). Demo firms only until the three locks are verified.

**Where things are (verified 2026-11-17):** Supabase project **Saker** · id `ayrijizubulczzympslg` · Central EU
(Frankfurt) · Free plan · linked to GitHub `ibrahimaljabouri1562007com-sudo/Saker` (working directory `.`) ·
**«Deploy to production» is OFF** · no migrations yet.

---

## 1. How a screen gets its data — rendering in the BROWSER, not on a server

Correction to the idea of "rendering on the server": we keep what the ROADMAP chose (**Line 3: painted in the
browser**). Supabase never builds HTML; it only answers with **JSON**. The page is a set of static files.

```
 Browser (the Boss / the Admin)                      Supabase (Frankfurt)
 ─────────────────────────────                      ─────────────────────
 1. opens the site ──── Cloudflare (Lock 1: the gate, allow-list + code) ──── static files: index.html, assets/*
 2. signs in ───────────────────────────────────────▶ Auth: email + password + 6-digit code → a signed token (JWT)
 3. asks for the facts  POST /rest/v1/rpc/app_snapshot ──▶ Postgres checks the token's role (Lock 2: RLS)
                        ◀── JSON { firms, contracts, installments, payments, … } (only what this role may see)
 4. calc.js computes the three numbers, statuses, days late — the SAME engine and golden tests as today
 5. paints Sky / Hover / Dive (and the PDF report) in the browser
 6. opens a contract ── POST /storage/v1/object/sign/… ──▶ Lock 3 (the vault): private bucket, link valid 5 minutes
                        ◀── a short-lived URL → pdf.js draws the page + the highlight (the file is never changed)
 7. Admin saves ─────── POST /rest/v1/rpc/record_payment {JSON} ──▶ one Postgres function = one transaction:
                        checks every rule, writes payment + allocations + audit, or refuses ALL of it
                        ◀── JSON: the new rows (or the refusal reason) → merged into the screen's copy → repaint
```

**Why the browser, not a server:** no server of ours to run, patch, pay for or secure (fewer moving parts = fewer
holes); the PDF viewer and highlights must run in the browser anyway; the data is small (tens of firms, hundreds of
rows), so one JSON snapshot is instant; the math keeps ONE home (`calc.js` + its golden tests). Server rendering
would add an app server (Node/Flask) between the browser and Postgres and buy nothing here.

## 2. The data — rigid by construction

### 2.1 Tables (= `DATA-SHAPE.md`, column names unchanged, so the swap is mechanical)
`firms` · `documents` · `contracts` · `installments` · `anchors` · `notes` · `links` · `payments` · `allocations` ·
`vouchers` · `audit_log` + `app_users` (user id → role `admin` | `boss`, lang).

### 2.2 Types — the database refuses nonsense before any rule runs
| Kind | Postgres type | Rule built in |
|---|---|---|
| ids | `uuid` (`gen_random_uuid()`) | the app treats ids as opaque strings (demo `f1`/`c1` → uuids on load) |
| money | `bigint` cents | `check (amount_cents > 0)` / `>= 0`; never `float`, never `numeric` dollars |
| calendar days | `date` | due / received / signed dates; "today" = `(now() at time zone 'Asia/Baghdad')::date` |
| moments | `timestamptz` | created / voided / activated |
| fixed vocabularies | `text` + `check (kind in (…))` | easier to extend than enum types; same rigidity |
| boxes | `real[]` length 4, each 0…1 | `check (array_length(box,1)=4)` |

### 2.3 Relations — every arrow is a foreign key, `on delete restrict`
```
firms ─< contracts ─< installments ─< allocations >─ payments ─> documents (receipt)
  │          │  └─> documents (the contract file)          └─> documents + anchor (the firm's instruction, credit)
  │          └─< notes ─> anchors ─> documents         vouchers ─> firms, contracts; allocations ─> vouchers
  └─< documents ─< anchors          links ─> contracts, installments, documents, anchors
```
Plus a check that an anchor used by a contract's installment lies on a document of the SAME firm.

### 2.4 The invariants — enforced by Postgres, not just the screen
| # | Rule | How the database enforces it |
|---|---|---|
| 1 | Σ live installments of an ACTIVE contract = its total | constraint trigger, deferred to the end of the transaction |
| 2 | Σ live allocations on an installment ≤ its amount | constraint trigger on allocations |
| 3 | a transfer: Σ allocations = the payment exactly · a deposit: Σ uses ≤ the deposit | constraint trigger |
| 4 | money never negative | `check` on every cents column |
| 5 | **nothing is ever deleted** | no DELETE grant to anyone + a trigger that raises on DELETE |
| 6 | contract ref unique · bank ref unique per firm (live rows) | unique index · partial unique index `where voided_at is null` |
| 7 | signed ≤ today · due ≥ signed · received ≤ today and ≥ signed | `check` + function guard (today = Baghdad) |
| 8 | payments / vouchers are never edited — only reversed | trigger: after insert, only `voided_at` (payments) / `reversed_by` (once, vouchers) may change |
| 9 | voucher numbers 0001, 0002… never skipped, never reused | a gap-free counter row locked in the same transaction (a sequence could skip) |
| 10 | every insert / edit logged (who · when · before · after) | one generic `audit` trigger on every table; `audit_log` itself is append-only |

### 2.5 One write door — functions, not table writes
The browser may **read** tables (through RLS) but **cannot write them directly** (no INSERT/UPDATE grants). Every
change is one Postgres function (`security definer`, checks `my_role() = 'admin'` first), mirroring `store.js` 1:1:

`create_contract` · `set_total` · `clear_total` · `add_installment` · `edit_installment` · `remove_installment` ·
`set_parts` · `move_anchor` · `add_link` / `remove_link` · `add_note` / `edit_note` / `remove_note` ·
`finish_contract` (the Σ gate) · `record_payment` · `reverse_payment` · `add_credit` · `apply_credit` ·
`reverse_application` · `reverse_deposit` · `register_document` (after an upload).

Each = **one transaction**: all of it or none of it. This is the simplest thing to maintain: one rule lives in one
function, a mistake can never half-write, and the audit trigger records everything automatically.

### 2.6 Who sees what (Lock 2, the guard — RLS)
- **Boss:** SELECT only; contracts with `state = 'active'` and everything hanging from them; never drafts, never
  `audit_log`. Enforced in the database, so even a hand-made request cannot see a draft.
- **Admin:** SELECT everything; writes only through the functions above.
- **Nobody:** DELETE. **Anonymous:** nothing at all (no public sign-up).

## 3. The browser side — what changes in our code
1. **`assets/store.js` → `assets/store-sb.js`, same method names.** It keeps an in-memory copy of the snapshot (so
   reads stay instant and synchronous, `S.data()` unchanged); each write calls its function, then merges the rows the
   database returns and bumps `S.version` → the screen repaints.
2. **Writes become `await`** (a network call can fail): the Admin's save buttons show «جارٍ الحفظ…» and show the
   database's refusal reason in the form, word for word. ~25 call sites in `admin.js`; mechanical.
3. **`viewer.js`:** a `sb:` file path asks for a signed link first; everything else unchanged.
4. **`signin.js`:** wired to Supabase Auth (email + password + the 6-digit TOTP code the screen already has).
5. **Untouched:** `calc.js` + its golden tests, the Boss view, the report, the look.
6. **Symmetry proof:** the demo data loaded into the database must give the SAME screens as today (Sky
   328,000 / 75,000 / 253,000 with the current demo + test rows; report page count; statuses) — before and after.

## 4. Files (Lock 3, the vault)
Private bucket `documents`, path `firm/<firm_id>/<document_id>.pdf`; uploads only through the Admin; the `sha256`
stored at upload proves the file never changed; reads only through 5-minute signed links that the guard approves
(a Boss gets a link only for documents of active contracts).

## 5. How the database is built and changed — migrations through GitHub
- `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` in this repo = the database's blueprint, versioned with the code.
- Push to `main` → Supabase applies the new files to the Saker database (needs **«Deploy to production» ON**).
- An applied migration is **never edited**; a fix is a new migration (the history stays true).
- Demo data is **not** a migration (it would live forever): it is loaded once by a separate script and wiped before
  real data.

## 6. The steps (each ends with a proof I observe myself, then your 🧪)
| Step | What | Proof |
|---|---|---|
| **B0 · Eyes + pipe** | ① you re-authorise my Supabase connector to include the **Saker** org (today it sees only ICCMC) · ② you switch **Deploy to production ON** (branch `main`) · ③ I push a tiny first migration | dashboard «Last migration» shows it; I can list Saker's tables |
| ↳ B0 state 2026-11-17 | ✔ eyes: custom connector «Supabase Saker» (`mcp.supabase.com/mcp?project_ref=ayrijizubulczzympslg`, reaches Saker ONLY) · ✔ defaults checked: auto-RLS trigger `ensure_rls` on; new tables give anon/authenticated no read/write (but TRUNCATE → revoked in B2) · first migration `20261117190500_b0_private_schema.sql` pushed (commit `24901d7`) · ✔ «Deploy to production» ON (branch `main`) by Ibrahim → push `0926e3f`: GitHub check «Supabase Preview» = success · the database records migration `20261117190500 b0_private_schema`; schema `private` exists, closed to anon + authenticated | **✔ B0 DONE** |
| **B1 · Tables** | migration 1: tables, types, keys, checks, indexes | table list + every column type read back |
| **B2 · The guard** | migration 2: roles, RLS, no DELETE, audit trigger, the 10 invariants + `run_health_audit()` (re-checks every money invariant over all rows; returns the breaks, empty = healthy) | **guard tests**: try to break each rule inside a rolled-back transaction → each must be refused; health audit = empty |
| **B3 · The write door** | migration 3: the ~20 functions | each function called with good and bad input; audit rows appear |
| **B4 · The vault** | bucket + policies + signed links | Boss link to a draft's file refused; Admin upload → sha256 stored |
| **B5 · The swap** | `store-sb.js`, awaited writes, demo loaded | symmetry proof: same numbers and report as today; Admin round-trip (payment → Boss sees it) |
| **B6 · Sign-in** | Supabase Auth + TOTP, sign-ups off, two users (Admin, Boss) | wrong code refused; Boss cannot reach Admin functions |
| **B7 · The gate + hosting** | Cloudflare hosting + Access allow-list | a stranger's browser stops at the gate |
| **B8 · Security shelf** | repo → private · three locks verified live · **backups decided** · demo wiped | then, and only then, a real firm |

**⚠️ Backups:** the Free plan keeps **no backups** (the dashboard says «No backups»). Before the first real firm,
one of: **Pro plan** (≈ 25 USD/month: daily backups, 7 days kept; point-in-time recovery is an extra add-on) · or our
own nightly export to a private place. A decision for B8, not now — demo data needs no backup.

## 7. What stays exactly as it is
The principle, the Boss's three altitudes, the status rule, money in cents, one clock (today, Baghdad), credit as a
ledger, payments reversed never edited, nothing deleted, fake data only until B8.
