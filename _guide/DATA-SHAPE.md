# DATA-SHAPE — صقر skeleton (step A1, draft for Ibrahim's approval)

The one shape that the fake fridge (A2), the screens (A4–A6) and the real database (B1) all
share. Field names here = column names later, so wiring is a swap, not a rewrite.

Conventions: every money field is **integer cents, USD** (`amount_cents`, 150000 = 1,500.00 USD).
Every table has `id`, `created_at`, `created_by`. Dates are calendar dates; "today" = **Baghdad
date**. Free text (firm names, notes) is stored as typed and never translated.

---

## 1. Stored tables (9)

| Table | Fields | Notes |
|---|---|---|
| **users** | `email` · `role` (`admin` \| `boss`) · `lang` (`ar` \| `en`) | One Admin, one Boss for now. |
| **firms** | `name` · `contact` (optional) | |
| **documents** | `firm_id` · `contract_id` (optional) · `kind` (`contract` \| `outside` \| `receipt`) · `file_path` · `file_name` · `pages` · `sha256` · `ref_target` + `ref_installment_id` (an `outside` file: where the Boss meets it, chosen on upload) | The file is never modified; `sha256` proves it. |
| **contracts** | `firm_id` · `ref` (unique) · `signed_on` · `total_cents` · `total_anchor_id` (the highlighted total clause) · `total_source` (`contract` \| `sum`) · `document_id` (the contract file) · `state` (`draft` \| `active`) · `activated_at` | See lifecycle below. `total_source = sum` = the contract states no total (Admin confirmed). Added 2026-11-12. |
| **installments** | `contract_id` · `seq` (1, 2, 3…) · `due_on` · `amount_cents` · `amount_anchor_id` + `date_anchor_id` (the box of each part; equal when one box shows both; null = not highlighted yet) · `anchor_id` (the main box = amount, else date) · `voided_at` | `seq` follows the due date. A removed installment keeps its row with `voided_at` (never deleted) and leaves the sum. Rows without the two part fields (the demo) use `anchor_id` for both. Added 2026-11-12. |
| **links** | `contract_id` · `document_id` (an `outside` file) · `anchor_id` (the box on it) · `target` (`contract` \| `amount` \| `date`; `status` comes with payments) · `installment_id` (null for `contract`) · `voided_at` | A reference highlight placed on one field of the Boss's row → opens side by side with the contract. Added 2026-11-12. |
| **vouchers** | `no` (sequential, never reused) · `kind` (`settlement` \| `reversal`) · `firm_id` · `contract_id` · `on` · `amount_cents` · `lines` [installment · deposit · cents] · `balance_before` · `balance_after` · `reverses` (a reversal → its settlement) · `reversed_by` | The system's own record of a move INSIDE the books (credit → installments, and back). Written by the system, shown as a page; never typed or edited. Added 2026-11-14. |
| **anchors** | `document_id` · `page` · `box` (x, y, w, h as fractions of the page; empty = page only) | A highlight is data, drawn over the file. |
| **notes** | `contract_id` · `installment_id` (optional: empty = the whole contract, shown on every row) · `text` · `anchor_id` (its source: contract or outside document) · `voided_at` | |
| **payments** | `kind` (`transfer` = for a contract · `credit` = a deposit on the firm, `contract_id` empty) · `instruction_document_id` + `instruction_anchor_id` (credit only: the firm's instruction, boxed) · `firm_id` · `contract_id` · `received_on` · `amount_cents` · `bank_ref` (unique per firm) · `proof_document_id` (a `receipt` document) · `proof_anchor_id` (the amount line, boxed — required) · `voided_at` | **Corrections are reversals**: a wrong payment gets `voided_at` (kept, logged) and is entered again; never overwritten. Finished contracts only; `received_on` ≤ today and ≥ the signing date. Changed 2026-11-14. |
| **allocations** | `payment_id` · `installment_id` · `amount_cents` · `applied_on` (the day it paid the installment: = `received_on` for a transfer, the application day for credit — the month math counts THIS date) · `voucher_id` (credit uses) · `voided_at` | Which installment(s) a payment settled. Oldest-first by default (`calc.fifo`), changeable by the Admin. Σ = the payment exactly; none above what the installment still owes. Voided with their payment. |

Plus **audit_log** (`at` · `user` · `table` · `row_id` · `action` · `before` · `after`): every insert and edit, who and when, like the Al-Amin registry. The Admin can see "entered by X on date"; the Boss never sees it.

**Documents of any format** (PDF, Word, image) are converted to PDF pages on upload, so the viewer, scroll and highlight are always the same.

```
firms ─< contracts ─< installments ─< allocations >─ payments >─ (proof) documents
             │              │                                          │
             └─ documents   └─ anchor ─> documents (page + box) <─ anchor ─ notes
                    └─ (outside) ─< links ─> anchor + target (contract · amount · date)
```

## 2. Computed, never stored

| Value | Rule |
|---|---|
| `paid_cents` of an installment | Σ its allocations (up to the viewed date) |
| `outstanding_cents` | `amount_cents − paid_cents` |
| `dpd` (days past due) | today − `due_on`, only when outstanding > 0 and `due_on` has passed |
| **status** | table below |
| **Sky / Hover numbers** | the month math in `ROADMAP.md` §1 |

## 3. Status (iteration 1)

| Case | Shown as | Clickable? |
|---|---|---|
| This month, nothing paid, date not reached | 🟢 **Due** | No |
| This month, nothing paid, date passed | 🔴 **Due · 10d** | No |
| This month, part paid | 🟡 **Partially paid** + "paid X of Y" (wording later) | Yes → its receipt(s) |
| Any month, fully paid | ✓ **Paid** | Yes → its receipt(s) |
| Earlier month, still owed | 🔴 **Overdue · 26d** (+ "of Y" under the amount if part paid) | Only if something was paid |

**One rule behind the click: the status is clickable if and only if money came in.** No payment
= no document to show.

Every editable row also carries `updated_at` · `updated_by` (and `voided_at` when removed); the full before/after is in `audit_log`.

## 4. Contract lifecycle: draft → active

- **Draft:** the Admin builds it freely: uploads, highlights, adds and fixes installments.
  Invisible to the Boss.
- **Activate:** allowed only when the file is attached, there is ≥ 1 installment, and
  **Σ installments = total**. After activation the Admin can still correct anything; every
  change is recorded in the audit log, and the Σ = total gate re-checks on each save.
- Payments and notes can be added to an active contract at any time.

## 5. Invariants (the gatekeeper now, database constraints in B1)

1. Σ installments of an active contract = its total.
2. Σ allocations on an installment ≤ its amount.
3. Σ allocations of a payment ≤ the payment (any rest shows to the Admin as "unapplied").
4. Money is never negative.
5. Nothing is hard-deleted. Edits are allowed and always logged (who · when · before · after).

---

## 6. Interface skeleton

**Boss** (read only)
1. Sign-in
2. **Sky**: month switcher ◂ ▸ (current month by default) · Total due · Paid · Remaining · AR/EN switch
3. **Hover**: firms with something due this month (incl. carried overdue), one number + one status
   (worst row wins: Overdue → Due → Partially paid → Paid), largest Remaining first, fully paid at the bottom
4. **Dive**: the firm drawer: *This month* group, then *Overdue* group, same five-column row
5. **Side panel**: contract / clause / receipt / note source, highlighted; opens on the left in
   Arabic, the right in English

**Admin** is a separate view with two tools (the login decides the view; during the build a
switch lets us jump between Admin and Boss):
1. **Search**: month/year (set automatically, adjustable) + firm filter → that firm's contract
   rows in the same layout as the Boss's, but editable (amount, date, highlight, payment, note)
2. **Add**: firm (pick, or type a new one) → contract file → for each installment: highlight the
   clause + form (date, amount) in one motion → notes with their attachments or highlights →
   **Activate** when the sum matches. Payments: amount, date, bank ref, receipt (+ highlight).
