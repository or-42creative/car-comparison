(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(n));
  const carById = id => CARS.find(c => c.id === id);

  // ---------- state ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const defaults = Object.fromEntries(CARS.map(c => [c.id, c.versions[0]]));
  const sel = Object.assign({}, defaults, store.get('carSel', {}));
  for (const c of CARS) if (!c.versions.includes(sel[c.id])) sel[c.id] = c.versions[0];
  const selected = () => CARS.map(c => ({ car: c, ver: VERSIONS[sel[c.id]] }));

  // ---------- theme ----------
  const savedTheme = store.get('theme', null);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
  });

  const cell = (ver, k) => (k === 'type' ? { t: ver.type } : ver.s[k] || { t: '—' });
  const display = (c, unit) => c.t != null ? c.t : (c.v != null ? fmt(c.v) + (unit ? ' ' + unit : '') : '—');

  function bestIndex(cells, better) {
    if (!better) return -1;
    const vals = cells.map(c => (typeof c.v === 'number' ? c.v : null));
    const nums = vals.filter(v => v != null);
    if (nums.length < 2) return -1;
    const target = better === 'high' ? Math.max(...nums) : Math.min(...nums);
    if (nums.every(v => v === target)) return -1;
    return vals.map((v, i) => (v === target ? i : -1)).filter(i => i >= 0);
  }

  const safetyRange = id => {
    const sc = SAFETY_COLS.filter(x => x.car === id).map(x => x.score);
    const lo = Math.min(...sc), hi = Math.max(...sc);
    return lo === hi ? String(lo) : `${lo}–${hi}`;
  };

  // ---------- car cards ----------
  function renderCars() {
    $('#cars').innerHTML = CARS.map(c => {
      const v = VERSIONS[sel[c.id]];
      const chips = c.versions.length > 1
        ? c.versions.map(id => `<button class="chip" data-car="${c.id}" data-ver="${id}" aria-pressed="${id === sel[c.id]}">${esc(VERSIONS[id].short)}</button>`).join('')
        : `<span class="chip static">${esc(v.short)}</span>`;
      const k = v.s;
      const range = k.totalRange.v ? fmt(k.totalRange.v) + ' ק"מ' : (k.evRange.v ? fmt(k.evRange.v) + ' ק"מ חשמלי' : '—');
      const rangeLbl = k.evRange.v && k.totalRange.v && k.totalRange.v !== k.evRange.v ? `טווח כולל (${k.evRange.v} חשמלי)` : (k.evRange.v ? 'טווח חשמלי' : 'צריכת דלק');
      const rangeVal = k.evRange.v ? range : `${k.fuel.v} ל'/100 ק"מ`;
      return `<article class="car" style="--cc:${c.color}">
        <div class="ph"><img src="${c.img}" alt="${esc(c.brand + ' ' + c.model)}" loading="eager"></div>
        <div class="body">
          <div class="brandname">${esc(c.brand)}</div>
          <h2 dir="ltr" style="text-align:right">${esc(c.model)}</h2>
          <div class="he">${esc(c.he)}</div>
          <div class="tag">${esc(c.tagline)}</div>
          <div class="vlabel">גרסה:</div>
          <div class="chips">${chips}</div>
          <div class="kpis">
            <div class="kpi"><b>${fmt(k.hp.v)}</b><span>כוח סוס</span></div>
            <div class="kpi"><b>${esc(rangeVal)}</b><span>${esc(rangeLbl)}</span></div>
            <div class="kpi"><b>${fmt(k.trunk.v)} ל'</b><span>תא מטען</span></div>
            <div class="kpi"><b>${esc(safetyRange(c.id))} / 8</b><span>רמת בטיחות</span></div>
          </div>
        </div>
      </article>`;
    }).join('');
  }
  $('#cars').addEventListener('click', e => {
    const b = e.target.closest('.chip[data-ver]');
    if (!b) return;
    sel[b.dataset.car] = b.dataset.ver;
    store.set('carSel', sel);
    renderAll();
  });

  // ---------- quick bars ----------
  function renderBars() {
    const s = selected();
    $('#bars').innerHTML = QUICK_BARS.map(b => {
      const cells = s.map(x => cell(x.ver, b.k));
      const nums = cells.map(c => (typeof c.v === 'number' ? c.v : null));
      const valid = nums.filter(n => n != null);
      const max = b.max || Math.max(...valid) * 1.04;
      const min = b.min || 0;
      const best = bestIndex(cells, b.better);
      const rows = s.map((x, i) => {
        const n = nums[i];
        const short = x.car.short;
        if (n == null) return `<div class="bar-row" style="--cc:${x.car.color}"><div class="n">${esc(short)}</div><div class="track"><span class="na">לא רלוונטי / לא צוין</span></div></div>`;
        let pct = ((n - min) / (max - min)) * 100;
        if (b.better === 'low') pct = (Math.min(...valid) / n) * 100; // פחות = פס ארוך יותר
        pct = Math.max(14, Math.min(100, pct));
        const isBest = Array.isArray(best) && best.includes(i);
        return `<div class="bar-row" style="--cc:${x.car.color}"><div class="n">${esc(short)}</div>
          <div class="track"><div class="fill" style="width:${pct}%"><em>${fmt(n)} ${esc(b.unit)}${isBest ? ' ★' : ''}</em></div></div></div>`;
      }).join('');
      const note = b.better === 'low' ? 'פחות = טוב יותר' : b.better === 'high' ? 'יותר = טוב יותר' : '';
      return `<div class="card bar-card"><h3>${esc(b.label)} <small>${note}</small></h3>${rows}</div>`;
    }).join('');
  }

  // ---------- spec table ----------
  function headHTML(s) {
    return `<div class="chead"><div></div>${s.map(x => `<div class="cn" style="--cc:${x.car.color}">${esc(x.car.short)}<small>${esc(x.ver.short)}</small></div>`).join('')}</div>`;
  }
  function renderSpecs() {
    const s = selected();
    let html = headHTML(s);
    for (const g of SPEC_GROUPS) {
      let rows = '', allSame = true;
      for (const r of g.rows) {
        const cells = s.map(x => cell(x.ver, r.k));
        const texts = cells.map(c => display(c, r.unit));
        const same = texts.every(t => t === texts[0]);
        if (!same) allSame = false;
        const best = bestIndex(cells, r.better);
        rows += `<div class="crow${same ? ' same' : ''}"><div class="lbl">${esc(r.label)}${r.unit ? ` <span style="color:var(--faint);font-weight:400">(${esc(r.unit)})</span>` : ''}</div>${
          cells.map((c, i) => {
            const t = c.t != null ? c.t : (c.v != null ? fmt(c.v) : '—');
            const dim = /^(—|לא צוין)/.test(t);
            const cls = Array.isArray(best) && best.includes(i) ? ' best' : dim ? ' dim' : '';
            return `<div class="val${cls}">${esc(t)}</div>`;
          }).join('')}</div>`;
      }
      html += `<div class="cgroup${allSame ? ' empty' : ''}">${esc(g.name)}</div>${rows}`;
    }
    $('#specTable').innerHTML = html;
  }
  const diff = $('#diffOnly');
  diff.checked = store.get('diffOnly', false);
  const applyDiff = () => { $('#specTable').classList.toggle('hide-same', diff.checked); store.set('diffOnly', diff.checked); };
  diff.addEventListener('change', applyDiff);

  // ---------- features ----------
  function renderFeatures() {
    const head = `<div class="chead"><div></div>${CARS.map(c => `<div class="cn" style="--cc:${c.color}">${esc(c.short)}<small>${esc(c.brand)}</small></div>`).join('')}</div>`;
    const rows = FEATURES.map(f => `<div class="crow"><div class="lbl">${esc(f.label)}</div>${
      CARS.map(c => { const [st, t] = f[c.id]; return `<div class="val"><span class="pill s-${st}"><i class="dot"></i>${esc(t)}</span></div>`; }).join('')
    }</div>`).join('');
    $('#featTable').innerHTML = head + rows;
  }

  // ---------- safety ----------
  const scaleColors = ['#8e1b1b', '#e2531f', '#f2b705', '#16a36b', '#2c8a8f', '#2f7fc4', '#3a6fbf', '#4a5aa8', '#4b3f8f'];
  function renderSafety() {
    $('#scores').innerHTML = CARS.map(c => {
      const cols = SAFETY_COLS.filter(x => x.car === c.id);
      const lines = cols.map(col => `<div class="trimline"><span>${esc(col.label)}</span><span>${col.score} / 8</span></div>
        <div class="scale">${scaleColors.map((clr, i) => `<i class="${i === col.score ? 'on' : ''}" style="${i === col.score ? `background:${clr}` : ''}">${i}</i>`).join('')}</div>`).join('');
      return `<div class="card score" style="--cc:${c.color}"><h3>${esc(c.brand + ' ' + c.model)}</h3>${lines}</div>`;
    }).join('');
    const th = SAFETY_COLS.map(col => { const c = carById(col.car); return `<th style="--cc:${c.color}"><span class="cb">${esc(c.id === 'junior' ? 'JUNIOR' : c.id === 'j7' ? 'JAECOO 7' : 'B10')}</span>${esc(col.label)}</th>`; }).join('');
    const tr = SAFETY_ROWS.map(([label, vals]) => `<tr><td>${esc(label)}</td>${vals.map(v =>
      typeof v === 'string' ? `<td><b>${esc(v)}</b></td>` : v ? '<td class="y">✓</td>' : '<td class="n">✕</td>').join('')}</tr>`).join('');
    $('#safetyTable').innerHTML = `<table><thead><tr><th>מערכת</th>${th}</tr></thead><tbody>${tr}</tbody></table>`;
  }

  // ---------- trims ----------
  let trimCar = store.get('trimCar', 'junior');
  function renderTrims() {
    $('#trimTabs').innerHTML = CARS.map(c => `<button class="tab" role="tab" style="--cc:${c.color}" data-car="${c.id}" aria-selected="${c.id === trimCar}"><i class="sw"></i>${esc(c.brand + ' ' + c.model)}</button>`).join('');
    const c = carById(trimCar), d = TRIMS[trimCar];
    const head = `<thead><tr><th></th>${d.trims.map(t => `<th>${esc(t)}</th>`).join('')}</tr></thead>`;
    const body = d.groups.map(g => `<tr class="g"><td colspan="${d.trims.length + 1}">${esc(g.name)}</td></tr>` + g.rows.map(([label, vals]) =>
      `<tr><td>${esc(label)}</td>${vals.map(v => typeof v === 'string' ? `<td class="t">${esc(v)}</td>` : v ? '<td class="y">✓</td>' : '<td class="n">—</td>').join('')}</tr>`).join('')).join('');
    const colors = d.colors ? `<div class="colors"><b style="font-size:14px;align-self:center">צבעים:</b>${d.colors.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : '';
    $('#trimPanel').style.setProperty('--cc', c.color);
    $('#trimPanel').innerHTML = `<div class="trim-note"><b>${esc(c.he)}:</b> ${esc(d.note)}</div>${colors}<table class="ttable">${head}<tbody>${body}</tbody></table>`;
  }
  $('#trimTabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    trimCar = b.dataset.car; store.set('trimCar', trimCar); renderTrims();
  });

  // ---------- reviews ----------
  function renderReviews() {
    const R = window.REVIEWS;
    if (!R) { $('#reviewsBox').innerHTML = '<div class="card pending">הביקורות יתווספו בקרוב.</div>'; return; }
    const link = (name, url) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
    $('#reviewsBox').innerHTML = `<div class="rev-grid">${CARS.map(c => {
      const r = R[c.id]; if (!r) return '';
      const badges = (r.badges || []).map(b => `<span class="badge${b.ncap ? ' ncap' : ''}">${esc(b.t)}</span>`).join('');
      const pro = (r.pro || []).map(p => `<div class="quote">${esc(p.t)}<cite>${link(p.src, p.url)}</cite></div>`).join('');
      const users = (r.users || []).map(p => `<div class="quote">${esc(p.t)}<cite>${link(p.src, p.url)}</cite></div>`).join('');
      const issues = (r.issues || []).length ? `<h4>⚠️ שווה לדעת</h4><ul>${r.issues.map(i => `<li>${esc(i.t)}${i.url ? ` <span class="src">(${link(i.src || 'מקור', i.url)})</span>` : ''}</li>`).join('')}</ul>` : '';
      return `<article class="card rev" style="--cc:${c.color}">
        <h3>${esc(c.brand + ' ' + c.model)}</h3>
        <div class="meta">${badges}</div>
        ${r.praise ? `<h4>👍 מה אוהבים</h4><p>${esc(r.praise)}</p>` : ''}
        ${r.complaints ? `<h4>👎 על מה מתלוננים</h4><p>${esc(r.complaints)}</p>` : ''}
        ${pro ? `<h4>📰 עיתונאי רכב</h4>${pro}` : ''}
        ${users ? `<h4>💬 גולשים ובעלי רכב</h4>${users}` : ''}
        ${issues}
      </article>`;
    }).join('')}</div>${R.note ? `<p class="src" style="margin-top:12px">${esc(R.note)}</p>` : ''}`;
  }

  // ---------- summary ----------
  function renderSummary() {
    $('#summaryGrid').innerHTML = CARS.map(c => {
      const s = SUMMARY[c.id];
      return `<div class="card sum" style="--cc:${c.color}"><h3>${esc(c.brand + ' ' + c.model)}</h3>
        <h4>👍 יתרונות</h4><ul class="pros">${s.pros.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        <h4>👎 חסרונות</h4><ul class="cons">${s.cons.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
    }).join('');
  }

  // ---------- nav highlight ----------
  const links = [...document.querySelectorAll('#navLinks a')];
  const io = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) {
      links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id));
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section').forEach(s => io.observe(s));

  function renderAll() { renderCars(); renderBars(); renderSpecs(); applyDiff(); }
  renderAll(); renderFeatures(); renderSafety(); renderTrims(); renderReviews(); renderSummary();
})();
