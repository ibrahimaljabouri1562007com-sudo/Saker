"""Build the صقر fake fridge: dummy contract/receipt/letter PDFs + data/demo.js.

Every firm is a well-known fictional demo name; every PDF is stamped DEMO.
Shapes follow _guide/DATA-SHAPE.md exactly (field names = future column names).
Run:  python -I tools/make_demo.py   (from the project root)
"""
import json, os, datetime as dt
import fitz  # PyMuPDF

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
os.makedirs(DOCS, exist_ok=True)
os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)

ADMIN = 'admin@demo.saker'
ENTITY = 'The Provider (demo entity)'

# ── the scenario ────────────────────────────────────────────────────────────
# firm -> contracts; contract = (ref, signed, [(due, usd)], payments)
# payment = (received_on, usd, bank_ref, [(installment_no, usd)])
FIRMS = [
  ('Contoso Engineering', [   # 4 contracts, all with a November installment (Ibrahim's "Firm X")
    ('CTR-2026-011', '2026-08-01', [('2026-09-10', 20000), ('2026-10-10', 20000), ('2026-11-10', 20000)],
       [('2026-09-12', 20000, 'TRX-3102', [(1, 20000)]), ('2026-10-09', 20000, 'TRX-3377', [(2, 20000)])]),
    ('CTR-2026-019', '2026-10-01', [('2026-11-05', 15000), ('2026-12-05', 15000), ('2027-01-05', 15000)],
       [('2026-11-04', 15000, 'TRX-4410', [(1, 15000)])]),
    ('CTR-2026-022', '2026-07-15', [('2026-08-20', 10000), ('2026-11-20', 10000), ('2027-02-20', 10000)],
       [('2026-08-19', 10000, 'TRX-2981', [(1, 10000)])]),
    ('CTR-2026-027', '2026-10-20', [('2026-11-25', 5000), ('2026-12-25', 15000)], []),
  ]),
  ('Fabrikam Logistics', [    # 7 contracts, 3 with a November installment (Ibrahim's "Firm Y")
    ('FAB-24-101', '2026-09-01', [('2026-11-12', 8000), ('2026-12-12', 8000), ('2027-01-12', 8000)], []),
    ('FAB-24-102', '2026-09-15', [('2026-11-18', 12000), ('2027-02-18', 24000)],
       [('2026-11-06', 6000, 'TRX-4433', [(1, 6000)])]),
    ('FAB-24-103', '2026-10-01', [('2026-11-30', 30000), ('2027-03-30', 30000)], []),
    ('FAB-24-104', '2026-05-01', [('2026-06-01', 15000)], [('2026-06-03', 15000, 'TRX-1120', [(1, 15000)])]),
    ('FAB-24-105', '2026-10-10', [('2026-12-20', 11000), ('2027-01-20', 11000)], []),
    ('FAB-24-106', '2026-07-01', [('2026-08-15', 20000), ('2027-02-15', 20000)],
       [('2026-08-14', 20000, 'TRX-2876', [(1, 20000)])]),
    ('FAB-24-107', '2026-10-25', [('2027-01-10', 10000)], []),
  ]),
  ('Northwind Trading', [     # Sep unpaid, Oct partly paid, Nov due (carry-forward case)
    ('NWT-0458', '2026-08-15', [('2026-09-10', 20000), ('2026-10-10', 20000), ('2026-11-10', 20000), ('2026-12-10', 20000)],
       [('2026-10-20', 10000, 'TRX-3561', [(2, 10000)])]),
  ]),
  ('Tailspin Construction', [ # November installment partly paid, date passed
    ('TSC-2026-07', '2026-09-20', [('2026-11-02', 25000), ('2027-01-02', 25000)],
       [('2026-11-05', 10000, 'TRX-4402', [(1, 10000)])]),
  ]),
  ('Litware Systems', [       # everything due in November is paid (one paid early, in October)
    ('LIT-3301', '2026-09-01', [('2026-11-07', 10000), ('2026-12-07', 10000), ('2027-01-07', 10000)],
       [('2026-11-06', 10000, 'TRX-4419', [(1, 10000)])]),
    ('LIT-3302', '2026-10-01', [('2026-11-01', 14000)], [('2026-10-30', 14000, 'TRX-3990', [(1, 14000)])]),
  ]),
  ('Adventure Works', [       # November date passed, nothing paid; contract arrived as a SCAN
    ('ADW-77-12', '2026-10-01', [('2026-11-03', 12000), ('2026-12-03', 12000), ('2027-01-03', 12000)], []),
  ]),
  ('Woodgrove Services', [    # one transfer settles November AND December (early money)
    ('WGS-2026-3', '2026-10-05', [('2026-11-15', 20000), ('2026-12-15', 20000)],
       [('2026-11-01', 40000, 'TRX-4387', [(1, 20000), (2, 20000)])]),
  ]),
  ('Proseware', [             # old debt only: overdue since July, under dispute
    ('PRS-19-04', '2026-06-01', [('2026-07-30', 25000)], []),
  ]),
  ('Lucerne Publishing', [    # nothing due in November -> hidden in November, visible in December
    ('LUC-5521', '2026-10-15', [('2026-12-01', 9000), ('2027-01-01', 9000)], []),
  ]),
  ('Coho Industries', [       # October paid on time, November not yet reached
    ('COH-880', '2026-09-01', [('2026-10-15', 12000), ('2026-11-28', 12000)],
       [('2026-10-15', 12000, 'TRX-3418', [(1, 12000)])]),
  ]),
]

# notes: (contract_ref, installment_no or None, text, source) ; source = 'clause8' or a letter key
LETTERS = {
  'nwt-letter': ('Northwind Trading', '2026-11-01', 'LETTER-NWT-2026-11-01',
    ['We acknowledge the outstanding balance of USD 10,000.00 on installment 2 of contract NWT-0458.',
     'We request that this balance be settled together with the December installment,',
     'due to a delay in our own customer receipts. We remain committed to the full schedule.']),
  'prs-letter': ('Proseware', '2026-08-10', 'LETTER-PRS-2026-08-10',
    ['Payment of installment 1 of contract PRS-19-04 is withheld pending final acceptance',
     'of the delivered works. We will release payment within 10 days of the signed acceptance',
     'certificate. Please treat this letter as formal notice of the disputed items listed below.']),
}
NOTES = [
  ('CTR-2026-011', None, 'Late payment fee: 1% per month (clause 8.1)', 'clause8'),
  ('NWT-0458', 2, 'Firm asked to settle the remaining 10,000 with December', 'nwt-letter'),
  ('PRS-19-04', 1, 'Withheld pending acceptance certificate (dispute)', 'prs-letter'),
]

# ── PDF helpers ─────────────────────────────────────────────────────────────
W, H = 595, 842  # A4 points

def money(usd):
    return f'USD {usd:,.2f}'

def long_date(iso):
    d = dt.date.fromisoformat(iso)
    return f'{d.day} {d.strftime("%B %Y")}'

def stamp(page):
    page.insert_text((W - 150, 40), 'DEMO DOCUMENT', fontsize=9, fontname='hebo', color=(0.75, 0.2, 0.2))
    page.insert_text((40, H - 30), 'Fictitious parties and amounts. Created for testing the SAKER system only.',
                     fontsize=7, fontname='helv', color=(0.45, 0.45, 0.45))

def write_lines(page, y, lines, size=10.5, gap=17, x=56, font='helv'):
    for ln in lines:
        page.insert_text((x, y), ln, fontsize=size, fontname=font)
        y += gap
    return y

def anchor_of(doc_path_or_doc, page_no, needles, pad=4):
    """Box around the given text lines on a page, as fractions of the page (x, y, w, h)."""
    doc = doc_path_or_doc
    page = doc[page_no - 1]
    rects = []
    for n in needles:
        found = page.search_for(n)
        assert found, f'anchor text not found: {n!r}'
        rects += found
    r = fitz.Rect(rects[0])
    for x in rects[1:]:
        r |= x
    r = fitz.Rect(r.x0 - pad, r.y0 - pad, r.x1 + pad, r.y1 + pad)
    pr = page.rect
    return [round(r.x0 / pr.width, 4), round(r.y0 / pr.height, 4), round(r.width / pr.width, 4), round(r.height / pr.height, 4)]

def make_contract(firm, ref, signed, schedule):
    doc = fitz.open()
    total = sum(a for _, a in schedule)
    p1 = doc.new_page(width=W, height=H); stamp(p1)
    p1.insert_text((56, 90), 'SERVICE AGREEMENT', fontsize=18, fontname='hebo')
    y = write_lines(p1, 125, [f'Contract reference: {ref}', f'Signed on: {long_date(signed)}'], size=11)
    y = write_lines(p1, y + 14, [f'Between {ENTITY} ("the Provider")', f'and {firm} ("the Client").'])
    clauses = [
      ('1. Scope', ['The Provider shall deliver the services described in Annex A of this agreement,',
                    'in accordance with the timetable and quality standards set out therein.']),
      ('2. Term', ['This agreement enters into force on the signing date and remains in force until',
                   'all obligations of both parties, including all payments, have been fulfilled.']),
      ('3. Obligations of the Client', ['The Client shall provide timely access, information and approvals',
                                        'reasonably required by the Provider to perform the services.']),
      ('4. Acceptance', ['Each deliverable is deemed accepted ten (10) days after delivery unless the Client',
                         'notifies the Provider in writing of a material non-conformity.']),
      ('5. Confidentiality', ['Each party shall keep confidential all information received from the other',
                              'party and shall use it only for the purposes of this agreement.']),
      ('6. Governing law', ['This agreement is governed by the laws applicable at the Provider\'s seat.',
                            'Disputes are settled amicably first, then before the competent courts.']),
    ]
    y += 16
    for title, body in clauses:
        p1.insert_text((56, y), title, fontsize=11, fontname='hebo'); y += 18
        y = write_lines(p1, y, body) + 10

    p2 = doc.new_page(width=W, height=H); stamp(p2)
    p2.insert_text((56, 90), '7. Fees and payment schedule', fontsize=12, fontname='hebo')
    y = write_lines(p2, 118, [f'7.1 The total contract value is {money(total)}.',
                              f'7.2 The Client shall pay in {len(schedule)} installment{"s" if len(schedule) > 1 else ""} as follows:'])
    lines = []
    for i, (due, usd) in enumerate(schedule, 1):
        lines.append(f'({chr(96 + i)}) Installment {i}: {money(usd)} due on {long_date(due)}.')
    y = write_lines(p2, y + 6, lines, x=76) + 4
    y = write_lines(p2, y, ['7.3 Payments are made by bank transfer to the Provider\'s account stated in Annex B.'])
    p2.insert_text((56, y + 16), '8. Late payment', fontsize=12, fontname='hebo')
    y = write_lines(p2, y + 42, ['8.1 Any amount not paid by its due date bears a late fee of 1% per month,',
                                 'calculated from the due date until the date of full payment.',
                                 '8.2 Late payment does not release the Client from any other obligation.'])
    p2.insert_text((56, y + 16), '9. Signatures', fontsize=12, fontname='hebo')
    write_lines(p2, y + 60, ['For the Provider: ______________________', '',
                             f'For {firm}: ______________________'])
    anchors = [anchor_of(doc, 2, [ln]) for ln in lines]
    clause8 = anchor_of(doc, 2, ['8.1 Any amount not paid by its due date bears a late fee of 1% per month,',
                                 'calculated from the due date until the date of full payment.'])
    return doc, anchors, clause8

def make_receipt(firm, received_on, usd, bank_ref):
    doc = fitz.open()
    p = doc.new_page(width=W, height=H * 0.5); stamp(p)
    p.insert_text((56, 80), 'BANK TRANSFER CONFIRMATION', fontsize=15, fontname='hebo')
    write_lines(p, 120, [f'Reference: {bank_ref}', f'Value date: {long_date(received_on)}',
                         f'Amount: {money(usd)}', f'Ordering party: {firm}',
                         f'Beneficiary: {ENTITY}', 'Status: Executed'], size=11, gap=22)
    return doc, anchor_of(doc, 1, [f'Reference: {bank_ref}', f'Amount: {money(usd)}'])

def make_letter(firm, date, ref, body):
    doc = fitz.open()
    p = doc.new_page(width=W, height=H); stamp(p)
    p.insert_text((56, 90), firm, fontsize=14, fontname='hebo')
    y = write_lines(p, 125, [f'Ref: {ref}', f'Date: {long_date(date)}', '', f'To: {ENTITY}', '', 'Dear Sirs,'])
    write_lines(p, y + 8, body + ['', 'Yours faithfully,', f'Finance Department, {firm}'])
    return doc, anchor_of(doc, 1, body)

def rasterize(doc):
    """Turn a text PDF into an image-only PDF: how a scanned contract arrives after conversion."""
    out = fitz.open()
    for page in doc:
        pix = page.get_pixmap(dpi=110, colorspace=fitz.csGRAY)
        np_ = out.new_page(width=page.rect.width, height=page.rect.height)
        np_.insert_image(np_.rect, stream=pix.tobytes('png'))
    return out

# ── build ───────────────────────────────────────────────────────────────────
D = {'users': [], 'firms': [], 'documents': [], 'contracts': [], 'installments': [],
     'anchors': [], 'notes': [], 'payments': [], 'allocations': []}
seq = {k: 0 for k in D}
def nid(table, prefix):
    seq[table] += 1
    return f'{prefix}{seq[table]}'
def row(table, prefix, created_at, **kw):
    r = {'id': nid(table, prefix), **kw, 'created_at': created_at, 'created_by': ADMIN}
    D[table].append(r)
    return r

def save_doc(doc, firm_id, contract_id, kind, name, created_at):
    path = f'docs/{name}.pdf'
    doc.save(os.path.join(ROOT, path), garbage=4, deflate=True)
    return row('documents', 'd', created_at, firm_id=firm_id, contract_id=contract_id, kind=kind,
               file_path=path, file_name=f'{name}.pdf', pages=len(doc))

D['users'] = [{'id': 'u1', 'email': ADMIN, 'role': 'admin', 'lang': 'ar'},
              {'id': 'u2', 'email': 'boss@demo.saker', 'role': 'boss', 'lang': 'ar'}]

inst_by_ref = {}
clause8_by_ref = {}
contract_by_ref = {}
for fname, contracts in FIRMS:
    firm = row('firms', 'f', '2026-05-01T09:00:00', name=fname, contact='')
    for ref, signed, schedule, payments in contracts:
        doc, anchors, clause8 = make_contract(fname, ref, signed, schedule)
        if ref == 'ADW-77-12':
            doc = rasterize(doc)
        c = row('contracts', 'c', signed + 'T10:00:00', firm_id=firm['id'], ref=ref, signed_on=signed,
                total_cents=sum(a for _, a in schedule) * 100, document_id=None, state='active',
                activated_at=signed + 'T12:00:00')
        d = save_doc(doc, firm['id'], c['id'], 'contract', ref, signed + 'T10:05:00')
        c['document_id'] = d['id']
        contract_by_ref[ref] = c
        clause8_by_ref[ref] = (d['id'], clause8)
        insts = []
        for i, ((due, usd), box) in enumerate(zip(schedule, anchors), 1):
            a = row('anchors', 'a', signed + 'T11:00:00', document_id=d['id'], page=2, box=box)
            insts.append(row('installments', 'i', signed + 'T11:00:00', contract_id=c['id'], seq=i,
                             due_on=due, amount_cents=usd * 100, anchor_id=a['id']))
        inst_by_ref[ref] = insts
        for received_on, usd, bank_ref, allocs in payments:
            rdoc, rbox = make_receipt(fname, received_on, usd, bank_ref)
            rd = save_doc(rdoc, firm['id'], c['id'], 'receipt', bank_ref, received_on + 'T15:00:00')
            ra = row('anchors', 'a', received_on + 'T15:00:00', document_id=rd['id'], page=1, box=rbox)
            p = row('payments', 'p', received_on + 'T15:00:00', firm_id=firm['id'], contract_id=c['id'],
                    received_on=received_on, amount_cents=usd * 100, bank_ref=bank_ref,
                    proof_document_id=rd['id'], proof_anchor_id=ra['id'])
            for no, part in allocs:
                row('allocations', 'l', received_on + 'T15:00:00', payment_id=p['id'],
                    installment_id=insts[no - 1]['id'], amount_cents=part * 100)

for ref, no, text, source in NOTES:
    c = contract_by_ref[ref]
    if source == 'clause8':
        doc_id, box = clause8_by_ref[ref]
        page = 2
    else:
        firm_name, date, lref, body = LETTERS[source]
        ldoc, box = make_letter(firm_name, date, lref, body)
        doc_id = save_doc(ldoc, c['firm_id'], c['id'], 'outside', lref, date + 'T09:30:00')['id']
        page = 1
    a = row('anchors', 'a', '2026-11-02T10:00:00', document_id=doc_id, page=page, box=box)
    row('notes', 'n', '2026-11-02T10:00:00', contract_id=c['id'],
        installment_id=inst_by_ref[ref][no - 1]['id'] if no else None, text=text, anchor_id=a['id'])

js = ('// GENERATED by tools/make_demo.py — the fake fridge. Same shape as _guide/DATA-SHAPE.md.\n'
      '// Fictitious firms and amounts only. Do not edit by hand; re-run the generator.\n'
      '(function (root) {\n'
      '  const data = ' + json.dumps(D, ensure_ascii=False, indent=1) + ';\n'
      '  root.SAKER_DATA = data;\n'
      '  if (typeof module !== "undefined") module.exports = data;\n'
      '})(typeof window !== "undefined" ? window : globalThis);\n')
open(os.path.join(ROOT, 'data', 'demo.js'), 'w', encoding='utf-8').write(js)
print({k: len(v) for k, v in D.items()})
