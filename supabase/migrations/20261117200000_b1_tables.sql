-- صقر · B1, the shelves (2026-11-17): the 12 tables of _guide/SCHEMA.md, translated 1:1.
-- Only SHAPE rules live here (types, required fields, row-local checks, keys, uniqueness). Rules that span tables or
-- depend on today (Baghdad) arrive in B2 (the guard); the only writers arrive in B3 (functions).
-- Conventions: _id = a link · _cents = whole cents (bigint) · _on = a calendar day (date) · _at = a moment (timestamptz).
-- Every link: on delete restrict (nothing is pulled out from under its rows; nothing is deleted at all — B2).

-- ── the people ──────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.app_users (
  user_id    uuid primary key references auth.users (id) on delete restrict,
  email      text not null check (btrim(email) <> ''),
  role       text not null check (role in ('admin', 'boss')),
  lang       text not null default 'ar' check (lang in ('ar', 'en')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()                           -- empty only for the very first Admin (set up by hand)
);
comment on table public.app_users is 'صقر: who may sign in, and as Admin or Boss';

-- ── firms ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.firms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  contact    text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);
create unique index firms_name_unique on public.firms (lower(btrim(name)));   -- "Contoso " = "contoso"
comment on table public.firms is 'صقر: the firms that owe money under contracts';

-- ── documents (the files themselves live in the vault, B4) ──────────────────────────────────────────────────────────
create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references public.firms (id) on delete restrict,
  contract_id uuid,                                              -- link added below (contracts point back here too)
  kind        text not null check (kind in ('contract', 'receipt', 'instruction', 'outside')),
  file_path   text not null unique check (btrim(file_path) <> ''),
  file_name   text not null check (btrim(file_name) <> ''),
  pages       int  not null check (pages > 0),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),  -- proves the file never changed
  created_at  timestamptz not null default now(),
  created_by  uuid not null default auth.uid()
);
comment on table public.documents is 'صقر: every file (contract, receipt, firm instruction, outside letter); never modified';

-- ── anchors: a highlight = a page + a box over a file ──────────────────────────────────────────────────────────────
create table public.anchors (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  page        int  not null check (page >= 1),
  box         real[] check (box is null or (array_length(box, 1) = 4 and array_ndims(box) = 1
                 and 0 <= all (box) and 1 >= all (box) and box[3] > 0 and box[4] > 0)),   -- x, y, w, h (0…1); empty = page
  created_at  timestamptz not null default now(),
  created_by  uuid not null default auth.uid()
);
comment on table public.anchors is 'صقر: a highlight (page + box as fractions of the page), drawn over a file';

-- ── contracts ───────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.contracts (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null references public.firms (id) on delete restrict,
  ref             text not null check (btrim(ref) <> ''),
  signed_on       date,
  document_id     uuid not null references public.documents (id) on delete restrict,
  total_cents     bigint check (total_cents > 0),
  total_source    text check (total_source in ('contract', 'sum')),
  total_anchor_id uuid references public.anchors (id) on delete restrict,
  state           text not null default 'draft' check (state in ('draft', 'active')),
  activated_at    timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid not null default auth.uid(),
  constraint contracts_total_pair    check ((total_cents is null) = (total_source is null)),
  constraint contracts_total_box     check (total_source is distinct from 'contract' or total_anchor_id is not null),
  constraint contracts_active_moment check ((state = 'active') = (activated_at is not null))
);
create unique index contracts_ref_unique on public.contracts (lower(btrim(ref)));
comment on table public.contracts is 'صقر: a contract (draft while the Admin builds it; active = the Boss sees it)';

alter table public.documents
  add constraint documents_contract_fk foreign key (contract_id) references public.contracts (id) on delete restrict;

-- ── installments: the schedule (their number «القسط 2 من 3» is computed, never stored) ──────────────────────────────
create table public.installments (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid not null references public.contracts (id) on delete restrict,
  due_on           date not null,
  amount_cents     bigint not null check (amount_cents > 0),
  amount_anchor_id uuid references public.anchors (id) on delete restrict,
  date_anchor_id   uuid references public.anchors (id) on delete restrict,
  voided_at        timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid not null default auth.uid()
);
comment on table public.installments is 'صقر: the schedule; a removed installment is voided, never deleted';

-- ── notes ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.notes (
  id             uuid primary key default gen_random_uuid(),
  contract_id    uuid not null references public.contracts (id) on delete restrict,
  installment_id uuid references public.installments (id) on delete restrict,   -- empty = about the whole contract
  text           text not null check (btrim(text) <> ''),
  anchor_id      uuid references public.anchors (id) on delete restrict,        -- its source
  voided_at      timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid not null default auth.uid()
);
comment on table public.notes is 'صقر: a note on a contract or one installment, with its source';

-- ── links: an outside reference placed on one field of a row ───────────────────────────────────────────────────────
create table public.links (
  id             uuid primary key default gen_random_uuid(),
  contract_id    uuid not null references public.contracts (id) on delete restrict,
  document_id    uuid not null references public.documents (id) on delete restrict,
  anchor_id      uuid not null references public.anchors (id) on delete restrict,
  target         text not null check (target in ('contract', 'amount', 'date')),
  installment_id uuid references public.installments (id) on delete restrict,
  voided_at      timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid not null default auth.uid(),
  constraint links_target_row check ((target = 'contract') = (installment_id is null))
);
comment on table public.links is 'صقر: an outside document placed beside the contract, an amount or a date';

-- ── payments: money that came in (a transfer for a contract · a deposit on the firm's credit) ─────────────────────
create table public.payments (
  id                      uuid primary key default gen_random_uuid(),
  kind                    text not null check (kind in ('transfer', 'credit')),
  firm_id                 uuid not null references public.firms (id) on delete restrict,
  contract_id             uuid references public.contracts (id) on delete restrict,
  received_on             date not null,
  amount_cents            bigint not null check (amount_cents > 0),
  bank_ref                text not null check (btrim(bank_ref) <> ''),
  proof_document_id       uuid not null references public.documents (id) on delete restrict,
  proof_anchor_id         uuid not null references public.anchors (id) on delete restrict,
  instruction_document_id uuid references public.documents (id) on delete restrict,
  instruction_anchor_id   uuid references public.anchors (id) on delete restrict,
  voided_at               timestamptz,
  created_at              timestamptz not null default now(),
  created_by              uuid not null default auth.uid(),
  constraint payments_transfer_has_contract check ((kind = 'transfer') = (contract_id is not null)),
  constraint payments_credit_has_instruction check (
    (kind = 'credit') = (instruction_document_id is not null) and (kind = 'credit') = (instruction_anchor_id is not null))
);
create unique index payments_bank_ref_unique on public.payments (firm_id, lower(btrim(bank_ref))) where voided_at is null;
comment on table public.payments is 'صقر: money received; corrected only by reversal (voided_at), never edited';

-- ── vouchers: the system's own numbered papers for moves inside the books ─────────────────────────────────────────
create table public.vouchers (
  id                   uuid primary key default gen_random_uuid(),
  no                   int  not null unique check (no > 0),     -- gap-free 1, 2, 3… (the counter arrives in B3)
  kind                 text not null check (kind in ('settlement', 'reversal')),
  firm_id              uuid not null references public.firms (id) on delete restrict,
  contract_id          uuid not null references public.contracts (id) on delete restrict,
  issued_on            date not null,
  amount_cents         bigint not null check (amount_cents > 0),
  lines                jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  balance_before_cents bigint not null check (balance_before_cents >= 0),
  balance_after_cents  bigint not null check (balance_after_cents >= 0),
  reverses             uuid references public.vouchers (id) on delete restrict,
  reversed_by          uuid references public.vouchers (id) on delete restrict,
  created_at           timestamptz not null default now(),
  created_by           uuid not null default auth.uid(),
  constraint vouchers_reversal_points_back check ((kind = 'reversal') = (reverses is not null)),
  constraint vouchers_not_self check (reverses is distinct from id and reversed_by is distinct from id)
);
comment on table public.vouchers is 'صقر: numbered settlement / reversal papers written by the system; never typed or edited';

-- ── allocations: which installment a payment paid, how much, on which day ──────────────────────────────────────────
create table public.allocations (
  id             uuid primary key default gen_random_uuid(),
  payment_id     uuid not null references public.payments (id) on delete restrict,
  installment_id uuid not null references public.installments (id) on delete restrict,
  amount_cents   bigint not null check (amount_cents > 0),
  applied_on     date not null,                                 -- the day it counted (the month math uses THIS date)
  voucher_id     uuid references public.vouchers (id) on delete restrict,   -- set for credit uses (checked in B2)
  voided_at      timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid not null default auth.uid()
);
comment on table public.allocations is 'صقر: the split of a payment over installments';

-- ── audit_log: the one history (written by a trigger in B2; append-only) ───────────────────────────────────────────
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  table_name text not null,
  row_id     text not null,
  action     text not null check (action in ('insert', 'update', 'void')),
  before     jsonb,
  after      jsonb
);
comment on table public.audit_log is 'صقر: who changed what, when, before and after — append-only';

-- ── an index on every link column (fast joins, fast "is this still used?" checks) ──────────────────────────────────
create index on public.documents    (firm_id);
create index on public.documents    (contract_id);
create index on public.anchors      (document_id);
create index on public.contracts    (firm_id);
create index on public.contracts    (document_id);
create index on public.contracts    (total_anchor_id);
create index on public.installments (contract_id);
create index on public.installments (amount_anchor_id);
create index on public.installments (date_anchor_id);
create index on public.notes        (contract_id);
create index on public.notes        (installment_id);
create index on public.notes        (anchor_id);
create index on public.links        (contract_id);
create index on public.links        (document_id);
create index on public.links        (anchor_id);
create index on public.links        (installment_id);
create index on public.payments     (firm_id);
create index on public.payments     (contract_id);
create index on public.payments     (proof_document_id);
create index on public.payments     (proof_anchor_id);
create index on public.payments     (instruction_document_id);
create index on public.payments     (instruction_anchor_id);
create index on public.vouchers     (firm_id);
create index on public.vouchers     (contract_id);
create index on public.vouchers     (reverses);
create index on public.vouchers     (reversed_by);
create index on public.allocations  (payment_id);
create index on public.allocations  (installment_id);
create index on public.allocations  (voucher_id);
create index on public.audit_log    (table_name, row_id);

-- ── nothing open to the browser yet: every table locked (RLS on, no rights) until B2 grants exactly what is needed ──
do $$
declare t text;
begin
  foreach t in array array['app_users','firms','documents','anchors','contracts','installments','notes','links',
                           'payments','vouchers','allocations','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on all sequences in schema public from public, anon, authenticated;
