# SCHEMA — صقر's database, exactly (B1 = a straight translation of this file into SQL)

Proposed 2026-11-17 for Ibrahim's approval. Built from what the app ACTUALLY writes (`assets/store.js`), not from the
older `DATA-SHAPE.md` draft; differences are listed at the end.

## 1. Seven rules that keep it simple, accurate and maintainable
1. **One table per real thing** (a firm, a contract, a payment…). A fact lives in ONE place.
2. **Store facts, compute conclusions.** Stored: what happened (amounts, dates, boxes, files). Never stored: status,
   days late, what is paid, what is left, credit balance, instalment number — `calc.js` (and the snapshot) compute them,
   so they can never go stale or disagree.
3. **Names say the type** (the app already follows it): `_id` = a link to another table · `_cents` = money in whole
   cents · `_on` = a calendar day · `_at` = a moment in time. Column names = the app's keys → no translation layer.
4. **Every table starts the same way:** `id` (uuid) · `created_at` · `created_by` (the signed-in user). Rows that can be
   "removed" have `voided_at` — removed means voided, never deleted.
5. **Every link is a foreign key with `on delete restrict`** — no orphan can exist, and nothing can be pulled out from
   under its rows.
6. **The database checks shapes** (types + `check`), the guard (B2) checks rules that span tables, the functions (B3)
   are the only writers. Three layers, each with one job.
7. **The history lives in one place:** `audit_log` (who · when · before · after for every insert and edit). No
   `updated_at`/`updated_by` copies on each table — one history, not two that can disagree.

## 2. The tables (12)

Base columns on every table, not repeated below: `id uuid primary key default gen_random_uuid()` ·
`created_at timestamptz not null default now()` · `created_by uuid not null` (→ the signed-in user).

### `app_users` — who may use صقر
| column | type | rule |
|---|---|---|
| `user_id` | uuid PK | → `auth.users` (the sign-in account); replaces the base `id` |
| `email` | text | shown in the log only |
| `role` | text | `in ('admin','boss')` |
| `lang` | text | `in ('ar','en')`, default `ar` |

### `firms`
| column | type | rule |
|---|---|---|
| `name` | text | not empty · **unique ignoring case and spaces** (the app already merges "contoso " = "Contoso") |
| `contact` | text | optional, default `''` |

### `documents` — every file (contract, receipt, firm instruction, outside letter); the file itself sits in the vault
| column | type | rule |
|---|---|---|
| `firm_id` | uuid → firms | required |
| `contract_id` | uuid → contracts | optional (a credit receipt / instruction belongs to the firm only) |
| `kind` | text | `in ('contract','receipt','instruction','outside')` |
| `file_path` | text | unique · the vault path `firm/<firm_id>/<id>.pdf` |
| `file_name` | text | as uploaded |
| `pages` | int | `> 0` |
| `sha256` | text | exactly 64 hex characters — proves the file never changed |

### `anchors` — a highlight = a page + a box, drawn over a file (the file is never touched)
| column | type | rule |
|---|---|---|
| `document_id` | uuid → documents | required |
| `page` | int | `>= 1` and `<= the document's pages` (guard) |
| `box` | real[4] | x, y, w, h as fractions 0…1 · or empty = the whole page |

### `contracts`
| column | type | rule |
|---|---|---|
| `firm_id` | uuid → firms | required |
| `ref` | text | not empty · **unique ignoring case and spaces** |
| `signed_on` | date | optional · `<= today` (Baghdad) |
| `document_id` | uuid → documents | the contract file (kind `contract`, same firm — guard) |
| `total_cents` | bigint | `> 0` or empty |
| `total_source` | text | `in ('contract','sum')` · empty exactly when the total is empty |
| `total_anchor_id` | uuid → anchors | required when `total_source = 'contract'` |
| `state` | text | `in ('draft','active')` |
| `activated_at` | timestamptz | set exactly when `state = 'active'` |

### `installments` — the schedule
| column | type | rule |
|---|---|---|
| `contract_id` | uuid → contracts | required |
| `due_on` | date | `>= the contract's signed_on` (guard) |
| `amount_cents` | bigint | `> 0` |
| `amount_anchor_id` / `date_anchor_id` | uuid → anchors | the box of each part (the same box when one shows both); optional |
| `voided_at` | timestamptz | removed from the schedule, kept in the record |
*Not stored:* the number «القسط 2 من 3» — it follows the due date, so the snapshot computes it (no renumbering writes).
*Dropped:* `anchor_id` — it was always "amount box, else date box"; the snapshot derives it.

### `notes`
| column | type | rule |
|---|---|---|
| `contract_id` | uuid → contracts | required |
| `installment_id` | uuid → installments | optional — empty = about the whole contract (shown on every row) |
| `text` | text | not empty |
| `anchor_id` | uuid → anchors | its source (contract or outside document); optional |
| `voided_at` | timestamptz | |

### `links` — an outside reference placed on one field of a row
| column | type | rule |
|---|---|---|
| `contract_id` | uuid → contracts | required |
| `document_id` | uuid → documents | kind `outside` (guard) |
| `anchor_id` | uuid → anchors | the box on it |
| `target` | text | `in ('contract','amount','date')` |
| `installment_id` | uuid → installments | **required for amount/date, empty for contract** (one `check`) |
| `voided_at` | timestamptz | |

### `payments` — money that came in (a transfer for a contract, or a deposit on the firm's credit)
| column | type | rule |
|---|---|---|
| `kind` | text | `in ('transfer','credit')` |
| `firm_id` | uuid → firms | required |
| `contract_id` | uuid → contracts | **required for a transfer, empty for credit** (`check`) |
| `received_on` | date | `<= today` · `>= the contract's signed_on` (guard) |
| `amount_cents` | bigint | `> 0` |
| `bank_ref` | text | not empty · **unique per firm among live payments** |
| `proof_document_id` + `proof_anchor_id` | uuid → documents / anchors | the receipt and its boxed amount — required |
| `instruction_document_id` + `instruction_anchor_id` | uuid → documents / anchors | **required for credit, empty for a transfer** (`check`) |
| `voided_at` | timestamptz | a reversal; the only column that may change after insert (guard) |

### `vouchers` — the system's own numbered papers for moves inside the books (credit used / credit reversed)
| column | type | rule |
|---|---|---|
| `no` | int | unique · gap-free 1, 2, 3… (a counter locked in the same transaction) |
| `kind` | text | `in ('settlement','reversal')` |
| `firm_id` / `contract_id` | uuid → firms / contracts | required |
| `issued_on` | date | the day of the move (not `on`: a reserved SQL word that would need quotes forever) |
| `amount_cents` | bigint | `> 0` |
| `lines` | jsonb | the printed lines [instalment · deposit · cents] — the paper as issued (the money truth is `allocations`) |
| `balance_before_cents` / `balance_after_cents` | bigint | `>= 0` — as printed on the paper |
| `reverses` | uuid → vouchers | **required for a reversal, empty for a settlement** (`check`) |
| `reversed_by` | uuid → vouchers | set once, never changed again (guard) |

### `allocations` — which instalment a payment paid, how much, on which day
| column | type | rule |
|---|---|---|
| `payment_id` | uuid → payments | required |
| `installment_id` | uuid → installments | required |
| `amount_cents` | bigint | `> 0` |
| `applied_on` | date | the day it counted (= received for a transfer, the use day for credit) |
| `voucher_id` | uuid → vouchers | **set exactly when the payment is credit** (guard) |
| `voided_at` | timestamptz | |

### `audit_log` — append-only history (written by one trigger, readable by the Admin only)
`id bigint identity` · `at timestamptz` · `user_id uuid` · `table_name text` · `row_id uuid` ·
`action in ('insert','update','void')` · `before jsonb` · `after jsonb`. Nobody can edit or remove a line.

## 3. The relations
```
app_users (the people)

firms ─┬─< documents ─< anchors                      (a firm owns its files; a file owns its highlights)
       ├─< contracts ─┬─< installments ─┬─< allocations >─ payments >─ firms
       │     │        │                 └─< notes / links
       │     │        ├─< notes  ─> anchors           (a note's source)
       │     │        └─< links  ─> documents(outside) + anchors
       │     ├─> documents (the contract file)   ├─> anchors (the total's box)
       ├─< payments ─> documents + anchors (receipt; instruction for credit)
       └─< vouchers ─< allocations (credit uses)  · vouchers ─> vouchers (reverses / reversed_by)
```
`─<` = one-to-many · `─>` = points to. Every arrow is a foreign key; every key column is indexed.

## 4. Rules that span tables (built in B2 as guard triggers — listed here so the design is complete)
1. A contract's file, an anchor's document, a payment's receipt: all belong to the **same firm**.
2. An allocation's instalment belongs to the payment's contract (transfer) or the payment's firm (credit).
3. Σ live instalments of an **active** contract = its total.
4. Σ live allocations on an instalment ≤ its amount · a transfer's allocations = the payment exactly · a deposit's uses ≤ the deposit.
5. Payments and vouchers are never edited (only `voided_at` / `reversed_by` once).
6. Dates against today (Baghdad) and against the signing date.
7. Nothing is ever deleted (no grant + a trigger) · every write lands in `audit_log`.

## 5. What the browser receives — one JSON snapshot (`app_snapshot()`)
`{ firms, documents, anchors, contracts, installments, notes, links, payments, allocations, vouchers }` — the same
names and fields `data/demo.js` has today, filtered by role (the Boss: active contracts only), with the two computed
fields the app expects added: `installments.seq` and `installments.anchor_id`. → `calc.js` needs no change.

## 6. How it is laid out in migrations (one purpose each, never edited once applied)
`b1_tables` (this file) → `b2_guard` (roles, RLS, rules, audit, health audit) → `b3_functions` (the write door) →
`b4_vault` (storage) → later changes = new numbered files.

## 7. Differences from the older `DATA-SHAPE.md` draft (decided here)
- `installments.seq` and `installments.anchor_id` are **computed**, not stored (they were derived values).
- `documents.kind` gains `instruction` (the firm's credit instruction — the app already uses it).
- `documents.ref_target` / `ref_installment_id` dropped — `links` does that job.
- `vouchers.on` → `issued_on`, `balance_before/after` → `balance_before_cents/after_cents` (the naming rule; `on` is a
  reserved SQL word). **No aliasing layer:** the app's few references to these two adapt in B5 (with `data/demo.js`).
- `updated_at` / `updated_by` not copied onto tables — `audit_log` is the one history.
- `users` → `app_users` keyed by the sign-in account.
