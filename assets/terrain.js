// صقر sign-in ground — a GPU-drawn landscape (WebGL2), sharp at any screen resolution.
//
// Two passes:
//   1. LAND (once per screen size): every pixel casts a ray into a height field (ray marching).
//      Organic dunes from warped noise, an open valley down the middle, mountains at the sides,
//      moonlight from the top right with soft shadows and a silver sheen on the crests, mist that
//      thickens with distance and pools in the hollows, tone mapping, vignette. It also writes a
//      second image describing the faint "roads": the land's own contour lines, the position along
//      each one, and a few nodes. Drawn in horizontal bands over several frames so no single GPU
//      job is long.
//   2. LIGHT (each frame, at most 30 fps): the stored land + soft pulses travelling along the roads
//      and nodes breathing. Two texture reads per pixel — very light.
//
// Safeguards (agreed with Ibrahim): a still image if WebGL2 is missing or fails; every tuning number
// in SETTINGS; the animation is capped at 30 fps, stops on reduced-motion devices, after 3 minutes
// without input, when the tab is hidden, and after sign-in.
//
// The same layout numbers place the logo, the dome and the fields (compose → signin.js).
(function (root) {
  'use strict';

  // ── every tuning number lives here ──────────────────────────────────────────────────────────
  const SETTINGS = {
    camH: 13,               // eye height above the land (must stay above the near dunes)
    duneHeight: 14,         // height of the rounded dunes (14 = the tuned layout)
    valleyDepth: 0.82,      // how low the land sits along the line of sight (0 = flat, 1 = no valley)
    mountainHeight: 42,     // the ranges at the sides, far away
    fog: 0.0010,            // distance haze: farther layers turn lighter (aerial perspective → depth)
    mist: 0.24,             // mist in the hollows
    veil: 0.38,             // how much light the land itself receives (lower = more of it hidden in the dark)
    crestRest: 0.08,        // crest lines outside the selected highlights (0 = only the chosen ridges shine)
    exposure: 1.2,          // overall brightness
    roadEvery: 2.4,         // spacing of contour "roads" (height units)
    roadBrightness: 0.30,   // faint at rest
    pulseSpeed: 0.035,      // how fast light travels along a road
    breathSec: 9,           // one slow breath of the top-right light shaft (ground + falcon follow it)
    maxPixels: 6.5e6,       // cap on screen pixels, ~3200×2030: large screens draw 1:1
    supersample: 1.8,       // the land is drawn this much larger per side, then filtered down (smooth edges)
    maxLandPixels: 7.5e6,   // cap on the supersampled land (computers)
    maxLandPixelsTouch: 3.6e6,   // lower cap on phones/tablets (memory)
    bands: 12,              // the land is drawn in this many slices, one per frame
    fps: 30,
    idleMs: 180000,         // stop animating after 3 minutes without input
    fallback: 'brand/signin-landscape.webp',
  };

  // ── composition: the horizon line decides where the logo, dome and fields go ────────────────
  function compose(W, H) {
    const portrait = W / H < 0.8;
    let cy, R, logoW, logoH, logoY, formY;
    if (portrait) {
      // proportional to the width (so one poster fits every phone of that shape): 0.62·W on phones,
      // ≈250 px on a 768-wide tablet — identical to the earlier fixed sizes at 390 and 768
      const t = Math.min(1, Math.max(0, (W - 430) / 170)), sm = t * t * (3 - 2 * t);
      logoW = W * (0.62 + (0.3255 - 0.62) * sm); logoH = logoW * 307 / 496;
      const k = logoW / 241.8;
      const logoTop = 0.15 * H;
      logoY = logoTop + logoH / 2;
      formY = logoTop + logoH + 52 * k;
      cy = formY + 120 * k + 0.07 * H;                     // the fields sit just above the horizon
      R = cy - (logoTop - 44 * k);
    } else {
      cy = 0.64 * H;
      R = Math.min(cy - 0.075 * H, 0.34 * W);
      logoH = 0.50 * R; logoW = Math.min(logoH * 496 / 307, 0.6 * W); logoH = logoW * 307 / 496;
      logoY = cy - 0.47 * R;
      formY = cy + Math.max(32, 0.05 * H);                 // the fields stand on the ground
    }
    const f = portrait ? 1.5 * W : 0.8 * W;                 // camera focal length (field of view)
    return { W, H, cx: W / 2, cy, R, logoW, logoH, logoY, formY, f, camH: SETTINGS.camH, portrait };
  }

  // ── landmark hills (handoff, reference B): screen targets → world positions through the camera ──
  // sx = cx + f·x/z  and  sy = cy + f·(camH − h)/z, solved for x and h at a chosen depth z.
  // "above" is how far the top rises above the horizon, in units of a 16:9 frame height.
  const LANDMARKS = {
    wide:     { peak: [0.86, 0.070, 300, 0.060], shoulder: [0.765, 0.018, 230, 0.060], left: [0.175, 0.030, 260, 0.095] },
    portrait: { peak: [0.82, 0.070, 300, 0.090], shoulder: [0.66, 0.018, 230, 0.090], left: [0.18, 0.030, 260, 0.130] },
  };
  function landmarks(L) {
    const set = L.portrait ? LANDMARKS.portrait : LANDMARKS.wide, unit = 0.5625 * L.W;
    const one = ([sx, above, z, halfW]) => [(sx * L.W - L.cx) * z / L.f, z, L.camH + above * unit * z / L.f, halfW * L.W * z / L.f];
    return { peak: one(set.peak), shoulder: one(set.shoulder), left: one(set.left) };
  }

  // ── shaders ─────────────────────────────────────────────────────────────────────────────────
  const VS = `#version 300 es
  in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  // the light shaft from the top right, in screen space (keeps its angle on any shape; on tall screens it
  // stays in the corner). beam = the shaft in the air; pool = where it lands on the ground (wider, softer).
  const BEAM = `
  vec3 beamGeo(vec2 fc, vec2 res) {
    vec2 sp = fc / res.y, a = vec2(res.x / res.y + 0.06, 1.08), dir = normalize(vec2(-0.85, -1.0));
    vec2 v = sp - a; float along = dot(v, dir); return vec3(along, length(v - dir * along), step(res.x / res.y, 0.8));
  }
  float beam(vec2 fc, vec2 res) {
    vec3 g = beamGeo(fc, res); float reach = mix(1.1, 0.55, g.z);
    return mix(1.0, 0.45, g.z) * exp(-g.y * g.y / 0.0045) * smoothstep(0.0, 0.25, g.x) * smoothstep(reach, reach * 0.3, g.x);
  }
  float pool(vec2 fc, vec2 res) {
    vec3 g = beamGeo(fc, res); float w = 0.0045 + 0.022 * max(g.x - 0.7, 0.0);
    return mix(1.0, 0.25, g.z) * exp(-g.y * g.y / w) * smoothstep(0.55, 0.92, g.x) * smoothstep(1.45, 0.92, g.x);
  }`;

  const LAND = `#version 300 es
  precision highp float;
  uniform vec2 uRes; uniform float uCx, uCy, uF, uCamH, uDpr;
  uniform float uDune, uValley, uMount, uFog, uMist, uExp, uRoad, uVeil, uCrestRest;
  uniform vec4 uPeak, uShoulder, uLeft;                       // landmark hills: x, z, top height, half-width (world units)
  layout(location = 0) out vec4 oCol;
  layout(location = 1) out vec4 oData;

  const vec3 L = normalize(vec3(0.55, 0.42, 0.72));          // moon: high, right, behind the land
  const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p, int oct) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * noise(p); p = ROT * p * 2.03; a *= 0.5; }
    return s;
  }
  float smax(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(a, b, h) + k * h * (1.0 - h); }
  // one landmark hill: asymmetric across x (left/right slopes), soft in depth, slightly irregular
  float mass(vec2 p, vec4 m, float depth, float slopeL, float slopeR, float sharp) {
    float dx = (p.x - m.x) / m.w; dx *= dx < 0.0 ? slopeL : slopeR;
    float dz = (p.y - m.y) / depth;
    float r = pow(abs(dx), sharp) + dz * dz;
    return m.z * exp(-r) * (0.96 + 0.04 * sin(p.x * 0.11 + p.y * 0.07));
  }
  // the land: rounded dunes standing one behind another, gently warped; an open corridor down the
  // middle so the depth recedes to the horizon; and three localized landmark hills (handoff ref B):
  // a broad left crest, a dominant right peak, and its shoulder. Positions come from screen targets
  // projected back through the camera (JS: landmarks()).
  float land(vec2 p, int oct) {
    float z = p.y;
    vec2 q = p * 0.008;
    float warp = fbm(q + vec2(3.1, 7.7), 2);
    float h = 1.0;
    float dz0 = 16.0;
    for (int k = 0; k < 11; k++) {
      float fk = float(k);
      float dzk = dz0 * pow(1.42, fk);
      float w = 0.10 * dzk + 1.5;
      float tilt = 0.20 * sin(fk * 1.9 + 0.5);                   // rows run on a slant, not as parallel waves
      float d = (z - dzk + tilt * p.x + 6.0 * (warp - 0.5) * (0.2 + 0.02 * dzk)) / w;
      if (abs(d) > 3.0) continue;
      float a = (3.0 + 0.055 * dzk + 0.075 * max(dzk - 100.0, 0.0)) * (0.80 + 0.20 * sin(fk * 2.1 + 0.7)) * uDune / 14.0;   // far rows rise into ridges
      float f = 5.2 / (dzk + 6.0);
      float wave = 0.7 * sin(p.x * f + fk * 1.7) + 0.3 * sin(p.x * f * 2.3 + fk * 3.2);
      float along = 0.22 + 0.78 * (0.5 + 0.5 * wave);
      h += a * along * exp(-d * d);
    }
    // open corridor: in the line of sight, distant land stays low so the eye travels to the horizon
    float ang = abs(p.x) / max(z, 1.0);
    float corridor = mix(uValley, 1.0, smoothstep(0.12, 0.34, ang));
    h *= mix(1.0, corridor, smoothstep(40.0, 160.0, z));
    h += 0.6 * (fbm(p * 0.05, oct > 3 ? 2 : 1) - 0.5);
    // landmark hills, joined smoothly to the dunes
    h = smax(h, mass(p, uLeft, 85.0, 0.75, 1.15, 2.0), 4.0);
    h = smax(h, mass(p, uShoulder, 55.0, 0.9, 1.0, 2.0), 3.0);
    h = smax(h, mass(p, uPeak, 75.0, 0.62, 1.35, 1.45), 3.0);
    return h;
  }
  vec3 sky(vec3 rd) {
    vec3 top = vec3(0.0034, 0.0085, 0.0190), hor = vec3(0.030, 0.050, 0.080);   // the bright mist band the hills stand against   // linear light (shown after tone mapping)
    vec3 c = mix(hor, top, smoothstep(-0.005, 0.10, rd.y));          // dark quickly above the horizon
    c += vec3(0.10, 0.13, 0.18) * pow(max(dot(rd, L), 0.0), 6.0) * 0.14;   // glow toward the moon
    c += vec3(0.050, 0.072, 0.110) * exp(-pow(rd.y / 0.032, 2.0));         // the glow band behind the hills
    return c;
  }
  ${BEAM}
  float shadow(vec3 p) {
    float res = 1.0, t = 1.0;
    for (int i = 0; i < 32; i++) {
      vec3 q = p + L * t; float h = q.y - land(q.xz, 3);
      res = min(res, 16.0 * h / t);
      if (res < 0.02 || q.y > 70.0) break;
      t += clamp(h, 1.0, 22.0);
    }
    return clamp(res, 0.0, 1.0);
  }

  void main() {
    vec2 fc = gl_FragCoord.xy;
    float sy = uRes.y - fc.y;                                 // screen y, top-down
    vec3 ro = vec3(0.0, uCamH, 0.0);
    vec3 rd = normalize(vec3((fc.x - uCx) / uF, (uCy - sy) / uF, 1.0));
    vec2 uv = fc / uRes;

    // march the ray into the land
    float t = 1.0, tPrev = 1.0, hit = 0.0; vec3 p = ro;
    if (rd.y < 0.09) {
      for (int i = 0; i < 230; i++) {
        p = ro + rd * t;
        float d = p.y - land(p.xz, t < 260.0 ? 5 : 3);
        if (d < 0.0008 * t) { hit = 1.0; break; }
        if (t > 2600.0) break;
        tPrev = t;
        t += max(0.36 * d, 0.008 * t);
      }
      if (hit > 0.5) {                                        // refine: find the true surface between the last two steps
        float a = tPrev, b = t;
        for (int j = 0; j < 7; j++) {
          float m = 0.5 * (a + b); vec3 q = ro + rd * m;
          if (q.y - land(q.xz, 5) < 0.0) b = m; else a = m;
        }
        t = b; p = ro + rd * t;
        p.y = land(p.xz, 5);                                  // sit exactly on the ground (no stepped error → no rings)
      }
    }

    vec3 col; vec4 data = vec4(0.0);
    if (hit > 0.5) {
      float e = 0.02 * t + 0.1;
      vec3 n = normalize(vec3(p.y - land(p.xz + vec2(e, 0), 5), e, p.y - land(p.xz + vec2(0, e), 5)));
      // smooth, matte surfaces (no noise texture: fine noise is what sparkles into "pixels" at a distance)
      // creases: land above the surroundings is a crest, land below them a hollow (cheap occlusion)
      float r = 4.0 + 0.02 * t;
      float hm = 0.5 * (land(p.xz + vec2(r, r * 0.6), 3) + land(p.xz - vec2(r, r * 0.6), 3));
      float ao = clamp(1.0 - (hm - p.y) * 0.16, 0.30, 1.0);
      float crest = clamp((p.y - hm) * 0.35 + 0.30, 0.0, 1.0);
      float dif = clamp(dot(n, L), 0.0, 1.0);
      if (dif > 0.0) dif *= shadow(p + n * 0.3);
      dif *= ao;
      // back light from the bright horizon: the top of every dune catches it, the slope facing us falls
      // into shadow — this is what stacks the dunes into readable layers
      float back = clamp(dot(n, normalize(vec3(0.0, 0.55, 0.84))), 0.0, 1.0);
      back = back * back * ao * (0.18 + 0.82 * smoothstep(25.0, 190.0, t));          // near land stays dark, far land glows
      float amb = (0.08 + 0.08 * n.y) * ao;
      vec3 alb = vec3(0.019, 0.036, 0.064);                                            // slate navy (linear)
      // controlled visibility: the land sits under a dark veil — near ground almost black, the middle
      // distance moderately visible, the far ranges carried by the mist (the sky is NOT darkened)
      float veil = uVeil * mix(0.34, 1.0, smoothstep(20.0, 300.0, t));
      col = veil * alb * (amb * vec3(0.60, 0.78, 1.10) + back * vec3(1.0, 1.10, 1.30) * 1.6 + dif * vec3(0.98, 1.04, 1.15) * 0.9 * (0.10 + 0.90 * smoothstep(55.0, 175.0, t)));
      // crest lines: a crisp silver edge where the surface turns away from the eye — but only SOME ridges
      // catch it: a few wide patches, and the right side under the light; the rest stay subdued
      float fres = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 9.0);
      float sel = max(smoothstep(0.60, 0.82, noise(vec2(p.x * 0.008 + 3.1, p.z * 0.0045 + 1.7))),
                      smoothstep(0.62, 0.88, uv.x) * smoothstep(0.35, 0.80, crest));
      col += vec3(0.34, 0.39, 0.47) * fres * (0.25 + 0.75 * crest) * (0.35 + 0.65 * smoothstep(30.0, 160.0, t)) * (uCrestRest + (1.0 - uCrestRest) * sel);
      // the mesh: a fine net draped over every surface, two sizes so it stays even at any distance
      vec2 g1 = p.xz / vec2(1.6, 1.6), w1 = max(fwidth(g1), vec2(1e-4));
      vec2 g2 = p.xz / vec2(6.4, 6.4), w2 = max(fwidth(g2), vec2(1e-4));
      vec2 l1 = (1.0 - smoothstep(vec2(0.0), 0.9 * w1, min(fract(g1), 1.0 - fract(g1)))) * (1.0 - smoothstep(vec2(0.10), vec2(0.28), w1));
      vec2 l2 = (1.0 - smoothstep(vec2(0.0), 0.9 * w2, min(fract(g2), 1.0 - fract(g2)))) * (1.0 - smoothstep(vec2(0.10), vec2(0.30), w2));
      float mesh = max(max(l1.x, l1.y) * 0.8, max(l2.x, l2.y));
      col += vec3(0.028, 0.036, 0.050) * mesh * (0.45 + 1.0 * back + 0.6 * dif) * exp(-t / 900.0);
      // the shaft lands here: a soft pool of silver light, strongest on slopes that face it
      float pl = pool(fc, uRes);
      float face = clamp(dot(n, normalize(vec3(0.45, 0.85, -0.25))), 0.0, 1.0);
      col += vec3(0.026, 0.028, 0.032) * pl * (0.25 + 0.75 * face) * ao + vec3(0.12, 0.13, 0.15) * fres * pl;
      // depth: haze toward the bright horizon (aerial perspective) + mist pooling between the layers
      float haze = 1.0 - exp(-t * uFog);
      float mist = uMist * exp(-max(p.y, 0.0) * 0.30) * (1.0 - exp(-t * 0.006));
      col = mix(col, sky(rd) * 0.95, clamp(haze + mist, 0.0, 1.0));
      col += vec3(0.010, 0.011, 0.013) * pl;                                          // the shaft's glow in the air above it

      // fiber roads: gently winding lines that run from the viewer into the depth (light travels along them)
      float u = (p.x + 16.0 * sin(p.z * 0.012 + 1.7) + 7.0 * sin(p.z * 0.029)) / (p.z * 0.35 + 40.0);
      float lu = u * 9.0, ridx = floor(lu), rfr = fract(lu);
      float line = 0.8 * (1.0 - smoothstep(0.0, 2.6 * max(fwidth(lu), 1e-4), min(rfr, 1.0 - rfr)))   // soft profile: no beads
                  * step(0.55, hash(vec2(ridx, 3.0))) * exp(-t / 320.0) * smoothstep(6.0, 26.0, t);
      float along = fract(p.z / 420.0), lid = hash(vec2(ridx, 19.0));
      // nodes: a few points scattered on the land
      vec2 cell = floor(p.xz / 46.0);
      vec2 cc = (cell + 0.5 + (vec2(hash(cell), hash(cell + 3.1)) - 0.5) * 0.6) * 46.0;
      float rad = 3.4 * uDpr * t / uF;
      float node = step(0.60, hash(cell + 11.0)) * smoothstep(rad, rad * 0.2, length(p.xz - cc)) * exp(-t / 700.0);
      data = vec4(line, along, node, lid);
    } else {
      col = sky(rd);
      col += vec3(0.20, 0.23, 0.28) * 0.34 * beam(fc, uRes);                          // the shaft (silver, not blue)
    }

    col *= 0.86 + 0.14 * smoothstep(1.25, 0.35, length((uv - 0.5) * vec2(1.3, 1.0)));   // vignette
    col *= uExp;
    col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);              // ACES tone map
    col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
    // colour grade: deep navy shadows, silver highlights (half-way between neutral and Reference C's teal)
    float lk = smoothstep(0.08, 0.55, dot(col, vec3(0.2126, 0.7152, 0.0722)));
    col *= vec3(mix(0.84, 1.06, lk), mix(1.0, 1.04, lk), mix(0.95, 0.96, lk));
    oCol = vec4(col, 1.0);
    oData = data;
  }`;

  const LIGHT = `#version 300 es
  precision mediump float;
  uniform sampler2D uCol, uData; uniform vec2 uRes; uniform float uT, uRoadB, uSpeed, uBreath;
  out vec4 o;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  ${BEAM}
  // one sample of the land + its light at a point of the (larger) stored image
  vec3 shade(vec2 uv) {
    vec3 c = texture(uCol, uv).rgb; vec4 d = texture(uData, uv);
    // traces: on most lines a soft comet of light runs along the road; each line rests between runs (8-14 s cycle)
    float period = 8.0 + 6.0 * fract(d.a * 13.7);
    float win = fract(uT / period + d.a * 7.0);
    float lit = step(0.25, d.a) * smoothstep(0.0, 0.06, win) * smoothstep(0.62, 0.48, win);
    float x = fract(d.g - uT * uSpeed + d.a) - 0.5;
    float pulse = (x > 0.0 ? exp(-x * x / 0.0004) : exp(-x * x / 0.006)) * lit;   // bright head, long soft tail
    vec3 road = vec3(0.70, 0.80, 0.95) * d.r * (uRoadB * 0.6 + 2.6 * pulse) * 0.5;
    // nodes: each breathes on its own 2.5-4 s rhythm, never in sync
    float nh = hash(floor(uv * uRes / 10.0));
    float breathe = 0.12 + 0.88 * (0.5 + 0.5 * sin(uT * 6.2832 / (2.5 + 1.5 * nh) + nh * 6.2832));
    vec3 node = vec3(0.90, 0.95, 1.0) * d.b * breathe * 1.1;
    return c + road + node;
  }
  void main() {
    // four samples across this pixel's footprint, averaged: smooth edges, unbroken hairlines and traces
    vec2 uv = gl_FragCoord.xy / uRes, h = 0.42 / uRes;
    vec3 col = 0.25 * (shade(uv + vec2(-h.x, -h.y * 0.4)) + shade(uv + vec2(h.x * 0.4, -h.y))
                     + shade(uv + vec2(h.x, h.y * 0.4)) + shade(uv + vec2(-h.x * 0.4, h.y)));
    // the shaft breathes slowly (one breath ≈ 9 s); its pool on the ground and the falcon breathe with it
    float br = uBreath * (0.6 * beam(gl_FragCoord.xy, uRes) + pool(gl_FragCoord.xy, uRes));
    col *= 1.0 + 0.30 * br;
    col += (hash(gl_FragCoord.xy) - 0.5) * (1.0 / 255.0);   // grain, also kills banding
    o = vec4(col, 1.0);
  }`;

  // ── WebGL plumbing ─────────────────────────────────────────────────────────────────────────
  const S = { gl: null, land: null, light: null, fbo: null, tex: [], L: null, w: 0, h: 0, band: 0, raf: 0,
    last: 0, t0: 0, idleAt: 0, running: false, failed: false, canvas: null, stats: {} };

  // Compile + link; with the parallel-compile extension the check is deferred (finish() polls it),
  // so the page never freezes while the GPU driver compiles.
  function program(gl, vs, fs, deferred) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const p = gl.createProgram(), v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    const prog = { p, v, f, u: null };
    if (!deferred) finish(gl, prog);
    return prog;
  }
  function ready(gl, prog) { return prog.u || !S.par || gl.getProgramParameter(prog.p, S.par.COMPLETION_STATUS_KHR); }
  function finish(gl, prog) {
    if (prog.u) return;
    if (!gl.getProgramParameter(prog.p, gl.LINK_STATUS)) {
      throw new Error(gl.getShaderInfoLog(prog.f) || gl.getShaderInfoLog(prog.v) || gl.getProgramInfoLog(prog.p));
    }
    const u = {}; const n = gl.getProgramParameter(prog.p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(prog.p, i); u[a.name] = gl.getUniformLocation(prog.p, a.name); }
    prog.u = u;
  }

  function init(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('no webgl2');
    if (/[?&]still(?:[=&]|$)/.test(location.search)) throw new Error('forced still (?still)');   // to check the fallback
    S.gl = gl; S.canvas = canvas;
    S.par = gl.getExtension('KHR_parallel_shader_compile');   // compile off the main thread where supported
    S.land = program(gl, VS, LAND, !!S.par);
    S.light = program(gl, VS, LIGHT, !!S.par);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one big triangle
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('context lost'); });
  }

  function targets(w, h) {
    const gl = S.gl;
    S.tex.forEach(t => gl.deleteTexture(t)); if (S.fbo) gl.deleteFramebuffer(S.fbo);
    // the data image (lines, light position, nodes) is half-float where the GPU allows: the light's position
    // along a road needs more than 256 steps, or the moving traces come out beaded
    if (S.f16 === undefined) S.f16 = !!gl.getExtension('EXT_color_buffer_float');
    S.tex = [0, 1].map(i => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      if (i === 1 && S.f16) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    });
    S.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, S.tex[0], 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, S.tex[1], 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (S.f16 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {   // GPU refused half-float: plain bytes
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); S.f16 = false; return targets(w, h);
    }
    gl.clearBufferfv(gl.COLOR, 0, [0.04, 0.05, 0.07, 1]); gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // draw one band of the land into the stored images
  function landBand() {
    const gl = S.gl, { p, u } = S.land, L = S.L, k = S.tw / L.W;
    const bandH = Math.ceil(S.th / SETTINGS.bands), y0 = S.th - (S.band + 1) * bandH;   // top band first
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo);
    gl.viewport(0, 0, S.tw, S.th);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, Math.max(0, y0), S.tw, bandH + Math.min(0, y0));
    gl.useProgram(p);
    gl.uniform2f(u.uRes, S.tw, S.th);
    const M = landmarks(L);
    gl.uniform4fv(u.uPeak, M.peak); gl.uniform4fv(u.uShoulder, M.shoulder); gl.uniform4fv(u.uLeft, M.left); gl.uniform1f(u.uCx, L.cx * k); gl.uniform1f(u.uCy, L.cy * k); gl.uniform1f(u.uF, L.f * k);
    gl.uniform1f(u.uCamH, L.camH); gl.uniform1f(u.uDpr, k);
    gl.uniform1f(u.uDune, SETTINGS.duneHeight); gl.uniform1f(u.uValley, SETTINGS.valleyDepth); gl.uniform1f(u.uMount, SETTINGS.mountainHeight);
    gl.uniform1f(u.uFog, SETTINGS.fog); gl.uniform1f(u.uMist, SETTINGS.mist); gl.uniform1f(u.uExp, SETTINGS.exposure); gl.uniform1f(u.uRoad, SETTINGS.roadEvery); gl.uniform1f(u.uVeil, SETTINGS.veil); gl.uniform1f(u.uCrestRest, SETTINGS.crestRest);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    S.band++;
  }

  function lightPass(now) {
    const gl = S.gl, { p, u } = S.light;
    gl.viewport(0, 0, S.w, S.h);
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.tex[0]); gl.uniform1i(u.uCol, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S.tex[1]); gl.uniform1i(u.uData, 1);
    gl.uniform2f(u.uRes, S.w, S.h); gl.uniform1f(u.uT, (now - S.t0) / 1000);
    gl.uniform1f(u.uRoadB, SETTINGS.roadBrightness); gl.uniform1f(u.uSpeed, SETTINGS.pulseSpeed);
    // one slow breath of the shaft, shared by the ground (here) and the falcon (CSS var --beam)
    const b = 0.5 - 0.5 * Math.cos(2 * Math.PI * ((now - S.t0) / 1000) / SETTINGS.breathSec);
    gl.uniform1f(u.uBreath, b);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (Math.abs(b - (S.beamVar ?? -1)) > 0.01 || b === 0) {
      S.beamVar = b;
      const host = document.getElementById('signin'); if (host) host.style.setProperty('--beam', b.toFixed(3));
    }
  }

  const still = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frame(now) {
    S.raf = 0;
    if (!S.running) return;
    if (!ready(S.gl, S.land) || !ready(S.gl, S.light)) { S.raf = requestAnimationFrame(frame); return; }   // still compiling
    try { finish(S.gl, S.land); finish(S.gl, S.light); } catch (e) { fail(e.message || e); return; }
    if (S.band < SETTINGS.bands) {                           // still drawing the land: one band per frame
      const t = performance.now(); landBand(); S.stats.bandMs = Math.max(S.stats.bandMs || 0, performance.now() - t);
      if (S.band === SETTINGS.bands) { S.stats.landMs = performance.now() - S.stats.startedAt; lightPass(now); remember(); S.canvas.classList.add('ready'); performance.mark && performance.mark('saker:live'); }
    } else {
      if (still()) { lightPass(S.t0); S.running = false; return; }          // one calm frame, then rest
      if (now - S.idleAt > SETTINGS.idleMs) { S.running = false; return; }   // idle: stop; input resumes
      if (now - S.last < 1000 / SETTINGS.fps - 1) { S.raf = requestAnimationFrame(frame); return; }
      S.last = now;
      lightPass(now);
    }
    S.raf = requestAnimationFrame(frame);
  }

  function wake() {
    S.idleAt = performance.now();
    if (!S.running && S.gl && !S.failed && !document.hidden && S.canvas && S.canvas.isConnected && S.band >= SETTINGS.bands && !still()
        && !document.getElementById('signin').hidden) {
      S.running = true; S.raf = requestAnimationFrame(frame);
    }
  }
  ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, wake, { passive: true }));

  // What shows while the GPU prepares — the pro recipe for a live hero (poster → live, never a blank or a swap):
  //   0. first paint: a tiny blurred placeholder of the scene, inlined in index.html (CSS var --si-lqip);
  //   1. this device's own last finished frame, if remembered (exact size → identical picture);
  //   2. otherwise the shipped POSTER for this screen shape: the same scene's first frame, pre-rendered by
  //      _guide/make-posters.html, preloaded with high priority by index.html, aligned on the horizon;
  //   3. the live land fades in over it.
  // LOOK keys both: change the look → bump LOOK and re-render the posters (else the posters are skipped).
  const LOOK = 'look-26';
  const QA = /[?&]qa(?:[=&]|$)/.test(location.search);        // poster rendering: no remembering, fixed DPR
  const frameKey = (W, H) => `saker-frame:${LOOK}:${W}x${H}`;
  function store() { try { return root.localStorage; } catch (e) { return null; } }
  // The land on screen scales with the screen's WIDTH around the horizon (focal = k·W), so a poster scaled to
  // the screen's width and pinned on its horizon IS the live land. Pick the widest poster that is not wider
  // than the screen (it is then tall enough to cover); same rule as the <head> script in index.html.
  function pickPoster(W, H) {
    const P = root.SAKER_POSTERS; if (!P || P.look !== LOOK || QA) return null;
    const a = W / H, fam = P.list.filter(p => (p.a < 0.8) === (a < 0.8)).sort((x, y) => x.a - y.a);
    let best = fam[0] || null;
    for (const p of fam) if (p.a <= a * 1.002) best = p;
    return best;
  }
  function placePoster(img, p, L) {
    let h = L.W / p.a, top = L.cy - p.h * h;
    if (top > 0 || top + h < L.H) h = Math.max(L.cy / p.h, (L.H - L.cy) / (1 - p.h), h);   // rare gap: cover instead
    const w = h * p.a; top = L.cy - p.h * h;
    Object.assign(img.style, { inset: 'auto', width: w + 'px', height: h + 'px', left: (L.W - w) / 2 + 'px', top: top + 'px', objectFit: 'fill' });
  }
  function underlay(cv, L) {
    const host = cv && cv.parentNode, ls = store(), W = L.W, H = L.H;
    let src = null;
    try { src = !QA && ls && ls.getItem(frameKey(W, H)); } catch (e) { src = null; }
    const poster = src ? null : pickPoster(W, H);
    const want = src || (poster && (root.SAKER_POSTERS.dir + poster.f));
    if (host) host.querySelectorAll('img.si-still').forEach(i => { if (i.getAttribute('src') !== want) i.remove(); });
    let img = host && host.querySelector('img.si-still');
    if (host && want && !img) {
      img = document.createElement('img');
      img.className = 'si-still'; img.alt = ''; img.decoding = src ? 'sync' : 'async';
      if (poster) { img.fetchPriority = 'high'; img.style.opacity = '0'; img.onload = () => { img.style.opacity = '1'; performance.mark && performance.mark('saker:poster'); }; }
      img.src = want;
      host.insertBefore(img, host.firstChild);
      if (poster && img.complete) img.style.opacity = '1';
      performance.mark && performance.mark('saker:still');
    }
    if (img && poster) placePoster(img, poster, L);
    if (host) { host.classList.toggle('has-still', !!src); host.classList.toggle('has-poster', !!poster); }
  }
  // keep the frame just drawn (call right after drawing, same task: the buffer is still readable)
  function remember() {
    const ls = store(), L = S.L; if (QA || !ls || !L || !S.canvas.toBlob) return;
    S.canvas.toBlob(b => {
      if (!b) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          for (let i = ls.length - 1; i >= 0; i--) { const k = ls.key(i); if (k && k.startsWith('saker-frame:')) ls.removeItem(k); }
          ls.setItem(frameKey(L.W, L.H), r.result);
        } catch (e) { /* storage full or blocked: just skip */ }
      };
      r.readAsDataURL(b);
    }, 'image/webp', 0.9);
  }
  // still picture instead, if the GPU path is unavailable or breaks
  function fail(why) {
    S.failed = true; S.running = false; cancelAnimationFrame(S.raf);
    S.stats.fallback = String(why);
    const cv = S.canvas || document.getElementById('si-terrain');
    const host = cv ? cv.parentNode : document.querySelector('.si-ground');
    if (host && !host.querySelector('img.si-still')) {
      const img = document.createElement('img');
      img.className = 'si-still'; img.alt = ''; img.src = SETTINGS.fallback;
      host.insertBefore(img, host.firstChild);
    }
    if (cv) cv.style.visibility = 'hidden';
  }

  root.SakerTerrain = {
    SETTINGS,
    // reused by the Boss view (Look v2, 2026-11-17): the SAME poster at the SAME place as the sign-in, so the app
    // continues the landscape. Pure functions — reading them changes nothing in how the land looks.
    layout: (W, H) => compose(W, H),
    pickPoster,
    // Lay out for the current size and start drawing; returns the layout for logo/dome/fields.
    start(ground, live) {
      this.stop();
      const W = ground.clientWidth, H = ground.clientHeight;
      if (!W || !H) return null;
      const L = S.L = compose(W, H);
      if (live) live.style.display = 'none';                 // the light now lives in the GPU pass
      if (S.failed) return L;
      try {
        underlay(ground, L);
        if (!S.gl) init(ground);
        ground.classList.remove('ready');
        const qd = QA && +(/[?&]dpr=([\d.]+)/.exec(location.search) || [])[1];   // poster rendering only
        const dpr = Math.min(qd || root.devicePixelRatio || 1, 2);
        const k = Math.min(dpr, Math.sqrt(SETTINGS.maxPixels / (W * H)));
        S.w = Math.round(W * k); S.h = Math.round(H * k);
        ground.width = S.w; ground.height = S.h;
        const touch = root.matchMedia && root.matchMedia('(pointer: coarse)').matches;
        const cap = touch ? SETTINGS.maxLandPixelsTouch : SETTINGS.maxLandPixels;
        const ss = Math.min(SETTINGS.supersample, Math.sqrt(cap / (S.w * S.h)));
        S.tw = Math.round(S.w * Math.max(1, ss)); S.th = Math.round(S.h * Math.max(1, ss));
        targets(S.tw, S.th);
        S.band = 0; S.t0 = performance.now(); S.idleAt = S.t0; S.stats = { startedAt: S.t0, px: [S.w, S.h] };
        S.running = true; S.raf = requestAnimationFrame(frame);
      } catch (e) { fail(e.message || e); }
      return L;
    },
    stop() { S.running = false; cancelAnimationFrame(S.raf); S.raf = 0; },
    // back from a hidden tab: carry on where we were (no redraw of the land unless the size changed)
    resume(ground) {
      if (!S.gl || S.failed || !S.L) return false;
      if (ground && (ground.clientWidth !== S.L.W || ground.clientHeight !== S.L.H)) return false;
      S.idleAt = performance.now();
      if (!S.running) { S.running = true; S.raf = requestAnimationFrame(frame); }
      return true;
    },
    // QA: finish the land now and show one frame (works even while the tab is hidden)
    // atStart: the light as it is on the very first live frame (what a poster must show)
    renderNow(atStart) { const b = this.benchmark(); if (b) { lightPass(atStart ? S.t0 : performance.now()); remember(); S.canvas.classList.add('ready'); } return b; },
    LOOK,
    // QA: redraw the whole land synchronously and return the real GPU time in ms
    benchmark() {
      if (!S.gl || S.failed) return null;
      finish(S.gl, S.land); finish(S.gl, S.light);
      const keep = S.band; S.band = 0; S.gl.finish();
      const t = performance.now();
      while (S.band < SETTINGS.bands) landBand();
      const gl = S.gl, px = new Uint8Array(4);                  // reading a pixel back forces the GPU to finish
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo); gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const ms = performance.now() - t; S.band = Math.max(keep, SETTINGS.bands);
      return { ms: Math.round(ms), px: [S.w, S.h], land: [S.tw, S.th], perBandMs: Math.round(ms / SETTINGS.bands) };
    },
    // QA: real GPU time of one animated frame (the light pass), averaged over n frames
    lightBench(n = 20) {
      if (!S.gl || S.failed || S.band < SETTINGS.bands) return null;
      const gl = S.gl, px = new Uint8Array(4); gl.finish();
      const t = performance.now();
      for (let i = 0; i < n; i++) { lightPass(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      return +((performance.now() - t) / n).toFixed(1);
    },
    debug: () => ({ layout: S.L, running: S.running, band: S.band, failed: S.failed, stats: S.stats,
      memoryMB: S.w ? Math.round((S.w * S.h * 4 + S.tw * S.th * (S.f16 ? 12 : 8)) / 1048576) : 0, land: [S.tw, S.th], f16: S.f16 }),
  };
})(window);
