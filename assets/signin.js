// صقر sign-in — UI only for now (phase ⑤ wires it to Supabase Auth + a second step).
// Ibrahim, 2026-11-08: the logo and two rounded fields, nothing else. Enter (or the arrow inside the
// last field) moves on; a wrong or empty field only changes its own border.
// The ground is a real 3D terrain drawn at the screen's resolution (assets/terrain.js).
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const st = { step: 'creds', email: '', T: null, done: null };
  const arrow = dir => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${dir === 'rtl' ? 'M13 8H3M7 4L3 8l4 4' : 'M3 8h10M9 4l4 4-4 4'}"/></svg>`;

  function draw() {
    const S = st.T.si, f = $('#si-form');
    f.classList.remove('busy');      // a fresh screen always starts clean: a check that SUCCEEDED never removed it, so after
                                     // signing out the form came back dimmed and refusing clicks (Ibrahim, 2026-11-18)
    if (st.step === 'creds') {
      f.innerHTML = `
        <input class="si-input" type="email" name="email" dir="ltr" autocomplete="username" inputmode="email"
               placeholder="${esc(S.email)}" aria-label="${esc(S.email)}" value="${esc(st.email)}">
        <span class="si-wrap">
          <input class="si-input" type="password" name="password" dir="ltr" autocomplete="current-password"
                 placeholder="${esc(S.password)}" aria-label="${esc(S.password)}">
          <button type="submit" class="si-go" aria-label="${esc(S.submit)}">${arrow(st.T.dir)}</button>
        </span>`;
      setTimeout(() => f.querySelector(st.email ? '[name=password]' : '[name=email]').focus(), 60);
    } else {
      // first sign-in on the database (B6): link an authenticator app — scan the QR (or type the key), then its code
      const link = st.step === 'enroll' && st.mfa ? `
        <div class="si-enroll">
          <p class="si-enroll-title">${esc(S.enrollTitle)}</p>
          <img class="si-qr" src="${esc(st.mfa.qr)}" alt="${esc(S.enrollTitle)}">
          <p class="si-enroll-sub">${esc(S.enrollSub)}</p>
          <p class="si-secret"><span>${esc(S.secretLabel)}</span> <code dir="ltr">${esc(st.mfa.secret)}</code></p>
        </div>` : '';
      f.innerHTML = `${link}
        <span class="si-wrap">
          <input class="si-input si-code" name="code" dir="ltr" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" placeholder="${esc(S.codeTitle)}" aria-label="${esc(S.codeSub)}">
          <button type="submit" class="si-go" aria-label="${esc(S.verify)}">${arrow(st.T.dir)}</button>
        </span>`;
      setTimeout(() => f.code.focus(), 60);
    }
    f.classList.remove('step-in'); void f.offsetWidth; f.classList.add('step-in');
  }

  const flag = (input, bad) => { input.classList.toggle('bad', bad); if (bad) input.focus(); return bad; };

  function submit(e) {
    e.preventDefault();
    const f = $('#si-form');
    if (st.leaving) return;                                         // the code is accepted: a late Enter does nothing
    if (st.step === 'creds') {
      const badE = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim());
      const badP = !f.password.value;
      flag(f.password, badP); if (flag(f.email, badE) || badP) return;
      st.email = f.email.value.trim();
      if (root.SakerSignin.verify) {                          // the database (B5): a real account, checked now
        const pw = f.password.value; f.classList.add('busy');
        root.SakerSignin.verify(st.email, pw).then(r => {
          if (r && r.need) { st.mfa = r; st.step = r.need === 'enroll' ? 'enroll' : 'code'; f.classList.remove('busy'); draw(); return; }
          st.leaving = true; st.done(st.email); },
          () => { f.classList.remove('busy'); flag(f.password, true); f.password.value = ''; });
        return;
      }
      st.step = 'code'; draw();
    } else {
      if (flag(f.code, !/^\d{6}$/.test(f.code.value))) return;
      if (st.mfa && root.SakerSignin.verifyCode) {              // the database: the code is checked for real
        const code = f.code.value; f.classList.add('busy');
        root.SakerSignin.verifyCode(st.mfa.factorId, code).then(() => { st.step = 'creds'; st.mfa = null; st.leaving = true; st.done(st.email); },
          () => { f.classList.remove('busy'); flag(f.code, true); f.code.value = ''; });
        return;
      }
      st.step = 'creds'; st.leaving = true;
      st.done(st.email);
    }
  }

  function wire() {
    const f = $('#si-form');
    f.addEventListener('submit', submit);
    f.addEventListener('input', e => {
      e.target.classList.remove('bad');
      if (e.target.name === 'code') {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
        if (e.target.value.length === 6) f.requestSubmit();       // typed, pasted or autofilled
      }
    });
    f.addEventListener('keydown', e => { if (e.key === 'Escape' && st.step === 'code') { st.step = 'creds'; draw(); } });
    addEventListener('resize', () => { clearTimeout(wire.t); wire.t = setTimeout(() => { if (!$('#signin').hidden) startScene(); }, 150); });
  }

  // ── the ground: a 3D terrain (assets/terrain.js). Its layout also places the logo, the dome
  // and the fields, so the composition follows the horizon on every screen size.
  function startScene() {
    const L = root.SakerTerrain && root.SakerTerrain.start($('#si-terrain'), $('#si-live'));
    if (!L) return;
    const host = $('#signin');
    const px = v => Math.round(v) + 'px';
    host.style.setProperty('--logo-w', px(L.logoW));
    host.style.setProperty('--logo-top', px(L.logoY - L.logoH / 2));
    host.style.setProperty('--form-top', px(L.formY));
    host.style.setProperty('--fog-top', px(L.cy - 0.10 * L.H));
    placeDome(L);
    host.classList.add('placed');                 // logo, fields and dome may show now (they are in place)
  }
  const stopScene = () => root.SakerTerrain && root.SakerTerrain.stop();

  // The dome: a circle centred on the horizon, rising just above the logo; it fades as it meets
  // the hills. Ticks: one at the top, one crossing each side.
  function placeDome(L) {
    const { cx, cy, R, W } = L;
    const arc = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
    $('#si-dome-arc').setAttribute('d', arc);
    $('#si-dome-sweep').setAttribute('d', arc);
    const ty = cy - 0.18 * R, tx = R * Math.sqrt(1 - 0.18 * 0.18);
    $('#si-dome-ticks').setAttribute('d', `M ${cx} ${cy - R - 14} v 26 M ${cx - tx - 16} ${ty} h 32 M ${cx + tx - 16} ${ty} h 32`);
    const g = $('#si-dome-fade'), m = $('#si-dome-maskrect');
    g.setAttribute('y1', cy - 0.42 * R); g.setAttribute('y2', cy + 2);
    m.setAttribute('x', 0); m.setAttribute('y', 0); m.setAttribute('width', W); m.setAttribute('height', cy + 4);
  }
  document.addEventListener('visibilitychange', () => {
    if (!$('#signin') || $('#signin').hidden) return;
    if (document.hidden) stopScene();
    else if (!(root.SakerTerrain && root.SakerTerrain.resume($('#si-terrain')))) startScene();   // resume; redraw only if the size changed
  });

  let wired = false;
  root.SakerSignin = {
    // T = the language pack; done(email) runs after the second step
    show(T, done) {
      st.T = T; st.done = done; st.leaving = false; st.mfa = null;
      if (st.step !== 'creds') st.step = 'creds';          // signing out always returns to email + password
      if (!wired) { wire(); wired = true; }
      $('#signin').hidden = false;
      document.body.classList.add('signing');
      draw();
      startScene();                       // same task: the remembered frame and the layout land in the first paint
    },
    hide() {
      stopScene(); $('#signin').hidden = true; document.body.classList.remove('signing');
      document.documentElement.classList.remove('boot-signin');
    },
  };
})(window);
