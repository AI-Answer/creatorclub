/* Core: helpers, icons, store, shared components. */
(function () {
  const { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext, Fragment } = React;
  const html = htm.bind(React.createElement);
  const D = window.CC_DATA;
  const C = window.CC_CONTENT;

  // ---------- formatting ----------
  const fmtNum = (n) => {
    if (n == null || isNaN(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  };
  const fmtMult = (m) => (m >= 10 ? Math.round(m) : m.toFixed(2)) + '×';
  const band = (m) => (m < 1 ? 'b-grey' : m < 3 ? 'b-blue' : m < 5 ? 'b-green' : m < 10 ? 'b-amber' : m < 50 ? 'b-orange' : 'b-red');
  const fmtDays = (d) => (d < 1 ? Math.max(1, Math.round(d * 24)) + 'h ago' : Math.round(d) === 1 ? '1 day ago' : Math.round(d) + ' days ago');
  const fmtHours = (h) => (h < 1 ? Math.round(h * 60) + 'm' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd');
  const fmtClock = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
  const fmtMS = (s) => { s = Math.round(s); const m = Math.floor(s / 60), r = s % 60; return m ? (r ? `${m}m ${r}s` : `${m}m`) : `${r}s`; };
  const parseClock = (t) => { const m = String(t).trim().match(/^(\d+):(\d{1,2})$/); if (m) return +m[1] * 60 + +m[2]; const n = parseFloat(t); return isNaN(n) ? null : Math.round(n * 60); };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')); return MONTHS[d.getMonth()] + ' ' + d.getDate(); };
  const TODAY = '2026-10-29';
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  const AV_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#4f46e5', '#b45309', '#be123c', '#0f766e', '#57534e'];
  const initials = (name) => { const w = String(name || '?').replace(/^r\//, '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : (w[0] || '')[1] || '')).toUpperCase(); };
  const GRADS = [['#1e3a8a', '#3b82f6'], ['#7c2d12', '#f97316'], ['#14532d', '#22c55e'], ['#4c1d95', '#a78bfa'], ['#831843', '#ec4899'], ['#111827', '#4b5563'], ['#713f12', '#eab308'], ['#164e63', '#06b6d4']];
  const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  const sentence = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const cleanTitle = (t) => String(t || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

  // ---------- icons (lucide UMD) ----------
  const ALIAS = { SquareKanban: ['SquareKanban', 'KanbanSquare', 'Kanban'], House: ['House', 'Home'], CircleHelp: ['CircleHelp', 'HelpCircle'], ChartColumn: ['ChartColumn', 'BarChart3'], Captions: ['Captions', 'Subtitles'], CircleCheck: ['CircleCheck', 'CheckCircle2'], Grid: ['LayoutGrid'] };
  function Icon({ name, size = 16, stroke = 1.8, className = '', style }) {
    const L = window.lucide && window.lucide.icons;
    let node = null;
    if (L) for (const n of ALIAS[name] || [name]) { if (L[n]) { node = L[n]; break; } }
    let kids = node ? (typeof node[0] === 'string' ? node[2] : node) : [];
    return React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', className: 'icon ' + className, style, 'aria-hidden': true },
      (kids || []).map((k, i) => React.createElement(k[0], Object.assign({ key: i }, k[1]))));
  }

  // ---------- data model ----------
  const jobsById = Object.fromEntries(D.jobs.map((j) => [j.id, j]));
  const jobByVideo = Object.fromEntries(D.jobs.map((j) => [j.video.videoId, j]));
  const trendById = Object.fromEntries(D.trending.map((t) => [t.videoId, t]));

  function multFor(t) {
    if (!t) return null;
    if (t.mult) return t.mult;
    return null;
  }

  function buildVideo(raw) {
    const pack = C.PACK[raw.id] || { titles: [raw.title, '', ''], thumb: '' };
    const det = C.DETAIL[raw.id] || {};
    const titles = pack.titles.map(cleanTitle);
    while (titles.length < 3) titles.push('');
    return Object.assign({}, raw, {
      titles, chosen: det.chosen || 0, thumbText: pack.thumb, ideaHook: typeof raw.hook === 'string' ? raw.hook : (raw.ideaHook || ''),
      hook: det.hook || { visual: '', spoken: raw.hook || '', onscreen: '' },
      angle: raw.angle || det.angle || '', twist: raw.twist || det.twist || '',
      demand: raw.demand || { level: 'mid', note: '' }, gap: raw.gap || { level: 'mid', note: '' }, show: raw.show || { level: 'mid', note: '' },
      scenes: (det.scenes || []).map((s, i) => Object.assign({ id: raw.id + '-s' + i }, s, { takes: s.takes.slice() })),
      target: det.target || 600,
      plannedDate: det.plannedDate || (raw.id === 'hidden-features' ? '2026-11-05' : null),
      board: null, edit: { removed: raw.stage === 'publishing' }, publish: { exported: false, copied: {}, link: '', views: 0 },
      sources: raw.sources || [],
    });
  }
  function buildPublished(o, i) {
    return buildVideo({ id: 'yt-' + o.videoId, title: o.title, stage: 'published', order: 100 + i, thumbId: o.videoId, own: true, views: o.views, publishedAt: o.published, stageDates: { published: o.published }, why: '', sources: [], demand: null, gap: null, show: null });
  }
  function initialChannels() {
    const vids = D.videos.map(buildVideo).concat(D.own.map(buildPublished));
    return {
      samin: { id: 'samin', person: D.profile.name, name: D.profile.name, handle: '@SaminYasar_', url: D.profile.channelUrl, topics: D.profile.topics, about: D.profile.about, videos: vids, color: '#d9480f' },
    };
  }

  const STAGES = [
    { id: 'ideas', label: 'Ideas' }, { id: 'planning', label: 'Planning' }, { id: 'recording', label: 'Recording' },
    { id: 'editing', label: 'Editing' }, { id: 'publishing', label: 'Publishing' }, { id: 'published', label: 'Published' },
  ];
  const stageLabel = (id) => (STAGES.find((s) => s.id === id) || {}).label || id;

  function sceneStatus(s, v) {
    const kept = s.takes.find((t) => t.kept);
    if (v && v.edit && v.edit.removed && s.cut && kept) return { k: 'cut', label: `Cut ${s.cut}s` };
    if (kept) return { k: 'kept', label: `Kept take ${kept.n}` };
    if (s.takes.length) return { k: 'takes', label: `${s.takes.length} take${s.takes.length > 1 ? 's' : ''}` };
    return { k: 'none', label: 'Not recorded' };
  }
  const recordedCount = (v) => v.scenes.filter((s) => s.takes.some((t) => t.kept)).length;
  function progressText(v) {
    const n = v.scenes.length, r = recordedCount(v);
    switch (v.stage) {
      case 'ideas': return 'Idea';
      case 'planning': return n ? `Planning · ${n} scenes drafted` : 'Planning · no scenes yet';
      case 'recording': return `Recording · ${r} of ${n} scenes`;
      case 'editing': return v.edit.removed ? 'Editing · pauses removed' : `Editing · ${n} scenes recorded`;
      case 'publishing': return 'Publishing · ready to upload';
      case 'published': return `Published ${fmtDate(v.publishedAt)}`;
    }
    return '';
  }
  function nextAction(v) {
    const n = v.scenes.length;
    switch (v.stage) {
      case 'ideas': return { label: 'Start planning', tab: 'board', icon: 'ArrowRight' };
      case 'planning': return n ? { label: 'Continue to recording', tab: 'record', icon: 'Mic' } : { label: 'Draft scenes from board', tab: 'board', icon: 'Sparkles' };
      case 'recording': { const i = v.scenes.findIndex((s) => !s.takes.some((t) => t.kept)); return i < 0 ? { label: 'Continue to editing', tab: 'edit', icon: 'Scissors' } : { label: `Record scene ${i + 1}`, tab: 'record', icon: 'Mic' }; }
      case 'editing': return v.edit.removed ? { label: 'Continue to publishing', tab: 'publish', icon: 'Upload' } : { label: 'Remove pauses', tab: 'edit', icon: 'Scissors' };
      case 'publishing': return { label: 'Paste YouTube link', tab: 'publish', icon: 'Upload' };
      case 'published': return { label: `${fmtNum(v.views)} views`, tab: 'publish', icon: 'Eye' };
    }
    return { label: 'Open', tab: 'board' };
  }
  const defaultTab = (v) => ({ ideas: 'board', planning: 'plan', recording: 'record', editing: 'edit', publishing: 'publish', published: 'publish' }[v.stage] || 'board');
  const totalDur = (v) => v.scenes.reduce((a, s) => a + (s.dur || 0), 0);
  const chosenTitle = (v) => v.titles[v.chosen] || v.titles.find(Boolean) || v.title;

  // ---------- store ----------
  const Store = createContext(null);
  const useStore = () => useContext(Store);

  // ---------- router ----------
  function useRoute() {
    const [h, setH] = useState(location.hash);
    useEffect(() => { const f = () => setH(location.hash); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
    const raw = h.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    return { parts: (path || '').split('/').filter(Boolean), q: new URLSearchParams(qs || ''), raw };
  }
  const go = (p) => { const n = '#/' + p.replace(/^#?\/?/, ''); if (location.hash !== n) location.hash = n; };

  // ---------- shared components ----------
  function Avatar({ name, size = '', sq, color }) {
    const c = color || AV_COLORS[hash(name) % AV_COLORS.length];
    return html`<span className=${'avatar ' + size + (sq ? ' sq' : '')} style=${{ background: c }} aria-hidden="true">${initials(name)}</span>`;
  }
  function MultChip({ m, onThumb, suffix }) {
    if (!m) return null;
    return html`<span className=${'chip mult ' + band(m) + (onThumb ? ' on-thumb' : '')} title=${'Views compared with the channel\'s usual: ' + fmtMult(m)}>${fmtMult(m)}${suffix ? ' ' + suffix : ''}</span>`;
  }
  function Level({ label, d }) {
    if (!d) return null;
    const lv = d.level || 'mid';
    return html`<span className=${'lvl ' + lv} title=${d.note || ''}><span className="bars"><i></i><i></i><i></i></span>${label}</span>`;
  }
  function StagePill({ stage }) {
    return html`<span className=${'stage-pill st-' + stage}><span className="d"></span>${stageLabel(stage)}</span>`;
  }
  function DraftThumb({ text, seed, small }) {
    const g = GRADS[hash(seed) % GRADS.length];
    const fs = small ? 'clamp(9px, 2.6cqw, 13px)' : 'clamp(13px, 7.4cqw, 34px)';
    return html`<div className="tthumb" style=${{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`, containerType: 'inline-size' }}>
      <div className="face"></div>
      <div className="tt" style=${{ fontSize: fs }}>${text || ''}</div>
    </div>`;
  }
  function Thumb({ v, videoId, text, seed, chip, children, className = '', style }) {
    const [err, setErr] = useState(false);
    let id = videoId;
    let draft = null;
    if (v) {
      if (v.own) id = v.thumbId;
      else if (v.stage !== 'ideas' || !v.thumbId) { id = null; draft = v.thumbText || chosenTitle(v); }
      else id = v.thumbId;
    }
    return html`<div className=${'thumb ' + className} style=${style}>
      ${id && !err ? html`<img src=${ytThumb(id)} alt="" loading="lazy" onError=${() => setErr(true)} />` : html`<${DraftThumb} text=${draft || text || (v && v.title)} seed=${seed || (v && v.id) || id} />`}
      ${chip}
      ${children}
    </div>`;
  }
  function SceneDots({ v }) {
    if (!v.scenes.length) return null;
    return html`<span className="dots" title=${recordedCount(v) + ' of ' + v.scenes.length + ' scenes recorded'}>${v.scenes.map((s) => html`<i key=${s.id} className=${sceneStatus(s, v).k}></i>`)}</span>`;
  }
  function SceneStatus({ s, v }) {
    const st = sceneStatus(s, v);
    return html`<span className=${'sst ' + st.k}><span className="d"></span>${st.label}</span>`;
  }
  function Empty({ icon = 'Sparkles', title, children, action }) {
    return html`<div className="empty"><div className="ic"><${Icon} name=${icon} size=${20} /></div><h3>${title}</h3><p>${children}</p>${action}</div>`;
  }
  function useClickAway(ref, fn, on) {
    useEffect(() => {
      if (!on) return;
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) fn(); };
      const k = (e) => { if (e.key === 'Escape') fn(); };
      setTimeout(() => document.addEventListener('mousedown', h), 0);
      document.addEventListener('keydown', k);
      return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
    }, [on]);
  }
  function Menu({ button, items, align = 'left', width }) {
    const [open, setOpen] = useState(false);
    const ref = useRef();
    useClickAway(ref, () => setOpen(false), open);
    return html`<span ref=${ref} style=${{ position: 'relative', display: 'inline-flex' }}>
      ${button(() => setOpen((o) => !o), open)}
      ${open && html`<div className="menu" role="menu" style=${{ top: 'calc(100% + 6px)', [align]: 0, minWidth: width }}>
        ${items.map((it, i) => it === '-' ? html`<div key=${i} className="sep"></div>` : it.header ? html`<div key=${i} className="hd">${it.header}</div>` : html`<button key=${i} role="menuitem" onClick=${() => { setOpen(false); it.fn(); }} style=${it.danger ? { color: 'var(--rec)' } : null}>
          ${it.icon && html`<${Icon} name=${it.icon} size=${15} />`}<span className="grow">${it.label}</span>${it.check && html`<${Icon} name="Check" size=${15} />`}</button>`)}
      </div>`}
    </span>`;
  }
  function Dialog({ title, children, footer, onClose, width, className = '' }) {
    useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
    return html`<${Fragment}>
      <div className="scrim" onClick=${onClose}></div>
      <div className=${'dialog ' + className} role="dialog" aria-modal="true" aria-label=${typeof title === 'string' ? title : 'Dialog'} style=${width ? { width } : null}>
        ${title && html`<div className="dh"><h3>${title}</h3></div>`}
        <div className="db">${children}</div>
        ${footer && html`<div className="df">${footer}</div>`}
      </div>
    <//>`;
  }
  function Drawer({ children, header, footer, onClose }) {
    useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
    return html`<${Fragment}>
      <div className="scrim" onClick=${onClose}></div>
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="dh">${header}<button className="btn ghost sm icon-only" style=${{ marginLeft: 'auto' }} onClick=${onClose} aria-label="Close"><${Icon} name="X" size=${16} /></button></div>
        <div className="db">${children}</div>
        ${footer && html`<div className="df">${footer}</div>`}
      </aside>
    <//>`;
  }
  function copyText(t) {
    try { if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).catch(() => fallbackCopy(t)); } catch (e) { }
    fallbackCopy(t); return Promise.resolve();
  }
  function fallbackCopy(t) { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } ta.remove(); }

  // Editable text (Notion-like). Commits on blur; Enter blurs unless multiline.
  function Ed({ value, onChange, className = '', ph = '', multiline, tag = 'div', onEnter, autoFocus, style }) {
    const ref = useRef();
    useEffect(() => { if (ref.current && document.activeElement !== ref.current && ref.current.innerText !== (value || '')) ref.current.innerText = value || ''; }, [value]);
    useEffect(() => { if (autoFocus && ref.current) { ref.current.focus(); const r = document.createRange(); r.selectNodeContents(ref.current); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }, []);
    return React.createElement(tag, {
      ref, className: 'ed ' + className, contentEditable: true, suppressContentEditableWarning: true, 'data-ph': ph, spellCheck: false, role: 'textbox', 'aria-label': ph || 'Edit text', style,
      onBlur: (e) => { const t = e.currentTarget.innerText.replace(/\n+$/, ''); if (t !== (value || '')) onChange(t); },
      onKeyDown: (e) => {
        if (e.key === 'Enter' && !multiline) { e.preventDefault(); if (onEnter) { onChange(e.currentTarget.innerText); onEnter(e); } else e.currentTarget.blur(); }
        if (e.key === 'Escape') e.currentTarget.blur();
      },
      onClick: (e) => e.stopPropagation(),
    });
  }

  function SourceIcon({ source }) {
    return source === 'x' ? html`<span className="src-ic src-x" title="X">𝕏</span>` : html`<span className="src-ic src-reddit" title="Reddit"><${Icon} name="MessageCircle" size=${12} stroke=${2.4} /></span>`;
  }

  // The Frame mock: a screen recording with a camera bubble.
  function Frame({ seed = 0, caption, children }) {
    const w = [70, 52, 84, 46, 64, 58, 76];
    const r = (i) => w[(seed + i) % w.length] + '%';
    return html`<div className="frame">
      <div className="win"><div className="wbar"><i></i><i></i><i></i></div>
        <div className="wbody"><div className="wside"><b style=${{ width: '80%' }}></b><b style=${{ width: '60%' }}></b><b style=${{ width: '70%' }}></b><b style=${{ width: '50%' }}></b></div>
          <div className="wmain"><b className="hl"></b><b style=${{ width: r(0) }}></b><b style=${{ width: r(1) }}></b><b style=${{ width: r(2) }}></b><div className="card2"></div><b style=${{ width: r(3) }}></b><b style=${{ width: r(4) }}></b></div>
        </div>
      </div>
      <div className="cam"></div>
      ${caption && html`<div className="cap">${caption}</div>`}
      ${children}
    </div>`;
  }

  window.CC = {
    html, D, C, Icon, fmtNum, fmtMult, band, fmtDays, fmtHours, fmtClock, fmtMS, parseClock, fmtDate, TODAY, hash, initials, ytThumb, sentence, cleanTitle, words, GRADS, MONTHS,
    jobsById, jobByVideo, trendById, multFor, buildVideo, initialChannels, STAGES, stageLabel, sceneStatus, recordedCount, progressText, nextAction, defaultTab, totalDur, chosenTitle,
    Store, useStore, useRoute, go, Avatar, MultChip, Level, StagePill, DraftThumb, Thumb, SceneDots, SceneStatus, Empty, Menu, Dialog, Drawer, copyText, Ed, SourceIcon, Frame, useClickAway,
  };
})();
