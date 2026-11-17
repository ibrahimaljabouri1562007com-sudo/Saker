"""Rebuild the صقر / SAKER lettering of the lockup from real fonts (true Bézier outlines, no tracing).

Why: the lockup came from an auto-trace of a small picture — every curve was a chain of short straight
segments on a whole-number grid, so the letters rendered faceted and wobbly at any size.
The falcon mark (paths 0–2) and the two rule lines are kept as they are; only the lettering is rebuilt.

Fonts (SIL Open Font License — outlines may be embedded): Noto Kufi Arabic (Arabic), Noto Sans (Latin),
one family so both scripts match. The Arabic is shaped with HarfBuzz (correct joining forms) and
stretched with kashida (ـ) like the original «صقـــر».

Writes: brand/saker-lockup.svg, brand/saker-wordmark.svg, and the inline logo in index.html
(between the wordmark:begin / wordmark:end markers). Originals stay in brand/_traced/.
Usage: python -I tools/make_wordmark.py [--ar-weight Regular|Bold] [--en-weight Regular|Bold]
"""
import os, re, shutil, sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = r'C:\Windows\Fonts'
args = sys.argv[1:]
AR_W = args[args.index('--ar-weight') + 1] if '--ar-weight' in args else 'Bold'
EN_W = args[args.index('--en-weight') + 1] if '--en-weight' in args else 'Regular'

# the boxes the traced lettering occupied in the 496 × 307 lockup (kept, so the composition is unchanged)
AR_BOX = (78.0, 159.0, 411.0, 256.0)     # x0, y0, x1, y1 — Arabic incl. dots and the ر tail
EN_BOX = (117.0, 278.4, 376.0, 306.4)    # SAKER cap height 28; 0.6 above the edge so the S overshoot is never clipped


def shape(font_path, text, direction, features=None):
    blob = hb.Blob.from_file_path(font_path)
    face = hb.Face(blob); font = hb.Font(face)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    buf.direction = direction
    hb.shape(font, buf, features or {})
    return [(i.codepoint, p.x_advance, p.x_offset, p.y_offset) for i, p in zip(buf.glyph_infos, buf.glyph_positions)]


def outlines(font_path, glyphs, tracking=0.0):
    """glyphs in visual order → list of (glyphName, x, y) in font units, plus total advance"""
    tt = TTFont(font_path); order = tt.getGlyphOrder(); gs = tt.getGlyphSet()
    x, out = 0.0, []
    for gid, adv, xo, yo in glyphs:
        out.append((order[gid], x + xo, yo)); x += adv + tracking
    return tt, gs, out, x - tracking


def bounds(gs, placed):
    bp = BoundsPen(gs)
    for name, x, y in placed:
        gs[name].draw(TransformPen(bp, (1, 0, 0, 1, x, y)))
    return bp.bounds                                  # xmin, ymin, xmax, ymax (font units, y up)


def to_svg_paths(gs, placed, s, ox, oy):
    """font units (y up) → lockup units (y down): X = ox + s·x, Y = oy − s·y"""
    ds = []
    for name, x, y in placed:
        pen = SVGPathPen(gs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
        gs[name].draw(TransformPen(pen, (s, 0, 0, -s, ox + s * x, oy - s * y)))
        d = pen.getCommands()
        if d: ds.append(d)
    return ds


# ── Arabic: «صـــقـــر» — the stretch split on both sides of ق so ق sits in the middle of the word
# (Ibrahim, 2026-11-12). Search the two kashida counts for the best fill of the original box with ق centred.
ar_font = os.path.join(FONTS, f'NotoKufiArabic-{AR_W}.ttf')

def shape_clusters(font_path, text):
    font = hb.Font(hb.Face(hb.Blob.from_file_path(font_path)))
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties(); buf.direction = 'rtl'
    hb.shape(font, buf, {})
    return [(i.codepoint, p.x_advance, p.x_offset, p.y_offset) for i, p in zip(buf.glyph_infos, buf.glyph_positions)], \
           [i.cluster for i in buf.glyph_infos]

target = (AR_BOX[2] - AR_BOX[0]) / (AR_BOX[3] - AR_BOX[1])
best = None
for a in range(0, 9):                     # kashida between ص and ق
    for c in range(0, 9):                 # kashida between ق and ر
        text = 'ص' + 'ـ' * a + 'ق' + 'ـ' * c + 'ر'
        glyphs, clusters = shape_clusters(ar_font, text)
        tt, gs, placed, adv = outlines(ar_font, glyphs)
        b = bounds(gs, placed)
        qb = bounds(gs, [g for g, cl in zip(placed, clusters) if cl == 1 + a])       # the ق (with its dots)
        aspect = (b[2] - b[0]) / (b[3] - b[1])
        off = abs((qb[0] + qb[2]) / 2 - (b[0] + b[2]) / 2) / (b[2] - b[0])           # ق centre vs word centre
        score = abs(aspect - target) / target + 2 * off
        if not best or score < best[0]: best = (score, (a, c), gs, placed, b, off)
_, n_kashida, gs_ar, placed_ar, b, q_off = best
s = (AR_BOX[3] - AR_BOX[1]) / (b[3] - b[1])                          # fit the height
w = s * (b[2] - b[0]); cx = (AR_BOX[0] + AR_BOX[2]) / 2
ar_paths = to_svg_paths(gs_ar, placed_ar, s, cx - w / 2 - s * b[0], AR_BOX[1] + s * b[3])

# ── Latin: SAKER, cap height 28, tracked to the original width ─────────────────────────────────
en_font = os.path.join(FONTS, f'NotoSans-{EN_W}.ttf')
tt_en = TTFont(en_font)
cap = tt_en['OS/2'].sCapHeight
s_en = (EN_BOX[3] - EN_BOX[1]) / cap
glyphs = shape(en_font, 'SAKER', 'ltr', {'kern': True})
_, gs_en, placed0, _ = outlines(en_font, glyphs)
b0 = bounds(gs_en, placed0)
track = ((EN_BOX[2] - EN_BOX[0]) / s_en - (b0[2] - b0[0])) / (len(glyphs) - 1)   # even spacing to fill the width
_, gs_en, placed_en, _ = outlines(en_font, glyphs, track)
b1 = bounds(gs_en, placed_en)
en_paths = to_svg_paths(gs_en, placed_en, s_en, EN_BOX[0] - s_en * b1[0], EN_BOX[3])   # baseline on the box bottom

# ── assemble: keep the falcon (paths 0–2) and the two rule lines (last two paths) ───────────────
traced_dir = os.path.join(ROOT, 'brand', '_traced'); os.makedirs(traced_dir, exist_ok=True)
lock_path = os.path.join(ROOT, 'brand', 'saker-lockup.svg')
if not os.path.exists(os.path.join(traced_dir, 'saker-lockup.svg')):
    for f in ('saker-lockup.svg', 'saker-wordmark.svg'):
        shutil.copy(os.path.join(ROOT, 'brand', f), os.path.join(traced_dir, f))
orig = open(os.path.join(traced_dir, 'saker-lockup.svg'), encoding='utf-8').read()
old_paths = re.findall(r'<path[^>]*/>', orig)
falcon, rules = old_paths[:3], old_paths[-2:]
P = lambda d: f'<path fill="currentColor" d="{d}"/>'
# one shape per word: abutting glyphs (the kashida pieces) merge with no hairline seams between them
letters = [P(' '.join(ar_paths)), P(' '.join(en_paths))]

svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 307" role="img" aria-label="صقر SAKER">\n'
       '<title>Saker Lockup</title>\n' + '\n'.join(falcon + letters + rules) + '\n</svg>\n')
open(lock_path, 'w', encoding='utf-8', newline='\n').write(svg)

# wordmark alone (the lettering + rules, shifted up like the original wordmark file: y − 159)
shift = lambda d: d  # the wordmark file keeps its own box via a transform
wm = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 159 496 148" role="img" aria-label="صقر SAKER">\n'
      '<title>Saker Wordmark</title>\n' + '\n'.join(letters + rules) + '\n</svg>\n')
open(os.path.join(ROOT, 'brand', 'saker-wordmark.svg'), 'w', encoding='utf-8', newline='\n').write(wm)

# inline logo in index.html: replace the paths inside <svg class="si-mark" …> … </svg>
html_path = os.path.join(ROOT, 'index.html'); html = open(html_path, encoding='utf-8').read()
m = re.search(r'(<svg class="si-mark"[^>]*>)(.*?)(</svg>)', html, re.S)
assert m, 'si-mark not found'
inner = '\n<!-- wordmark: falcon (traced original) + lettering rebuilt from Noto Kufi Arabic / Noto Sans by tools/make_wordmark.py -->\n' \
        + '\n'.join(falcon + letters + rules) + '\n        '
html = html[:m.start(2)] + inner + html[m.end(2):]
open(html_path, 'w', encoding='utf-8', newline='\n').write(html)
print(f'Arabic: NotoKufiArabic-{AR_W}, kashida {n_kashida} (sad-qaf, qaf-reh), qaf off-centre {q_off*100:.1f}% of width, scale {s:.4f}; Latin: NotoSans-{EN_W}, tracking {track:.0f} units; '
      f'{len(ar_paths)} + {len(en_paths)} letter paths')
