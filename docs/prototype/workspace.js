/* Video workspace: Board · Plan · Record · Edit · Publish, sharing one scene strip. */
(function () {
  const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;
  const { html, D, C, Icon, fmtNum, fmtMult, fmtDays, fmtHours, fmtClock, fmtMS, parseClock, fmtDate, TODAY, hash, jobsById, jobByVideo, trendById, multFor, STAGES, stageLabel,
    sceneStatus, recordedCount, totalDur, chosenTitle, useStore, go, Avatar, MultChip, Level, StagePill, Thumb, DraftThumb, SceneStatus, Empty, Menu, Dialog, SourceIcon, Frame, Ed, copyText, ytIdFrom, words, sentence } = window.CC;

  const TABS = [['board', 'Board'], ['plan', 'Plan'], ['record', 'Record'], ['edit', 'Edit'], ['publish', 'Publish']];
  const ORDER = STAGES.map((s) => s.id);
  const advance = (st, v, stage) => { if (ORDER.indexOf(stage) > ORDER.indexOf(v.stage)) st.setStage(v.id, stage, true); };
  const tabDone = (v, t) => ({
    board: v.scenes.length > 0, plan: v.scenes.length > 0 && ORDER.indexOf(v.stage) >= 2,
    record: v.scenes.length > 0 && v.scenes.every((s) => s.takes.some((k) => k.kept)), edit: v.edit.removed, publish: v.stage === 'published',
  }[t]);

  // ---------- generators (canned AI) ----------
  function draftScenes(v) {
    const id = () => v.id + '-s' + Math.random().toString(36).slice(2, 7);
    const hook = v.hook.spoken || v.hook && v.hook.visual;
    const S = (title, dur, points, show) => ({ id: id(), title, dur, points, show, takes: [] });
    return [
      S('Opening', 45, [hook ? `"${hook.replace(/^"|"$/g, '')}"` : 'Open on the finished result, then say in one sentence what it took.', 'Roadmap: three levels, one sentence each.', '"Even if you\'re not technical, you can follow this. Let\'s get into it."'], 'The finished result on screen first, then the three levels as on-screen text.'),
      S('Why this matters', 60, [v.why || 'Why this is worth ten minutes right now.', v.demand && v.demand.note ? 'Proof: ' + v.demand.note : 'Use one real number as proof. Don\'t add others.', 'Name the false belief: "I need to be super technical."'], 'The proof on screen: the numbers or the post that started it.'),
      S('Level 1: the quick win', 120, ['Show the simplest version first, live.', 'Say what it saves and what it costs, honestly.', v.show && v.show.note ? v.show.note : 'Check it works before recording.'], 'Do it live. Say the prompt aloud as it\'s typed.'),
      S('Level 2: the real task', 180, [v.angle || 'Chain it into a task a non-technical viewer already does.', 'Time saved versus doing it by hand. If a step fails, show the fix.'], 'The task start to finish, with the spoken prompt on screen.'),
      S('Level 3: make it repeatable', 120, [v.twist || 'Set it up once so it works on the next run without explaining again.', 'Give the setup time and cost honestly.'], 'Run it on a fresh task to prove it carries over.'),
      S('Ending', 40, ['Close on the Level 3 result.', '"Watch this video right here." Point to another video on the channel.'], 'End screen with the next video.'),
    ];
  }
  function writeScript(s) {
    const lines = s.points.map((p) => p.replace(/^"|"$/g, '').replace(/^(Say|Proof|Analogy|Roadmap|Rule|Loop|Checklist|Name the false belief):\s*/i, ''));
    return 'Okay, so ' + lines.map((l, i) => (i ? l : l.charAt(0).toLowerCase() + l.slice(1))).join(' ') + (s.title === 'Ending' ? '' : " Let's get into it.");
  }
  function description(v, chan) {
    let t = 0;
    const ch = v.scenes.map((s) => { const kept = s.takes.find((k) => k.kept); const d = kept ? kept.dur - (v.edit.removed ? s.cut || 0 : 0) : s.dur; const line = `${fmtClock(t)} ${s.title}`; t += d; return line; });
    const next = D.own.find((o) => o.videoId === '_ZehNseg0Qg');
    return [v.hook.spoken, '', v.angle, ch.length ? '\nChapters\n' + ch.join('\n') : '', next && chan && chan.id === 'samin' ? `\nWatch next: ${next.title}\nhttps://youtu.be/${next.videoId}` : ''].filter((x) => x !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ---------- board model ----------
  function initBoard(v) {
    if (C.BOARD[v.id]) return C.BOARD[v.id].map((t, i) => Object.assign({ id: 't' + i }, t));
    const tiles = [];
    const slots = [[60, 60], [400, 60], [740, 60], [1080, 60], [1420, 60], [60, 470], [400, 470], [740, 470], [1080, 470], [1420, 470]];
    const add = (t) => { const p = slots[tiles.length] || [60 + (tiles.length % 5) * 340, 880]; tiles.push(Object.assign({ id: 't' + tiles.length, x: p[0], y: p[1], w: t.type === 'breakdown' || t.type === 'questions' ? 320 : 280 }, t)); };
    add({ type: 'idea' });
    const seenJobs = new Set();
    v.sources.forEach((s) => {
      if (s.videoId) {
        add({ type: 'video', videoId: s.videoId });
        const j = jobByVideo[s.videoId];
        if (j && !seenJobs.has(j.id)) { seenJobs.add(j.id); add({ type: 'breakdown', job: j.id }); add({ type: 'questions', job: j.id }); }
      } else if (s.url) add({ type: 'link', url: s.url, label: s.label });
      else add({ type: 'note', text: s.label, by: 'Source' });
    });
    const kw = v.title.toLowerCase().split(/\W+/).filter((w) => w.length > 4 && !['claude', 'should', 'without', 'really', 'which'].includes(w));
    const sig = D.signals.map((s) => ({ s, sc: kw.filter((k) => s.text.toLowerCase().includes(k)).length })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || b.s.likes - a.s.likes).slice(0, 2);
    sig.forEach((x) => add({ type: 'signal', signalId: x.s.id }));
    if (tiles.length < 4) add({ type: 'note', text: 'Drop links, screenshots and notes here. Claude reads the whole board when it drafts your scenes.', by: 'Tip' });
    return tiles;
  }
  const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

  // ---------- workspace shell ----------
  function Workspace({ id, tab }) {
    const st = useStore();
    const v = st.videos.find((x) => x.id === id);
    const [focus, setFocus] = useState(null);
    if (!v) return html`<div className="page"><div className="card"><${Empty} icon="Film" title="This video isn't in this channel" action=${html`<button className="btn" onClick=${() => go('production')}>Open production</button>`}>It may belong to another channel, or the link is old.</${Empty}></div></div>`;
    const T = { board: Board, plan: Plan, record: Record, edit: Edit, publish: Publish }[tab] || Board;
    return html`<div className="ws">
      <${Header} v=${v} tab=${tab} />
      ${tab === 'record' ? null : html`<${Strip} v=${v} tab=${tab} focus=${focus} onPick=${(i) => { setFocus(i); if (tab === 'board') go(`video/${v.id}/plan`); }} />`}
      <div className="ws-body" key=${tab}><${T} v=${v} focus=${focus} setFocus=${setFocus} /></div>
      <${Foot} v=${v} tab=${tab} />
    </div>`;
  }
  function Header({ v, tab }) {
    const st = useStore();
    const from = st.from;
    return html`<div className="ws-top">
      <a className="btn ghost sm icon-only" href=${'#/' + from.route} title=${'Back to ' + from.label} aria-label=${'Back to ' + from.label}><${Icon} name="ArrowLeft" size=${16} /></a>
      <div className="crumb"><a href="#/production" title="All videos">Videos</a><${Icon} name="ChevronRight" size=${14} /></div>
      <${Ed} className="ws-title" value=${chosenTitle(v)} ph="Video title" onChange=${(t) => { const titles = v.titles.slice(); titles[v.chosen] = t; st.updateVideo(v.id, { titles }); }} />
      <${Menu} button=${(t) => html`<button className="btn ghost sm" onClick=${t} style=${{ padding: '0 4px' }} aria-label="Change stage"><${StagePill} stage=${v.stage} /><${Icon} name="ChevronDown" size=${13} /></button>`}
        items=${[{ header: 'Move to' }].concat(STAGES.map((s) => ({ label: s.label, check: v.stage === s.id, fn: () => st.setStage(v.id, s.id) })))} />
      <span className="grow"></span>
      <nav className="tabs" aria-label="Video steps">${TABS.map(([k, l]) => html`<a key=${k} href=${`#/video/${v.id}/${k}`} className=${tab === k ? 'on' : ''} aria-current=${tab === k ? 'page' : null}>${tabDone(v, k) && html`<${Icon} name="Check" size=${13} className="ck" stroke=${2.6} />`}${l}</a>`)}</nav>
      <span className="grow"></span>
      ${v.plannedDate && v.stage !== 'published' ? html`<span className="faint small row" style=${{ gap: 5 }}><${Icon} name="Calendar" size=${13} />${fmtDate(v.plannedDate)}</span>` : null}
      <${Menu} align="right" button=${(t) => html`<button className="btn ghost sm icon-only" onClick=${t} aria-label="More"><${Icon} name="MoreHorizontal" size=${16} /></button>`}
        items=${[{ label: 'Copy link to this video', icon: 'Link', fn: () => { window.CC.copyText(location.href); st.toast('Copied link'); } }, { label: 'Set publish date', icon: 'Calendar', fn: () => { st.updateVideo(v.id, { plannedDate: '2026-11-12' }); st.toast('Planned for Nov 12'); } }, '-', { label: 'Move back to ideas', icon: 'Undo2', fn: () => st.setStage(v.id, 'ideas') }]} />
    </div>`;
  }
  function Strip({ v, tab, focus, onPick }) {
    const tot = totalDur(v);
    if (!v.scenes.length) return html`<div className="strip"><span className="lab"><${Icon} name="Layers" size=${14} />Scenes</span><span className="small muted">${v.own ? "Made before CreatorClub, so it has no scenes here." : tab === 'board' ? 'No scenes yet. Gather references here, then draft scenes from the board.' : 'No scenes yet. Draft them from the board.'}</span></div>`;
    return html`<div className="strip" role="list" aria-label="Scenes">
      <span className="lab"><${Icon} name="Layers" size=${14} />${v.scenes.length} scenes · <span className="tnum">${fmtClock(tot)}</span></span>
      ${v.scenes.map((s, i) => html`<button key=${s.id} role="listitem" className=${'sc' + (focus === i ? ' on' : '')} onClick=${() => onPick(i)} title=${s.title}>
        <span className="n">${i + 1}</span><span className="t">${s.title}</span><${SceneStatus} s=${s} v=${v} /></button>`)}
    </div>`;
  }
  function Foot({ v, tab }) {
    const st = useStore();
    const i = TABS.findIndex((t) => t[0] === tab);
    const prev = TABS[i - 1], next = TABS[i + 1];
    const allKept = v.scenes.length > 0 && v.scenes.every((s) => s.takes.some((k) => k.kept));
    // One primary per view: the footer button is primary unless this step's own main action is still pending.
    const primary = { board: v.scenes.length > 0, plan: v.scenes.length > 0, record: allKept, edit: v.edit.removed, publish: false }[tab];
    const stageFor = { plan: 'planning', record: 'recording', edit: 'editing', publish: 'publishing' };
    return html`<div className="ws-foot">
      <div className="l">${prev ? html`<a className="btn ghost" href=${`#/video/${v.id}/${prev[0]}`}><${Icon} name="ChevronLeft" size=${15} />Back to ${prev[1].toLowerCase()}</a>` : html`<a className="btn ghost" href=${'#/' + st.from.route}><${Icon} name="ChevronLeft" size=${15} />Back to ${st.from.label.toLowerCase()}</a>`}</div>
      <div className="r">${next ? html`<button className=${'btn ' + (primary ? 'primary' : '')} onClick=${() => { advance(st, v, stageFor[next[0]]); go(`video/${v.id}/${next[0]}`); }}>Continue to ${next[1].toLowerCase()}<${Icon} name="ChevronRight" size=${15} /></button>` : html`<a className="btn" href=${'#/' + st.from.route}>Back to ${st.from.label.toLowerCase()}</a>`}</div>
    </div>`;
  }

  // ---------- Board ----------
  function Board({ v }) {
    const st = useStore();
    const [tiles, setTiles] = useState(() => v.board || initBoard(v));
    const [drag, setDrag] = useState(null);
    const [sel, setSel] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [chat, setChat] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [link, setLink] = useState('');
    const [drafting, setDrafting] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [bd, setBd] = useState(null);
    const scroller = useRef();
    const tilesRef = useRef(tiles);
    tilesRef.current = tiles;
    const commit = (t) => { setTiles(t); st.updateVideo(v.id, { board: t }); };
    useEffect(() => { if (!v.board) st.updateVideo(v.id, { board: tiles }); }, []);

    const onDown = (e, t) => {
      if (e.button !== 0 || e.target.closest('button, a, textarea, input, [contenteditable]')) return;
      e.preventDefault();
      const start = { mx: e.clientX, my: e.clientY, x: t.x, y: t.y };
      setSel(t.id); setDrag(t.id);
      const mv = (ev) => setTiles((ts) => ts.map((x) => x.id === t.id ? Object.assign({}, x, { x: Math.max(0, start.x + (ev.clientX - start.mx) / zoom), y: Math.max(0, start.y + (ev.clientY - start.my) / zoom) }) : x));
      const up = () => { setDrag(null); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); st.updateVideo(v.id, { board: tilesRef.current }); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      setTiles((ts) => ts.filter((x) => x.id !== t.id).concat(ts.filter((x) => x.id === t.id)));
    };
    // New tiles land in the nearest free space to the middle of the view, then scroll into view.
    const EST_H = { note: 150, link: 110, image: 250, video: 310, signal: 220 };
    const findSpot = (w, h) => {
      const sc = scroller.current;
      const cx = (sc.scrollLeft + sc.clientWidth / 2) / zoom - w / 2, cy = (sc.scrollTop + sc.clientHeight / 2) / zoom - h / 2;
      const rects = tilesRef.current.map((t) => { const el = document.querySelector(`[data-tile="${t.id}"]`); return { x: t.x, y: t.y, w: t.w, h: el ? el.offsetHeight : 240 }; });
      const free = (x, y) => x >= 20 && y >= 20 && x + w < 2580 && y + h < 1680 && rects.every((r) => x + w + 16 <= r.x || r.x + r.w + 16 <= x || y + h + 16 <= r.y || r.y + r.h + 16 <= y);
      for (let rad = 0; rad < 2400; rad += 40) {
        const n = Math.max(1, Math.round(rad / 12));
        for (let a = 0; a < n; a++) { const ang = (a / n) * Math.PI * 2; const x = Math.round(cx + Math.cos(ang) * rad), y = Math.round(cy + Math.sin(ang) * rad); if (free(x, y)) return { x, y }; }
      }
      return { x: Math.round(cx), y: Math.round(cy) };
    };
    const addTile = (t) => {
      const w = t.w || 260; const spot = findSpot(w, EST_H[t.type] || 200);
      const nt = Object.assign({ id: 't' + Date.now() + Math.round(Math.random() * 99), w }, t, spot);
      commit(tilesRef.current.concat(nt)); setSel(nt.id);
      setTimeout(() => { const el = document.querySelector(`[data-tile="${nt.id}"]`); el && el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); }, 60);
      return nt;
    };
    const remove = (id) => { const before = tiles; commit(tiles.filter((t) => t.id !== id)); st.toast('Removed from the board', { undo: () => commit(before) }); };
    const submitLink = () => {
      const u = link.trim(); if (!u) return;
      const vid = ytIdFrom(u);
      if (vid) addTile({ type: 'video', videoId: vid, w: 260 }); else addTile({ type: 'link', url: /^https?:/.test(u) ? u : 'https://' + u, label: domain(/^https?:/.test(u) ? u : 'https://' + u), w: 240 });
      setLink(''); setLinkOpen(false); st.toast(vid ? 'Added the video to the board' : 'Added the link to the board');
    };
    const doDraft = () => {
      setConfirm(false); setDrafting(true);
      setTimeout(() => {
        const sc = draftScenes(v);
        st.updateVideo(v.id, { scenes: sc });
        advance(st, v, 'planning');
        setDrafting(false); go(`video/${v.id}/plan`);
        st.toast(`Drafted ${sc.length} scenes from ${tiles.length} tiles`);
      }, 1500);
    };
    const hasScenes = v.scenes.length > 0;
    return html`<div className="board-wrap" onClick=${(e) => { if (e.target === e.currentTarget || e.target.classList.contains('canvas')) setSel(null); }}>
      <div className="canvas-scroll" ref=${scroller}>
        <div className="canvas" style=${{ transform: `scale(${zoom})`, width: 2600 * zoom, height: 1700 * zoom }} onPointerDown=${(e) => { if (e.target.classList.contains('canvas')) setSel(null); }}>
          <div style=${{ position: 'absolute', inset: 0, width: 2600, height: 1700 }} className="canvas">
            ${tiles.map((t) => html`<div key=${t.id} data-tile=${t.id} className=${'tile ' + t.type + (drag === t.id ? ' drag' : '') + (sel === t.id ? ' sel' : '')} style=${{ left: t.x, top: t.y, width: t.w }} onPointerDown=${(e) => onDown(e, t)}>
              <${TileBody} t=${t} v=${v} onRemove=${() => remove(t.id)} onNote=${(text) => commit(tiles.map((x) => x.id === t.id ? Object.assign({}, x, { text }) : x))} onOpen=${(j) => setBd(j)} />
            </div>`)}
          </div>
        </div>
      </div>
      <div className="board-actions" style=${chat ? { right: 398 } : null}>
        <button className=${'btn' + (chat ? ' ' : ' ai')} onClick=${() => setChat(!chat)} aria-pressed=${chat}><${Icon} name="Sparkles" size=${15} />Ask Claude about this board</button>
        <button className=${'btn ' + (hasScenes ? '' : 'primary')} disabled=${drafting} onClick=${() => hasScenes ? setConfirm(true) : doDraft()}>${drafting ? html`<${Fragment}><span className="spin" style=${{ borderTopColor: hasScenes ? 'var(--accent)' : '#fff' }}></span>Reading ${tiles.length} tiles…<//>` : html`<${Fragment}><${Icon} name="Wand2" size=${15} />Draft scenes from board<//>`}</button>
      </div>
      <div className="btoolbar" style=${chat ? { left: 'calc(50% - 190px)' } : null}>
        <button className="btn ghost sm" onClick=${() => addTile({ type: 'note', text: '', by: window.CC_ACTIVE_FIRST(), w: 240, fresh: true })}><${Icon} name="StickyNote" size=${15} />Add note</button>
        <span style=${{ position: 'relative' }}>
          <button className="btn ghost sm" onClick=${() => setLinkOpen(!linkOpen)}><${Icon} name="Link" size=${15} />Paste link</button>
          ${linkOpen && html`<form className="menu" style=${{ bottom: 'calc(100% + 10px)', left: -60, width: 360, padding: 8, display: 'flex', gap: 6 }} onSubmit=${(e) => { e.preventDefault(); submitLink(); }}>
            <input className="input" autoFocus value=${link} onChange=${(e) => setLink(e.target.value)} placeholder="YouTube, Instagram, X or any link" style=${{ height: 32 }} onKeyDown=${(e) => e.key === 'Escape' && setLinkOpen(false)} aria-label="Link to add" />
            <button className="btn sm primary" type="submit" style=${{ height: 32 }}>Add</button></form>`}
        </span>
        <button className="btn ghost sm" onClick=${() => { addTile({ type: 'image', caption: 'Screenshot', w: 280 }); st.toast('Added a screenshot'); }}><${Icon} name="Image" size=${15} />Add image</button>
        <span className="sep"></span>
        <button className="btn ghost sm icon-only" aria-label="Zoom out" onClick=${() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}><${Icon} name="ZoomOut" size=${15} /></button>
        <span className="zoom">${Math.round(zoom * 100)}%</span>
        <button className="btn ghost sm icon-only" aria-label="Zoom in" onClick=${() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}><${Icon} name="ZoomIn" size=${15} /></button>
        <button className="btn ghost sm" onClick=${() => { setZoom(0.7); scroller.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' }); }}><${Icon} name="Maximize2" size=${14} />Fit</button>
      </div>
      ${chat && html`<${ChatPanel} v=${v} tiles=${tiles} onClose=${() => setChat(false)} onAddNote=${(text) => { addTile({ type: 'note', text, by: 'Claude', w: 280 }); st.toast('Added to the board'); }} />`}
      ${confirm && html`<${Dialog} title="Replace the scenes?" onClose=${() => setConfirm(false)} footer=${html`<${Fragment}><button className="btn ghost" onClick=${() => setConfirm(false)}>Keep my scenes</button><button className="btn primary" onClick=${doDraft}>Replace ${v.scenes.length} scenes</button><//>`}>
        <p className="muted" style=${{ margin: 0, lineHeight: 1.55 }}>This video already has ${v.scenes.length} scenes${recordedCount(v) ? `, and ${recordedCount(v)} are recorded` : ''}. Drafting again replaces them. Your takes stay in the archive.</p><//>`}
      ${bd && html`<${window.CC.BreakdownDrawer} videoId=${bd} onClose=${() => setBd(null)} />`}
    </div>`;
  }
  function TileHead({ icon, label, onRemove, children }) {
    return html`<div className="th"><${Icon} name=${icon} size=${13} />${label}${children}<button className="btn ghost sm icon-only x" onClick=${onRemove} aria-label="Remove tile" style=${{ width: 22, height: 22 }}><${Icon} name="X" size=${13} /></button></div>`;
  }
  function TileBody({ t, v, onRemove, onNote, onOpen }) {
    const st = useStore();
    if (t.type === 'note') return html`<${Fragment}><${TileHead} icon="StickyNote" label=${'Note' + (t.by ? ' · ' + t.by : '')} onRemove=${onRemove} /><div className="tb"><textarea defaultValue=${t.text} autoFocus=${!!t.fresh && !t.text} placeholder="Write a note…" onBlur=${(e) => e.target.value !== t.text && onNote(e.target.value)} rows=${Math.min(14, Math.max(3, Math.ceil((t.text || '').length / 34) + (t.text || '').split('\n').length - 1))} aria-label="Note"></textarea></div><//>`;
    if (t.type === 'idea') return html`<${Fragment}><${TileHead} icon="Lightbulb" label="The idea" onRemove=${onRemove} /><div className="tb">
      <div style=${{ fontWeight: 650, fontSize: 15, letterSpacing: '-0.01em', marginBottom: 6 }}>${v.title}</div>
      <div className="muted" style=${{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>${v.why}</div>
      <div className="row" style=${{ flexWrap: 'wrap', gap: 5 }}><${Level} label="Demand" d=${v.demand} /><${Level} label="Gap" d=${v.gap} /><${Level} label="Easy to show" d=${v.show} /></div>
      ${v.demand && v.demand.note && html`<div className="small muted" style=${{ marginTop: 10, lineHeight: 1.5 }}>${v.demand.note}</div>`}</div><//>`;
    if (t.type === 'video') {
      const tr = trendById[t.videoId]; const j = jobByVideo[t.videoId]; const vi = tr || (j && j.video) || {};
      return html`<${Fragment}><${TileHead} icon="Youtube" label="YouTube" onRemove=${onRemove} /><div className="tb">
        <${Thumb} videoId=${t.videoId} chip=${html`<${MultChip} m=${multFor(tr)} who=${tr && window.CC.creatorName(tr.channel)} onThumb=${true} />`} />
        <div style=${{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.35, margin: '10px 0 6px' }} className="clamp2">${vi.title || 'YouTube video'}</div>
        ${vi.channel ? html`<div className="row small muted" style=${{ marginBottom: 6 }}><${Avatar} name=${vi.channel} size="xs" /><span className="ellipsis">${vi.channel}</span></div>` : null}
        ${vi.views ? html`<div className="stats"><span><b>${fmtNum(vi.views)}</b> views</span>${vi.vpd ? html`<span><b>${fmtNum(vi.vpd)}</b>/day</span>` : null}<span>${fmtDays(vi.ageDays)}</span></div>` : html`<div className="small muted">Reading the video…</div>`}
        <div className="row" style=${{ marginTop: 8, gap: 6 }}><a className="btn sm ghost" href=${'https://www.youtube.com/watch?v=' + t.videoId} target="_blank" rel="noopener"><${Icon} name="ArrowUpRight" size=${13} />Open</a>${(j || tr) && html`<button className="btn sm ghost" onClick=${() => onOpen(t.videoId)}><${Icon} name="FileText" size=${13} />Breakdown</button>`}</div>
      </div><//>`;
    }
    if (t.type === 'breakdown') {
      const j = jobsById[t.job]; if (!j) return null;
      const jr = window.CC.jobFor(j, st.channel);
      return html`<${Fragment}><${TileHead} icon="Sparkles" label=${'Breakdown · ' + j.video.channel.split('|')[0].trim()} onRemove=${onRemove} /><div className="tb">
        <div className="row" style=${{ gap: 10, marginBottom: 10 }}><img src=${window.CC.ytThumb(j.video.videoId)} alt="" style=${{ width: 72, height: 40, borderRadius: 5, objectFit: 'cover' }} /><div style=${{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }} className="clamp2">${j.video.title}</div></div>
        <div className="small faint" style=${{ marginBottom: 6 }}>Why it worked</div>
        <ol style=${{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>${jr.whyItWorked.slice(0, 3).map((w, i) => html`<li key=${i}>${w}</li>`)}</ol>
        <button className="btn sm ghost" style=${{ marginTop: 8 }} onClick=${() => onOpen(j.video.videoId)}><${Icon} name="FileText" size=${13} />Open breakdown</button>
      </div><//>`;
    }
    if (t.type === 'questions') {
      const j = jobsById[t.job]; if (!j) return null;
      return html`<${Fragment}><${TileHead} icon="MessagesSquare" label="What viewers ask" onRemove=${onRemove} /><div className="tb" style=${{ paddingTop: 4 }}>
        ${j.result.viewerQuestions.slice(0, 4).map((q, i) => html`<div key=${i} className="q" style=${{ fontSize: 13 }}><span>${q.question}</span>${q.likes ? html`<span className="likes"><${Icon} name="Heart" size=${11} />${q.likes}</span>` : null}</div>`)}
      </div><//>`;
    }
    if (t.type === 'link') return html`<${Fragment}><${TileHead} icon="Link" label="Link" onRemove=${onRemove} /><div className="tb row" style=${{ alignItems: 'flex-start', gap: 10 }}>
      <span className="logo" style=${{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-sunk)', fontWeight: 700, color: 'var(--text-2)' }}>${domain(t.url)[0].toUpperCase()}</span>
      <div style=${{ minWidth: 0 }}><div style=${{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.35 }}>${t.label}</div><a href=${t.url} target="_blank" rel="noopener" className="small ellipsis" style=${{ color: 'var(--accent-text)', display: 'block' }}>${domain(t.url)}</a></div></div><//>`;
    if (t.type === 'signal') {
      const s = t.signalId ? D.signals.find((x) => x.id === t.signalId) : D.signals.filter((x) => x.text.toLowerCase().includes(t.match || '')).sort((a, b) => b.likes - a.likes)[0];
      if (!s) return null;
      return html`<${Fragment}><${TileHead} icon="MessagesSquare" label=${s.source === 'x' ? 'Post on X' : 'Reddit post'} onRemove=${onRemove} /><div className="tb">
        <div className="row" style=${{ marginBottom: 8 }}><${Avatar} name=${s.author} size="sm" /><b style=${{ fontSize: 13 }} className="ellipsis">${s.author}</b><span className="faint small">${fmtHours(s.ageHours)}</span><span className="grow"></span><${SourceIcon} source=${s.source} /></div>
        <div className="clamp3" style=${{ fontSize: 13, lineHeight: 1.5, WebkitLineClamp: 5 }}>${s.text}</div>
        <div className="stats" style=${{ marginTop: 8 }}><span><${Icon} name="Heart" size=${12} />${fmtNum(s.likes)}</span><span><${Icon} name="MessageCircle" size=${12} />${fmtNum(s.replies)}</span></div></div><//>`;
    }
    if (t.type === 'image') return html`<${Fragment}><${TileHead} icon="Image" label="Screenshot" onRemove=${onRemove} /><div className="tb">
      <div style=${{ position: 'relative', aspectRatio: '16/10', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}><${Frame} seed=${hash(t.id) % 7} /></div>
      <div className="small muted" style=${{ marginTop: 8 }}>${t.caption}</div></div><//>`;
    return null;
  }

  function hookItems(v) {
    if (v.id === 'hidden-features') return ['This just did in one step what used to take me five. Most people never touch it.', "I've used this tool every day for a year and I missed this until last week.", "Three features in your AI tool: one click, one workflow, one setup, and you'll use all three by the end of this video."];
    const base = (v.ideaHook || v.hook.spoken || '').trim();
    return [base || "Here's the finished result. I'll show you exactly how I made it.", 'Most people think you need to be technical for this. Watch.', "Three levels, and by the end of this video you'll have done all three."];
  }
  function titleItems(v) {
    const pk = C.PACK[v.id] || Object.values(C.PACK).find((x) => x.titles.includes(v.title));
    const core = v.title.replace(/\?$/, '');
    const list = pk ? pk.titles.map(window.CC.cleanTitle) : [core, core + ', Explained Simply', 'The Beginner Guide to ' + core];
    const extra = v.id === 'hidden-features' ? ['3 AI Features Most People Never Touch', 'Stop Ignoring These AI Settings', 'Your AI Tool Does More Than You Think'] : [core + ', Explained Simply', 'The Beginner Guide to ' + core, core + ' in Three Levels'];
    const fresh = list.concat(extra).filter((t, i, a) => t && !v.titles.includes(t) && a.indexOf(t) === i);
    return fresh.slice(0, 3);
  }
  const strip = (h) => h.replace(/<li>/g, '• ').replace(/<\/li>/g, '\n').replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n').trim();

  function ChatPanel({ v, tiles, onClose, onAddNote }) {
    const st = useStore();
    const [msgs, setMsgs] = useState(v.chat || []);
    const [typing, setTyping] = useState(false);
    const [text, setText] = useState('');
    const body = useRef();
    useEffect(() => { body.current && (body.current.scrollTop = body.current.scrollHeight); st.updateVideo(v.id, { chat: msgs }); }, [msgs, typing]);
    const job = v.thumbId && jobByVideo[v.thumbId];
    const jr = job && window.CC.jobFor(job, st.channel);
    const answer = (q) => {
      const lq = q.toLowerCase();
      if (lq.includes('hook')) return { t: '<p>Three openings from what\'s on the board. Pick one to use it as your spoken hook.</p>', items: hookItems(v).map((x) => ({ kind: 'hook', text: x })) };
      if (lq.includes('title')) return { t: '<p>Three titles, 7 words or fewer, each a claim rather than a question.</p>', items: titleItems(v).map((x) => ({ kind: 'title', text: x })) };
      if (C.CHAT[q] && v.id === 'hidden-features' && st.channel.id === 'samin') return { t: C.CHAT[q]() };
      if (lq.includes('missing')) return { t: `<ul><li><b>Proof you can show.</b> ${v.show && v.show.note ? v.show.note : 'Pick the one result you can show on screen.'}</li><li><b>The one task.</b> Choose a safe sample with no private data.</li><li><b>The gap.</b> ${v.gap && v.gap.note ? v.gap.note : 'Check what already exists before recording.'}</li></ul>` };
      return { t: `<p>Across the ${tiles.length} tiles on this board:</p><ul>${v.demand && v.demand.note ? `<li><b>Demand.</b> ${v.demand.note} <span class="cite">Idea</span></li>` : ''}${v.gap && v.gap.note ? `<li><b>Gap.</b> ${v.gap.note}</li>` : ''}${jr ? `<li><b>From the breakdown.</b> ${jr.whyItWorked[0]} <span class="cite">Breakdown</span></li>` : ''}</ul><p>Lead with the result on screen, then the three levels.</p>` };
    };
    const ask = (q) => {
      if (!q.trim()) return;
      setMsgs((m) => m.concat({ me: true, t: q })); setText(''); setTyping(true);
      const r = answer(q);
      setTimeout(() => { setTyping(false); setMsgs((m) => m.concat(Object.assign({ me: false, used: {} }, r))); }, 1100);
    };
    const markUsed = (i, k) => setMsgs((m) => m.map((x, j) => (j === i ? Object.assign({}, x, { used: Object.assign({}, x.used, { [k]: true }) }) : x)));
    const useHook = (i, k, txt) => {
      const before = v.hook;
      st.updateVideo(v.id, { hook: Object.assign({}, v.hook, { spoken: txt }) }); markUsed(i, k);
      st.toast('Set as your spoken hook in Plan', { undo: () => st.updateVideo(v.id, { hook: before }) });
    };
    const useTitle = (i, k, txt) => {
      const before = { titles: v.titles, chosen: v.chosen };
      const titles = v.titles.slice(); let at = titles.findIndex((x) => !x); if (at < 0) at = v.chosen;
      titles[at] = txt; st.updateVideo(v.id, { titles, chosen: at }); markUsed(i, k);
      st.toast('Set as your title in Plan', { undo: () => st.updateVideo(v.id, before) });
    };
    const sugg = ['What do these have in common?', 'Write three hooks from this board', 'Suggest three titles', "What's missing before I plan?"];
    return html`<aside className="chat" aria-label="Ask Claude about this board">
      <div className="ch"><${Icon} name="Sparkles" size=${16} style=${{ color: 'var(--accent)' }} />Ask Claude<span className="faint small" style=${{ fontWeight: 500 }}>· reads all ${tiles.length} tiles</span><button className="btn ghost sm icon-only" style=${{ marginLeft: 'auto' }} onClick=${onClose} aria-label="Close chat"><${Icon} name="X" size=${15} /></button></div>
      <div className="cb" ref=${body}>
        ${!msgs.length && html`<div className="muted" style=${{ fontSize: 13.5, lineHeight: 1.55 }}>Ask anything about what you've gathered. Claude reads every tile: the breakdown, the videos, your notes and the posts. Anything useful can go straight onto the board or into your plan.</div>`}
        ${msgs.map((m, i) => m.me ? html`<div key=${i} className="msg me">${m.t}</div>` : html`<div key=${i} className="msg ai">
          <div dangerouslySetInnerHTML=${{ __html: m.t }}></div>
          ${m.items && html`<div className="ai-items">${m.items.map((it, k) => html`<div key=${k} className="ai-item"><div className="grow">${it.text}</div>
            ${m.used && m.used[k] ? html`<span className="chip b-green" style=${{ flex: 'none' }}><${Icon} name="Check" size=${12} />Used</span>` : html`<button className="btn sm" style=${{ flex: 'none' }} onClick=${() => (it.kind === 'hook' ? useHook(i, k, it.text) : useTitle(i, k, it.text))}>${it.kind === 'hook' ? 'Use as hook' : 'Use as title'}</button>`}</div>`)}</div>`}
          <div className="row" style=${{ marginTop: 6 }}>${m.used && m.used.board ? html`<span className="chip b-green"><${Icon} name="Check" size=${12} />On the board</span>` : html`<button className="btn sm ghost" onClick=${() => { onAddNote(m.items ? strip(m.t) + '\n' + m.items.map((x) => '• ' + x.text).join('\n') : strip(m.t)); markUsed(i, 'board'); }}><${Icon} name="StickyNote" size=${14} />Add to board</button>`}</div>
        </div>`)}
        ${typing && html`<div className="typing"><i></i><i></i><i></i></div>`}
      </div>
      <div className="cf">
        ${!msgs.length && html`<div className="sugg" style=${{ marginBottom: 10 }}>${sugg.map((x) => html`<button key=${x} onClick=${() => ask(x)}><${Icon} name="CornerDownRight" size=${14} />${x}</button>`)}</div>`}
        <form className="composer" onSubmit=${(e) => { e.preventDefault(); ask(text); }}>
          <textarea rows="1" value=${text} onChange=${(e) => setText(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }} placeholder="Ask about this board" aria-label="Message"></textarea>
          <button className="btn sm primary icon-only" type="submit" disabled=${!text.trim()} aria-label="Send"><${Icon} name="ArrowUp" size=${15} /></button>
        </form>
      </div>
    </aside>`;
  }

  // ---------- Plan ----------
  function Plan({ v, focus, setFocus }) {
    const st = useStore();
    const up = (p) => st.updateVideo(v.id, p);
    const [busy, setBusy] = useState(null);
    const [dragI, setDragI] = useState(null);
    const [overI, setOverI] = useState(null);
        const refs = useRef({});
    useEffect(() => { if (focus != null && refs.current[focus]) refs.current[focus].scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [focus]);
    const setScene = (i, p) => up({ scenes: v.scenes.map((s, j) => j === i ? Object.assign({}, s, p) : s) });
    const tot = totalDur(v);
    const over = tot > v.target;
    const run = (k, ms, fn) => { setBusy(k); setTimeout(() => { fn(); setBusy(null); }, ms); };
    const pk = C.PACK[v.id];
    const writeTitles = () => run('titles', 1000, () => { const t = v.titles.slice(); const byTitle = Object.values(C.PACK).find((x) => x.titles.includes(v.title)); const core = v.title.replace(/\?$/, ''); const src = ((pk || byTitle) && (pk || byTitle).titles.map(window.CC.cleanTitle)) || [v.title, core + ', Explained Simply', 'The Beginner Guide to ' + core]; for (let i = 0; i < 3; i++) if (!t[i]) t[i] = src[i] || src[0]; up({ titles: t }); st.toast('Wrote title options'); });
    const writeHooks = () => run('hook', 1100, () => { up({ hook: { visual: v.hook.visual || 'The finished result on screen, before any intro.', spoken: v.hook.spoken || `${v.why || v.title} Let me show you, step by step.`, onscreen: v.hook.onscreen || (v.thumbText || 'No code') } }); st.toast('Wrote the hook'); });
    const writeAll = () => run('script', 1600, () => { up({ scenes: v.scenes.map((s) => Object.assign({}, s, { script: s.script || writeScript(s) })) }); st.toast(`Wrote the script for ${v.scenes.length} scenes`); });
    const draft = () => run('draft', 1400, () => { const sc = draftScenes(v); up({ scenes: sc }); advance(st, v, 'planning'); st.toast(`Drafted ${sc.length} scenes from the board`); });
    const addScene = (at) => { const s = { id: v.id + '-s' + Date.now(), title: 'New scene', dur: 60, points: [''], show: '', takes: [] }; const sc = v.scenes.slice(); sc.splice(at, 0, s); up({ scenes: sc }); setFocus(at); };
    const delScene = (i) => { const before = v.scenes; up({ scenes: v.scenes.filter((_, j) => j !== i) }); st.toast(`Deleted "${before[i].title}"`, { undo: () => up({ scenes: before }) }); };
    const move = (from, to) => { if (from === to || from + 1 === to) return; const sc = v.scenes.slice(); const [s] = sc.splice(from, 1); sc.splice(to > from ? to - 1 : to, 0, s); up({ scenes: sc }); };
    const t0 = v.titles;
    const onGrip = (e, i) => {
      if (e.button !== 0) return;
      e.preventDefault(); setDragI(i); setOverI(i);
      let to = i;
      const mv = (ev) => { const ys = v.scenes.map((_, j) => { const r = refs.current[j].getBoundingClientRect(); return r.top + r.height / 2; }); to = ys.findIndex((y) => ev.clientY < y); if (to < 0) to = ys.length; setOverI(to); };
      const upF = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upF); setDragI(null); setOverI(null); move(i, to); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', upF);
    };
    return html`<div className="plan">
      <section className="pkg" aria-label="Package">
        <div className="doc-h"><${Icon} name="Package" size=${18} /><h2>Package</h2></div>
        <div className="doc-sub">Decide why this video gets clicked. Everything here is editable. Click to change it.</div>
        <div className="blk"><div className="blk-h"><h4>Title</h4><span className="faint small">Pick one · 7 words or fewer</span>
          <button className="btn sm ai" onClick=${writeTitles} disabled=${busy === 'titles' || t0.every(Boolean)} title=${t0.every(Boolean) ? 'Clear a title to write a new option' : ''}>${busy === 'titles' ? html`<span className="spin"></span>` : html`<${Icon} name="Sparkles" size=${14} />`}Write titles</button></div>
          ${t0.map((t, i) => html`<div key=${i} className=${'topt' + (v.chosen === i ? ' on' : '')} onClick=${() => up({ chosen: i })} role="radio" aria-checked=${v.chosen === i} tabIndex="0" onKeyDown=${(e) => e.key === ' ' && up({ chosen: i })}>
            <span className="radio"></span>
            ${busy === 'titles' && !t ? html`<div className="shimmer grow" style=${{ height: 20 }}></div>` : html`<${Ed} value=${t} ph="Add another title" onChange=${(x) => { const a = t0.slice(); a[i] = x; up({ titles: a }); }} />`}
            <span className=${'cnt' + (t.length > 60 || words(t) > 7 ? ' bad' : '')}>${words(t)}w · ${t.length}/60</span></div>`)}
        </div>
        <div className="blk"><div className="blk-h"><h4>Thumbnail text</h4><span className="faint small">2 to 5 words</span></div>
          <div className="row" style=${{ alignItems: 'flex-start', gap: 16 }}>
            <div className="grow"><${Ed} className="ph-small" value=${v.thumbText} ph="Empty. Type 2 to 5 words, readable at phone size" onChange=${(x) => up({ thumbText: x })} style=${{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }} />
              <div className="small muted" style=${{ marginTop: 10, lineHeight: 1.5 }}>The thumbnail should name one real thing viewers recognise, not repeat the title.</div></div>
            <div className="prev-thumb"><div className="thumb"><${DraftThumb} text=${v.thumbText} seed=${v.id} /></div></div>
          </div></div>
        <div className="blk"><div className="blk-h"><h4>Hook</h4><span className="faint small">The first 10 seconds</span>
          <button className="btn sm ai" onClick=${writeHooks} disabled=${busy === 'hook'}>${busy === 'hook' ? html`<span className="spin"></span>` : html`<${Icon} name="Sparkles" size=${14} />`}Write hooks</button></div>
          ${[['visual', 'Visual', 'Eye', 'What they see first'], ['spoken', 'Spoken', 'Mic', 'The first line you say'], ['onscreen', 'On-screen', 'Type', 'Text on screen']].map(([k, l, ic, ph]) => html`<div key=${k} className="hook-row"><span className="k"><${Icon} name=${ic} size=${14} />${l}</span>
            ${busy === 'hook' && !v.hook[k] ? html`<div className="shimmer" style=${{ height: 20 }}></div>` : html`<${Ed} multiline=${true} value=${v.hook[k]} ph=${ph} onChange=${(x) => up({ hook: Object.assign({}, v.hook, { [k]: x }) })} />`}</div>`)}
        </div>
        <div className="blk"><div className="blk-h"><h4>Why it gets watched</h4></div>
          <div className="dgs">${[['demand', 'Demand'], ['gap', 'Gap'], ['show', 'Easy to show']].map(([k, l]) => html`<div key=${k} className="dgs-row"><span className="k muted" style=${{ fontSize: 13, paddingTop: 3 }}>${l}</span>
            <span className="lvl-pick" role="radiogroup" aria-label=${l}>${['high', 'mid', 'low'].map((lv) => html`<button key=${lv} role="radio" aria-checked=${v[k].level === lv} className=${(v[k].level === lv ? 'on ' : '') + lv} onClick=${() => up({ [k]: Object.assign({}, v[k], { level: lv }) })}>${{ high: 'High', mid: 'Mid', low: 'Low' }[lv]}</button>`)}</span>
            <${Ed} multiline=${true} value=${v[k].note} ph="Why you think so" onChange=${(x) => up({ [k]: Object.assign({}, v[k], { note: x }) })} style=${{ fontSize: 13.5, color: 'var(--text-2)' }} /></div>`)}</div></div>
        <div className="blk"><div className="blk-h"><h4>Angle</h4></div><${Ed} multiline=${true} value=${v.angle} ph="What this video does that others don't" onChange=${(x) => up({ angle: x })} style=${{ lineHeight: 1.55 }} /></div>
        <div className="blk"><div className="blk-h"><h4>Twist</h4></div><${Ed} multiline=${true} value=${v.twist} ph="The unexpected part" onChange=${(x) => up({ twist: x })} style=${{ lineHeight: 1.55 }} /></div>
      </section>

      <section className="scn" aria-label="Scenes">
        <div className="doc-h"><${Icon} name="Layers" size=${18} /><h2>Scenes</h2>${v.scenes.length > 0 && html`<span className="chip">${v.scenes.length}</span>`}
          <span className="grow"></span>
          ${v.scenes.length > 0 && html`<button className="btn sm ai" onClick=${writeAll} disabled=${busy === 'script'}>${busy === 'script' ? html`<span className="spin"></span>` : html`<${Icon} name="FileText" size=${14} />`}Write full script</button>`}
        </div>
        <div className="row" style=${{ marginBottom: 18, gap: 14 }}>
          <span className="doc-sub" style=${{ margin: 0, whiteSpace: 'nowrap' }}>Talk through each one when you record.</span><span className="grow"></span>
          ${v.scenes.length > 0 && html`<div className="len" style=${{ whiteSpace: 'nowrap' }}><span className="tnum"><b style=${{ color: over ? 'var(--warn)' : 'var(--text)' }}>${fmtClock(tot)}</b> of</span>
            <select className="select" style=${{ height: 26, fontSize: 12.5 }} value=${v.target} onChange=${(e) => up({ target: +e.target.value })} aria-label="Target length">${[480, 600, 720, 900, 1200].map((s) => html`<option key=${s} value=${s}>${s / 60} min</option>`)}</select>
            <span className="bar" style=${{ width: 110 }}><i className=${over ? 'over' : ''} style=${{ width: Math.min(100, (tot / v.target) * 100) + '%' }}></i></span></div>`}
        </div>
        ${!v.scenes.length ? html`<div className="card">${busy === 'draft' ? html`<div style=${{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>${[0, 1, 2, 3].map((i) => html`<div key=${i} className="shimmer" style=${{ height: 74 }}></div>`)}</div>`
          : html`<${Empty} icon="Layers" title="No scenes yet" action=${html`<button className="btn primary" onClick=${draft}><${Icon} name="Wand2" size=${15} />Draft scenes from board</button>`}>Claude reads the board and the package, then writes 4 to 7 scenes with talking points. You can edit every word.</${Empty}>`}</div>`
          : v.scenes.map((s, i) => html`<div key=${s.id} ref=${(el) => (refs.current[i] = el)} className=${'card scene' + (focus === i ? ' focus' : '') + (dragI === i ? ' dragging' : '') + (overI === i && dragI !== null && dragI !== i ? ' drop-before' : '')}
              onClick=${() => setFocus(i)}>
            <div className="scene-h">
              <button className="grip" aria-label="Drag to reorder, or use the arrow keys" onPointerDown=${(e) => onGrip(e, i)} onClick=${(e) => e.stopPropagation()}
                onKeyDown=${(e) => { if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); move(i, i - 1); } if (e.key === 'ArrowDown' && i < v.scenes.length - 1) { e.preventDefault(); move(i, i + 2); } }}><${Icon} name="GripVertical" size=${15} /></button>
              <span className="n">${i + 1}</span>
              <${Ed} className="t" value=${s.title} ph="Scene title" onChange=${(x) => setScene(i, { title: x })} />
              <${SceneStatus} s=${s} v=${v} />
              <input className="dur" defaultValue=${fmtClock(s.dur)} key=${s.id + s.dur} aria-label="Scene length" onClick=${(e) => e.stopPropagation()} onBlur=${(e) => { const d = parseClock(e.target.value); if (d) setScene(i, { dur: d }); else e.target.value = fmtClock(s.dur); }} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />
              <span onClick=${(e) => e.stopPropagation()}><${Menu} align="right" button=${(t) => html`<button className="btn ghost sm icon-only" onClick=${t} aria-label="Scene options"><${Icon} name="MoreHorizontal" size=${15} /></button>`}
                items=${[{ label: s.script ? 'Write the script again' : 'Write script for this scene', icon: 'FileText', fn: () => setScene(i, { script: writeScript(s) }) }, { label: 'Add scene before', icon: 'ArrowUp', fn: () => addScene(i) }, { label: 'Add scene after', icon: 'ArrowDown', fn: () => addScene(i + 1) }, { label: 'Record this scene', icon: 'Mic', fn: () => { advance(st, v, 'recording'); st.setRecScene(v.id, i); go(`video/${v.id}/record`); } }, '-', { label: 'Delete scene', icon: 'Trash2', danger: true, fn: () => delScene(i) }]} /></span>
            </div>
            <ul className="pts">${s.points.map((p, k) => html`<li key=${k}><${Ed} value=${p} ph="Talking point" autoFocus=${p === '' && focus === i}
              onChange=${(x) => setScene(i, { points: s.points.map((q, m) => m === k ? x : q).filter((q, m) => q !== '' || m === k) })}
              onEnter=${() => { const pts = s.points.slice(); pts.splice(k + 1, 0, ''); setScene(i, { points: pts }); }} /></li>`)}</ul>
            <div className="scene-show"><${Icon} name="Monitor" size=${14} /><span className="faint" style=${{ flex: 'none' }}>Show</span><${Ed} value=${s.show} ph="What's on screen" onChange=${(x) => setScene(i, { show: x })} style=${{ flex: 1 }} /></div>
            ${(s.script || busy === 'script') && html`<div className="script">${s.script ? html`<${Ed} multiline=${true} value=${s.script} onChange=${(x) => setScene(i, { script: x })} />` : html`<div className="shimmer" style=${{ height: 44 }}></div>`}</div>`}
          </div>`)}
        ${v.scenes.length > 0 && html`<button className="addscene" style=${dragI !== null && overI === v.scenes.length ? { boxShadow: '0 -3px 0 0 var(--accent)' } : null} onClick=${() => addScene(v.scenes.length)}><${Icon} name="Plus" size=${15} />Add scene</button>`}
      </section>
    </div>`;
  }

  // ---------- Record ----------
  function Record({ v }) {
    const st = useStore();
    const firstOpen = v.scenes.findIndex((s) => !s.takes.some((t) => t.kept));
    const [cur, setCur] = useState(() => (st.recScene[v.id] != null ? st.recScene[v.id] : firstOpen < 0 ? 0 : firstOpen));
    const [phase, setPhase] = useState('idle'); // idle | count | live
    const [count, setCount] = useState(3);
    const [elapsed, setElapsed] = useState(0);
    const [pt, setPt] = useState(0);
    const [prev, setPrev] = useState(null); // {scene, n, fresh}
    const [srcs, setSrcs] = useState({ cam: true, mic: true, screen: true });
    const [size, setSize] = useState(21);
    const [lvl, setLvl] = useState([4, 7, 5, 9, 6]);
    const startRef = useRef(0);
    const s = v.scenes[cur];
    useEffect(() => { setPt(0); }, [cur]);
    useEffect(() => { const t = setInterval(() => setLvl(Array.from({ length: 5 }, () => 3 + Math.round(Math.random() * (phase === 'live' ? 11 : 5)))), 140); return () => clearInterval(t); }, [phase]);
    useEffect(() => {
      if (phase === 'count') { if (count === 0) { setPhase('live'); startRef.current = Date.now(); setElapsed(0); return; } const t = setTimeout(() => setCount((c) => c - 1), 800); return () => clearTimeout(t); }
      if (phase === 'live') { const t = setInterval(() => { const e = (Date.now() - startRef.current) / 1000; setElapsed(e); setPt(Math.min(s.points.length - 1, Math.floor(e / 4))); }, 200); return () => clearInterval(t); }
    }, [phase, count]);
    const start = () => { if (!s) return; setCount(3); setPhase('count'); setPt(0); };
    const stop = () => {
      const dur = Math.max(4, Math.round(elapsed));
      const n = s.takes.reduce((a, t) => Math.max(a, t.n), 0) + 1;
      const scenes = v.scenes.map((x, j) => j === cur ? Object.assign({}, x, { takes: x.takes.concat({ n, dur, kept: false }) }) : x);
      st.updateVideo(v.id, { scenes }); advance(st, v, 'recording');
      setPhase('idle'); setPrev({ scene: cur, n, fresh: true });
    };
    useEffect(() => {
      const k = (e) => { if (prev || /INPUT|TEXTAREA/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return; if (e.key === 'r' || e.key === 'R') { e.preventDefault(); phase === 'live' ? stop() : phase === 'idle' && start(); } };
      window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
    });
    if (!v.scenes.length) return html`<div className="page"><div className="card"><${Empty} icon="Mic" title="Plan the scenes first" action=${html`<a className="btn primary" href=${`#/video/${v.id}/plan`}><${Icon} name="Layers" size=${15} />Open plan</a>`}>Recording goes scene by scene, with your talking points as a teleprompter. Draft the scenes in Plan, then come back.</${Empty}></div></div>`;
    const allKept = v.scenes.every((x) => x.takes.some((t) => t.kept));
    const keep = (sceneI, n) => {
      const scenes = v.scenes.map((x, j) => j === sceneI ? Object.assign({}, x, { takes: x.takes.map((t) => Object.assign({}, t, { kept: t.n === n })) }) : x);
      st.updateVideo(v.id, { scenes }); setPrev(null);
      const nxt = scenes.findIndex((x) => !x.takes.some((t) => t.kept));
      st.toast(`Kept take ${n} for ${v.scenes[sceneI].title}`);
      if (nxt >= 0) setCur(nxt); else st.toast('All scenes recorded. Continue to editing when you\'re ready.');
    };
    const del = (sceneI, n) => {
      const before = v.scenes;
      st.updateVideo(v.id, { scenes: v.scenes.map((x, j) => j === sceneI ? Object.assign({}, x, { takes: x.takes.filter((t) => t.n !== n) }) : x) });
      setPrev(null); st.toast(`Deleted take ${n}`, { undo: () => st.updateVideo(v.id, { scenes: before }) });
    };
    return html`<div style=${{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="rstrip" role="list" aria-label="Scenes and takes">${v.scenes.map((x, i) => html`<div key=${x.id} role="listitem" className=${'rscene' + (i === cur ? ' on' : '')} onClick=${() => phase === 'idle' && setCur(i)} tabIndex="0" onKeyDown=${(e) => e.key === 'Enter' && phase === 'idle' && setCur(i)}>
        <div className="top"><span className="n" style=${{ width: 20, height: 20, borderRadius: 6, background: 'var(--bg-sunk)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>${i + 1}</span><span className="t">${x.title}</span></div>
        <div className="row" style=${{ justifyContent: 'space-between' }}><${SceneStatus} s=${x} v=${v} /><span className="faint small tnum">${fmtClock(x.dur)}</span></div>
        <div className="takes">${x.takes.map((t) => html`<button key=${t.n} className=${'take' + (t.kept ? ' kept' : '')} onClick=${(e) => { e.stopPropagation(); setCur(i); setPrev({ scene: i, n: t.n }); }} aria-label=${`Take ${t.n}${t.kept ? ', kept' : ''}`} title=${`Take ${t.n} · ${fmtClock(t.dur)}`}>
          <${Frame} seed=${(i * 3 + t.n) % 7} /><span className="tl">${fmtClock(t.dur)}</span></button>`)}
          <button className="addtake" onClick=${(e) => { e.stopPropagation(); setCur(i); setTimeout(start, 0); }} aria-label=${'Record a take of ' + x.title} title="Record a take"><${Icon} name="Plus" size=${15} /></button></div>
      </div>`)}</div>
      <div className="rec" style=${{ flex: 1, minHeight: 0 }}>
        <div className="rec-left">
          <div className=${'stage' + (phase === 'live' ? ' live' : '')}>
            <${Frame} seed=${cur} caption=${phase === 'live' && srcs.cam ? null : null} />
            ${!srcs.screen && html`<div style=${{ position: 'absolute', inset: 0, background: '#1b1a19', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bcb7af', fontSize: 14 }}>Screen is off</div>`}
            ${phase === 'count' && html`<div className="countdown"><span key=${count}>${count || ''}</span></div>`}
            ${phase === 'live' && html`<div className="livebadge"><i></i>REC ${fmtClock(elapsed)}<span style=${{ opacity: .7, fontWeight: 500 }}> / ${fmtClock(s.dur)}</span></div>`}
          </div>
          <div className="rec-bar">
            <div className="srcs">
              ${[['cam', 'Camera', 'Camera'], ['mic', 'Microphone', 'Mic'], ['screen', 'Screen', 'Monitor']].map(([k, l, ic]) => html`<button key=${k} className=${'srcb' + (srcs[k] ? '' : ' off')} onClick=${() => setSrcs(Object.assign({}, srcs, { [k]: !srcs[k] }))} aria-pressed=${srcs[k]} title=${srcs[k] ? `Turn ${l.toLowerCase()} off` : `Turn ${l.toLowerCase()} on`}>
                <span className="ok"></span><${Icon} name=${ic} size=${15} />${l}${k === 'mic' && srcs.mic && html`<span className="meter">${lvl.map((h, i) => html`<i key=${i} style=${{ height: h }}></i>`)}</span>`}</button>`)}
            </div>
            ${phase === 'live' ? html`<button className="recbtn stop" onClick=${stop}><span className="dot"></span>Stop<span className="kbd" style=${{ background: 'transparent', color: '#cfcac2', borderColor: '#4a4844' }}>R</span></button>`
              : html`<button className="recbtn" onClick=${start} disabled=${phase === 'count'}><span className="dot"></span>${s.takes.length ? `Record take ${s.takes.reduce((a, t) => Math.max(a, t.n), 0) + 1}` : `Record scene ${cur + 1}`}<span className="kbd" style=${{ background: 'transparent', color: '#ffe1e2', borderColor: 'rgba(255,255,255,.35)' }}>R</span></button>`}
          </div>
          ${allKept ? html`<div className="warncard"><${Icon} name="CircleCheck" size=${16} />All ${v.scenes.length} scenes have a kept take. Continue to editing, or record another take of any scene.</div>`
            : !srcs.cam || !srcs.mic ? html`<div className="warncard" style=${{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><${Icon} name="TriangleAlert" size=${16} />${!srcs.mic ? 'The microphone is off. Turn it on above before recording.' : 'The camera is off. This take will be screen only.'}</div>`
            : html`<div className="warncard"><${Icon} name="CircleCheck" size=${16} />Camera, microphone and screen are ready · 212 GB free</div>`}
        </div>
        <div className="prompter">
          <div className="ph"><span className="n" style=${{ width: 26, height: 26, borderRadius: 7, background: 'var(--bg-sunk)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12.5 }}>${cur + 1}</span>
            <div className="grow" style=${{ minWidth: 0 }}><div style=${{ fontWeight: 650 }} className="ellipsis">${s.title}</div><div className="small faint">Talking points · about ${fmtMS(s.dur)}</div></div>
            <button className="btn ghost sm icon-only" aria-label="Smaller text" onClick=${() => setSize((z) => Math.max(16, z - 2))}><${Icon} name="AArrowDown" size=${16} /></button>
            <button className="btn ghost sm icon-only" aria-label="Bigger text" onClick=${() => setSize((z) => Math.min(30, z + 2))}><${Icon} name="AArrowUp" size=${16} /></button>
          </div>
          <div className="pb">
            ${s.points.map((p, i) => html`<div key=${i} className=${'tp' + (i === pt ? ' cur' : i < pt ? ' done' : '')} style=${{ fontSize: size }} onClick=${() => setPt(i)}>${p}</div>`)}
            ${s.show && html`<div className="tp-show"><${Icon} name="Monitor" size=${15} style=${{ marginTop: 2, flex: 'none' }} /><span><b style=${{ color: 'var(--text)' }}>Show:</b> ${s.show}</span></div>`}
            ${s.script && html`<details style=${{ marginTop: 14 }}><summary className="small muted" style=${{ cursor: 'pointer' }}>Full script for this scene</summary><div className="script" style=${{ margin: '8px 0 0' }}>${s.script}</div></details>`}
          </div>
        </div>
      </div>
      ${prev && v.scenes[prev.scene] && v.scenes[prev.scene].takes.find((t) => t.n === prev.n) && html`<${TakePreview} v=${v} sceneI=${prev.scene} take=${v.scenes[prev.scene].takes.find((t) => t.n === prev.n)} fresh=${prev.fresh}
        onClose=${() => setPrev(null)} onDelete=${() => del(prev.scene, prev.n)} onAgain=${() => { setPrev(null); setCur(prev.scene); setTimeout(start, 50); }} onKeep=${() => keep(prev.scene, prev.n)} />`}
    </div>`;
  }
  function TakePreview({ v, sceneI, take, fresh, onClose, onDelete, onAgain, onKeep }) {
    const [t, setT] = useState(0);
    const [play, setPlay] = useState(fresh);
    useEffect(() => { if (!play) return; const i = setInterval(() => setT((x) => { if (x + 0.25 >= take.dur) { setPlay(false); return take.dur; } return x + 0.25; }), 250); return () => clearInterval(i); }, [play]);
    const s = v.scenes[sceneI];
    const point = s.points[Math.min(s.points.length - 1, Math.floor((t / take.dur) * s.points.length))];
    return html`<${Dialog} className="tprev" onClose=${onClose} title=${html`<span className="row" style=${{ gap: 10 }}>Take ${take.n}${take.kept && html`<span className="badge-ok"><${Icon} name="Check" size=${12} stroke=${3} />KEPT</span>`}<span className="faint small" style=${{ fontWeight: 500 }}>Scene ${sceneI + 1} · ${s.title}</span></span>`}
      footer=${html`<${Fragment}><button className="btn ghost danger-text" onClick=${onDelete} style=${{ marginRight: 'auto' }}><${Icon} name="Trash2" size=${15} />Delete take</button>
        <button className="btn" onClick=${onAgain}><${Icon} name="RotateCcw" size=${15} />Record another take</button>
        <button className="btn primary" autoFocus onClick=${onKeep}>Continue<${Icon} name="ChevronRight" size=${15} /></button><//>`}>
      <div className="pv" onClick=${() => setPlay(!play)} style=${{ cursor: 'pointer' }}><${Frame} seed=${(sceneI * 3 + take.n) % 7} caption=${point} />
        ${!play && html`<div style=${{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style=${{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}><${Icon} name="Play" size=${22} style=${{ marginLeft: 3, color: '#151413' }} /></span></div>`}</div>
      <div className="scrub">
        <button className="btn ghost sm icon-only" onClick=${() => setPlay(!play)} aria-label=${play ? 'Pause' : 'Play'}><${Icon} name=${play ? 'Pause' : 'Play'} size=${15} /></button>
        <button className="btn ghost sm" onClick=${() => setT((x) => Math.max(0, x - 5))}>−5s</button>
        <span>${fmtClock(t)}</span>
        <div className="track" onClick=${(e) => { const r = e.currentTarget.getBoundingClientRect(); setT(((e.clientX - r.left) / r.width) * take.dur); }}><i style=${{ width: (t / take.dur) * 100 + '%' }}></i></div>
        <span>${fmtClock(take.dur)}</span>
        <button className="btn ghost sm" onClick=${() => setT((x) => Math.min(take.dur, x + 5))}>+5s</button>
      </div>
      <div className="small muted" style=${{ marginTop: 10 }}>${take.kept ? 'This is the take used in the edit.' : 'Continue keeps this take for the edit and moves to the next scene.'}</div>
    <//>`;
  }

  // ---------- Edit ----------
  function buildEditModel(v) {
    const auth = C.TRANSCRIPT[v.id];
    const scenes = v.scenes.map((s, i) => {
      const kept = s.takes.find((t) => t.kept) || s.takes[0] || { dur: s.dur };
      let segs = auth && auth[i] ? auth[i] : s.points.flatMap((p, k) => [[p.replace(/^"|"$/g, '')], { p: 1.2 + ((i + k) % 4) * 0.9 }]).concat(s.points[0] ? [{ r: s.points[0].split(' ').slice(0, 4).join(' ') }] : []);
      const cut = s.cut || Math.round(kept.dur * 0.22);
      const items = segs.map((g, k) => Array.isArray(g) ? { k, text: g[0] } : g.p != null ? { k, pause: g.p, w: g.p } : { k, rep: g.r, w: g.r.split(' ').length * 0.45 });
      const wsum = items.reduce((a, x) => a + (x.w || 0), 0) || 1;
      items.forEach((x) => { if (x.w) x.sec = (x.w / wsum) * cut; });
      return { i, title: s.title, raw: kept.dur, cut, items };
    });
    return scenes;
  }
  function Edit({ v, focus, setFocus }) {
    const st = useStore();
    const model = useMemo(() => buildEditModel(v), [v.scenes]);
    const [review, setReview] = useState(false);
    const [keepSet, setKeepSet] = useState({});
    const [t, setT] = useState(0);
    const [play, setPlay] = useState(false);
    const [panel, setPanel] = useState(null);
    const [captions, setCaptions] = useState(true);
    const [layout, setLayout] = useState('bubble');
    const removed = v.edit.removed;
    if (!v.scenes.length || !v.scenes.some((s) => s.takes.length)) return html`<div className="page"><div className="card"><${Empty} icon="Scissors" title="Nothing recorded yet" action=${html`<a className="btn primary" href=${`#/video/${v.id}/record`}><${Icon} name="Mic" size=${15} />Open record</a>`}>Record at least one take per scene, then the edit is built for you, scene by scene.</${Empty}></div></div>`;
    const cutOf = (sc) => sc.items.filter((x) => x.sec && !keepSet[sc.i + ':' + x.k]).reduce((a, x) => a + x.sec, 0);
    const totalCut = Math.round(model.reduce((a, sc) => a + cutOf(sc), 0));
    const nCuts = model.reduce((a, sc) => a + sc.items.filter((x) => x.sec && !keepSet[sc.i + ':' + x.k]).length, 0);
    const nP = model.reduce((a, sc) => a + sc.items.filter((x) => x.pause && !keepSet[sc.i + ':' + x.k]).length, 0);
    const lens = model.map((sc) => sc.raw - (removed ? cutOf(sc) : 0));
    const total = lens.reduce((a, b) => a + b, 0);
    const starts = lens.reduce((a, l, i) => a.concat((a[i] || 0) + l), [0]);
    const curScene = Math.max(0, starts.findIndex((s0, i) => t >= s0 && t < (starts[i + 1] || Infinity)));
    useEffect(() => { if (focus != null && starts[focus] != null) setT(starts[focus] + 0.01); }, [focus]);
    useEffect(() => { if (!play) return; const i = setInterval(() => setT((x) => (x + 0.5 >= total ? (setPlay(false), total) : x + 0.5)), 500); return () => clearInterval(i); }, [play, total]);
    useEffect(() => { const k = (e) => { if (e.key === ' ' && !/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); setPlay((p) => !p); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
    const sc = model[curScene];
    const textItems = sc ? sc.items.filter((x) => x.text) : [];
    const within = sc ? (t - starts[curScene]) / lens[curScene] : 0;
    const nowItem = textItems[Math.min(textItems.length - 1, Math.floor(within * textItems.length))];
    const doRemove = () => { const c = totalCut; st.updateVideo(v.id, { edit: Object.assign({}, v.edit, { removed: true, cutTotal: c }), scenes: v.scenes.map((s, i) => Object.assign({}, s, { cut: Math.round(cutOf(model[i])) })) }); setReview(false); setT(0); };
    const undo = () => st.updateVideo(v.id, { edit: Object.assign({}, v.edit, { removed: false }) });
    const seek = (e) => { const r = e.currentTarget.getBoundingClientRect(); setT(Math.max(0, Math.min(total, ((e.clientX - r.left) / r.width) * total))); };
    const ticks = []; const step = total > 600 ? 120 : 60; for (let x = 0; x <= total; x += step) ticks.push(x);
    const HUES = ['#e8effd', '#f1ecfc', '#fdeced', '#fdf0e1', '#e6f4ec', '#fdf3dc', '#e7f3f8'];
    const HTX = ['#1d4ed8', '#6d3fc2', '#b4313a', '#a3520a', '#18794e', '#8a5a00', '#0e6b84'];
    const removedLabel = fmtMS(v.edit.cutTotal || totalCut);
    const PANELS = { layout: 'Layout', captions: 'Captions', zoom: 'Zoom', music: 'Music', claude: 'Ask Claude' };
    return html`<div className="edit">
      <div className="erail">${[['layout', 'LayoutTemplate'], ['captions', 'Captions'], ['zoom', 'ZoomIn'], ['music', 'Music'], ['claude', 'Sparkles']].map(([k, ic]) => html`<button key=${k} className=${panel === k ? 'on' : ''} onClick=${() => setPanel(panel === k ? null : k)} aria-label=${PANELS[k]} title=${PANELS[k]}><${Icon} name=${ic} size=${18} /></button>`)}</div>
      <div className="ecenter">
        ${panel && html`<div className="card epanel"><div className="row" style=${{ marginBottom: 10 }}><b>${PANELS[panel]}</b><button className="btn ghost sm icon-only" style=${{ marginLeft: 'auto' }} onClick=${() => setPanel(null)} aria-label="Close panel"><${Icon} name="X" size=${14} /></button></div>
          ${panel === 'layout' && [['bubble', 'Screen with camera bubble'], ['screen', 'Screen only'], ['cam', 'Camera only']].map(([k, l]) => html`<label key=${k} className="row" style=${{ padding: '6px 0', fontSize: 13.5, cursor: 'pointer' }}><input type="radio" name="layout" checked=${layout === k} onChange=${() => setLayout(k)} />${l}</label>`)}
          ${panel === 'captions' && html`<label className="row" style=${{ fontSize: 13.5, cursor: 'pointer' }}><input type="checkbox" checked=${captions} onChange=${(e) => setCaptions(e.target.checked)} />Show captions</label><div className="small muted" style=${{ marginTop: 8 }}>Burned in on export, made from the transcript.</div>`}
          ${panel === 'zoom' && html`<label className="row" style=${{ fontSize: 13.5, cursor: 'pointer' }}><input type="checkbox" defaultChecked=${true} />Zoom in on clicks</label><div className="small muted" style=${{ marginTop: 8 }}>Follows your cursor when you click on screen.</div>`}
          ${panel === 'music' && html`<select className="select" style=${{ width: '100%' }} defaultValue="none" aria-label="Music"><option value="none">No music</option><option>Calm, low under the voice</option><option>Upbeat intro only</option></select>`}
          ${panel === 'claude' && html`<div className="small" style=${{ lineHeight: 1.55, color: 'var(--text-2)' }}>Scene ${lens.indexOf(Math.max(...lens)) + 1} is the longest at ${fmtClock(Math.max(...lens))}. Its second half repeats the rule from scene 3, so you could trim about 20 seconds there.</div>`}
        </div>`}
        <div className="stage" style=${{ flex: 1, minHeight: 0 }}>
          ${layout === 'cam' ? html`<div className="frame"><div className="cam" style=${{ right: '30%', bottom: '10%', width: '40%' }}></div></div>` : html`<${Frame} seed=${curScene} />`}
          ${layout === 'screen' && html`<style>.ecenter .frame .cam{display:none}</style>`}
          ${captions && nowItem && html`<div className="frame" style=${{ background: 'none', pointerEvents: 'none' }}><div className="cap">${nowItem.text.split(' ').slice(0, 12).join(' ')}${nowItem.text.split(' ').length > 12 ? '…' : ''}</div></div>`}
        </div>
        <div className="transport">
          <button className="play" onClick=${() => setPlay(!play)} aria-label=${play ? 'Pause' : 'Play'}><${Icon} name=${play ? 'Pause' : 'Play'} size=${16} style=${play ? null : { marginLeft: 2 }} /></button>
          <span className="tnum"><b style=${{ color: 'var(--text)' }}>${fmtClock(t)}</b> / ${fmtClock(total)}</span>
          <span className="faint">·</span><span>Scene ${curScene + 1}: ${sc && sc.title}</span>
        </div>
      </div>
      <aside className="eright" aria-label="Transcript">
        ${removed ? html`<div className="donebar"><${Icon} name="CircleCheck" size=${16} />Removed ${removedLabel} of pauses and repeats<button className="linkish" onClick=${undo}>Undo</button></div>`
          : review ? html`<div className="sugg-card"><h4>Review ${nCuts} cuts · ${fmtMS(totalCut)}</h4><p>Highlighted in the transcript and the timeline. Click one to keep it.</p><div className="row"><button className="btn primary" onClick=${doRemove}><${Icon} name="Scissors" size=${15} />Remove them</button><button className="btn ghost" onClick=${() => setReview(false)}>Cancel</button></div></div>`
          : html`<div className="sugg-card"><h4>Remove ${fmtMS(totalCut)} of pauses and repeats?</h4><p>Found ${nP} long pauses and ${nCuts - nP} repeated lines across ${model.length} scenes. Nothing is deleted from your takes.</p><div className="row"><button className="btn primary" onClick=${doRemove}><${Icon} name="Scissors" size=${15} />Remove them</button><button className="btn" onClick=${() => setReview(true)}>Review first</button></div></div>`}
        <div className=${'tscript' + (review ? ' review' : '') + (removed ? ' removed' : '')}>
          ${model.map((m) => html`<div key=${m.i} className="tsec">
            <div className="tsec-h"><span className="n" style=${{ width: 20, height: 20, borderRadius: 6, background: HUES[m.i % 7], color: HTX[m.i % 7], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>${m.i + 1}</span>${m.title}<span className="grow"></span><${SceneStatus} s=${v.scenes[m.i]} v=${v} /></div>
            <div className="tline">${m.items.map((x) => {
              const kk = m.i + ':' + x.k; const kept = keepSet[kk];
              if (x.text) return html`<span key=${x.k} className=${'tseg' + (x === nowItem && m.i === curScene ? ' now' : '')} onClick=${() => { const ti = m.items.filter((y) => y.text).indexOf(x); setT(starts[m.i] + (ti / Math.max(1, m.items.filter((y) => y.text).length)) * lens[m.i] + 0.01); }}>${x.text} </span>`;
              if (x.pause) return html`<span key=${x.k} className=${'tpause' + (kept ? ' kept' : '')} style=${kept ? { background: 'var(--bg-sunk)', color: 'var(--text-3)', textDecoration: 'line-through' } : null} title=${review ? (kept ? 'Kept. Click to cut it.' : 'Will be cut. Click to keep it.') : 'Pause'} onClick=${() => review && setKeepSet(Object.assign({}, keepSet, { [kk]: !kept }))}>${x.pause.toFixed(1)}s</span>`;
              return html`<span key=${x.k} className=${'trep' + (kept ? ' kept' : '')} style=${kept ? { background: 'none' } : null} title=${review ? (kept ? 'Kept' : 'Repeated line. Click to keep it.') : 'Repeated line'} onClick=${() => review && setKeepSet(Object.assign({}, keepSet, { [kk]: !kept }))}><s style=${{ textDecorationColor: 'rgba(0,0,0,.35)', color: 'var(--text-3)' }}>${x.rep}</s> </span>`;
            })}</div>
          </div>`)}
        </div>
      </aside>
      <div className="timeline">
        <div className="tl-tools">
          <b style=${{ fontSize: 13 }}>Timeline</b><span className="faint small tnum">${fmtClock(total)}${removed ? ` · was ${fmtClock(model.reduce((a, m) => a + m.raw, 0))}` : ''}</span>
          <span className="grow"></span>
          <span className="small muted row" style=${{ gap: 6 }}><span style=${{ width: 14, height: 10, borderRadius: 2, background: 'repeating-linear-gradient(135deg, rgba(229,72,77,.4) 0 3px, rgba(229,72,77,.12) 3px 6px)' }}></span>${removed ? 'Pauses removed' : 'Pauses and repeats'}</span>
        </div>
        <div className="tl-wrap">
          <div className="ruler">${ticks.map((x) => html`<span key=${x} style=${{ left: (x / total) * 100 + '%' }}>${fmtClock(x)}</span>`)}</div>
          <div className="track" style=${{ height: 26 }}><span className="track-lab">SCENES</span><div className="lane" onClick=${seek}>
            ${model.map((m, i) => html`<div key=${m.i} className="seg-scene" style=${{ left: (starts[i] / total) * 100 + '%', width: `calc(${(lens[i] / total) * 100}% - 2px)`, background: HUES[i % 7], color: HTX[i % 7] }} title=${m.title}>${i + 1} · ${m.title}</div>`)}
          </div></div>
          <div className="track"><span className="track-lab">SCREEN</span><div className="lane" onClick=${seek}>
            ${model.map((m, i) => html`<div key=${m.i} className="clip screen" style=${{ left: (starts[i] / total) * 100 + '%', width: `calc(${(lens[i] / total) * 100}% - 2px)` }}>
              ${!removed && m.items.filter((x) => x.sec).map((x, k, arr) => html`<div key=${k} className="cutmark" style=${{ left: (((k + 0.6) / (arr.length + 0.6)) * 100) + '%', width: Math.max(0.6, (x.sec / m.raw) * 100) + '%', opacity: keepSet[m.i + ':' + x.k] ? 0.15 : review ? 1 : 0.75 }}></div>`)}
            </div>`)}
          </div></div>
          <div className="track"><span className="track-lab">CAMERA</span><div className="lane" onClick=${seek}>
            ${model.map((m, i) => html`<div key=${m.i} className="clip cam" style=${{ left: (starts[i] / total) * 100 + '%', width: `calc(${(lens[i] / total) * 100}% - 2px)` }}>
              <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 30" aria-hidden="true">${Array.from({ length: 50 }, (_, k) => { const h = 4 + ((hash(m.i * 97 + k * 13) % 100) / 100) * 20; return html`<rect key=${k} x=${k * 2 + 0.3} y=${15 - h / 2} width="1.2" height=${h} rx="0.5" fill="currentColor" style=${{ color: '#7fb48f' }} />`; })}</svg>
              ${!removed && m.items.filter((x) => x.sec).map((x, k, arr) => html`<div key=${k} className="cutmark" style=${{ left: (((k + 0.6) / (arr.length + 0.6)) * 100) + '%', width: Math.max(0.6, (x.sec / m.raw) * 100) + '%', opacity: keepSet[m.i + ':' + x.k] ? 0.15 : review ? 1 : 0.75 }}></div>`)}
            </div>`)}
          </div></div>
          <div className="playhead" style=${{ left: (t / total) * 100 + '%', top: 14 }}></div>
        </div>
      </div>
    </div>`;
  }

  // ---------- Publish ----------
  function Publish({ v }) {
    const st = useStore();
    const p = v.publish;
    const up = (x) => st.updateVideo(v.id, { publish: Object.assign({}, v.publish, x) });
    const [prog, setProg] = useState(null);
    const [link, setLink] = useState(p.link || '');
    const [err, setErr] = useState('');
    const desc = useMemo(() => p.desc || description(v, st.channel), [v.scenes, v.hook, v.angle, p.desc, v.edit.removed]);
    useEffect(() => {
      if (v.stage !== 'published' || v.own) return;
      const i = setInterval(() => { const cur = v.publish.views || 0; if (cur > 30000) return; st.updateVideo(v.id, (x) => ({ publish: Object.assign({}, x.publish, { views: (x.publish.views || 0) + 40 + Math.round(Math.random() * 160), hist: (x.publish.hist || []).concat((x.publish.views || 0)).slice(-24) }) })); }, 1300);
      return () => clearInterval(i);
    }, [v.stage]);
    if (v.own) return html`<div className="pub">
      <div className="card" style=${{ padding: 20, display: 'grid', gridTemplateColumns: '300px 1fr', gap: 22 }}>
        <${Thumb} v=${v} />
        <div><${StagePill} stage="published" /><div style=${{ fontWeight: 650, fontSize: 18, letterSpacing: '-0.015em', margin: '10px 0 14px', lineHeight: 1.3 }}>${v.title}</div>
          <div className="row" style=${{ gap: 10, alignItems: 'baseline' }}><span className="bignum">${fmtNum(v.views)}</span><span className="muted">views</span><${MultChip} m=${v.views / D.usualViews} who="you" label=${true} /></div>
          <div className="small muted" style=${{ marginTop: 6 }}>Published ${fmtDate(v.publishedAt)} · your usual is ${fmtNum(D.usualViews)} views</div>
          <a className="btn" style=${{ marginTop: 16 }} href=${'https://www.youtube.com/watch?v=' + v.thumbId} target="_blank" rel="noopener"><${Icon} name="Youtube" size=${15} />Open on YouTube</a></div>
      </div>
      <div className="small muted" style=${{ marginTop: 14, textAlign: 'center' }}>Made before CreatorClub, so its scenes and takes aren't here.</div>
    </div>`;
    if (v.stage !== 'published' && !v.scenes.some((s) => s.takes.length)) return html`<div className="page"><div className="card"><${Empty} icon="Upload" title="Nothing to publish yet" action=${html`<a className="btn primary" href=${`#/video/${v.id}/${v.scenes.length ? 'record' : 'plan'}`}><${Icon} name=${v.scenes.length ? 'Mic' : 'Layers'} size=${15} />${v.scenes.length ? 'Open record' : 'Open plan'}</a>`}>Publishing starts once the scenes are recorded and edited. ${v.scenes.length ? `This video has ${v.scenes.length} scenes waiting to be recorded.` : 'Draft the scenes first.'}</${Empty}></div></div>`;
    const steps = [
      { k: 'export', t: 'Export the video', d: 'The full timeline as an MP4, 1080p.', done: p.exported },
      { k: 'copy', t: 'Copy the title, thumbnail text and description', d: 'Paste them into YouTube Studio as you upload.', done: p.copiedAll },
      { k: 'link', t: 'Upload to YouTube, then paste the link here', d: 'Public, unlisted or scheduled, any link works.', done: !!p.link },
      { k: 'mark', t: 'Mark as published', d: 'The video moves to Published and the date is saved.', done: v.stage === 'published' },
      { k: 'views', t: 'Views', d: 'Checked every hour for the first week.', done: false },
    ];
    const cur = steps.findIndex((s) => !s.done);
    const exportNow = () => { let x = 0; setProg(0); const i = setInterval(() => { x += 4; if (x > 100) { clearInterval(i); setProg(null); up({ exported: true }); st.toast('Exported the video'); } else setProg(x); }, 90); };
    const copy = (k, txt) => { window.CC.copyText(txt); const c = Object.assign({}, p.copied, { [k]: true }); up({ copied: c, copiedAll: c.title && c.thumb && c.desc }); st.toast('Copied ' + { title: 'the title', thumb: 'the thumbnail text', desc: 'the description' }[k]); };
    const saveLink = () => { const id = ytIdFrom(link); if (!id) { setErr("That isn't a YouTube video link. It looks like youtube.com/watch?v=… or youtu.be/…"); return; } setErr(''); up({ link, ytId: id }); };
    const markPublished = () => { st.updateVideo(v.id, { stage: 'published', publishedAt: TODAY, plannedDate: null, publish: Object.assign({}, p, { views: 0, hist: [] }) }); st.toast('Marked as published', { undo: () => st.updateVideo(v.id, { stage: 'publishing', publishedAt: null }) }); };
    const raw = v.scenes.reduce((a, s) => a + ((s.takes.find((t) => t.kept) || {}).dur || s.dur), 0);
    const len = raw - (v.edit.removed ? (v.edit.cutTotal || v.scenes.reduce((a, s) => a + (s.cut || 0), 0)) : 0);
    const slug = chosenTitle(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const hist = p.hist || [];
    const box = (k, body) => html`<div className="card pbox">${body}</div>`;
    return html`<div className="pub">
      <div className="doc-h" style=${{ marginBottom: 4 }}><h2>Publish</h2></div>
      <div className="doc-sub">Upload to YouTube, then paste the link here. CreatorClub never posts for you.</div>
      ${steps.map((s, i) => html`<div key=${s.k} className=${'pstep ' + (s.done ? 'done' : i === cur ? 'on' : 'todo')}>
        <span className="pnum">${s.done ? html`<${Icon} name="Check" size=${16} stroke=${2.6} />` : i + 1}</span>
        <div className="pc">
          <div className="pt">${s.t}${s.done && s.k === 'export' ? html`<span className="faint small" style=${{ fontWeight: 500 }}>${slug}.mp4 · ${(len / 520).toFixed(1)} GB · ${fmtClock(len)}</span>` : null}
            ${s.done && s.k === 'link' ? html`<a className="small" style=${{ color: 'var(--accent-text)', fontWeight: 500 }} href=${p.link} target="_blank" rel="noopener">${p.link.replace(/^https?:\/\/(www\.)?/, '')}</a>` : null}
            ${s.done && s.k === 'mark' ? html`<span className="faint small" style=${{ fontWeight: 500 }}>${fmtDate(v.publishedAt)}</span>` : null}</div>
          ${!s.done && html`<div className="pd">${s.d}</div>`}
          ${i === cur && s.k === 'export' && box(s.k, html`<div>
            ${!v.edit.removed && html`<div className="warncard" style=${{ background: 'var(--warn-soft)', color: 'var(--warn)', marginBottom: 12 }}><${Icon} name="TriangleAlert" size=${16} />Pauses aren't removed yet.<a className="linkish" style=${{ color: 'inherit', textDecoration: 'underline' }} href=${`#/video/${v.id}/edit`}>Remove them in Edit</a>, or export as it is.</div>`}
            ${prog != null ? html`<div><div className="row small muted" style=${{ marginBottom: 8 }}><span className="spin"></span>Exporting ${fmtClock(len)} at 1080p · ${prog}%</div><div className="progress"><i style=${{ width: prog + '%' }}></i></div></div>`
              : html`<div className="row"><button className="btn primary" onClick=${exportNow}><${Icon} name="Download" size=${15} />Export video</button><span className="small muted">${fmtClock(len)} · ${v.scenes.length} scenes · captions on</span></div>`}</div>`)}
          ${s.done && s.k === 'export' && html`<div style=${{ marginTop: 6 }}><button className="linkish" onClick=${() => st.toast('Opened in Finder')}>Show in Finder</button></div>`}
          ${(i === cur || (s.k === 'copy' && cur > 1 && cur < 4)) && s.k === 'copy' && box(s.k, html`<div>
            <div className="copyrow"><span className="k">Title</span><span className="v" style=${{ fontWeight: 600 }}>${chosenTitle(v)}</span><button className="btn sm" onClick=${() => copy('title', chosenTitle(v))}><${Icon} name=${p.copied.title ? 'Check' : 'Copy'} size=${14} />${p.copied.title ? 'Copied' : 'Copy'}</button></div>
            <div className="copyrow"><span className="k">Thumbnail text</span><span className="v">${v.thumbText || html`<span className="faint">No thumbnail text yet. Add it in Plan.</span>`}</span><button className="btn sm" disabled=${!v.thumbText} onClick=${() => copy('thumb', v.thumbText)}><${Icon} name=${p.copied.thumb ? 'Check' : 'Copy'} size=${14} />${p.copied.thumb ? 'Copied' : 'Copy'}</button></div>
            <div className="copyrow"><span className="k">Description</span><textarea className="input" rows="9" value=${desc} onChange=${(e) => up({ desc: e.target.value })} style=${{ fontSize: 13.5 }} aria-label="Description"></textarea><button className="btn sm" onClick=${() => copy('desc', desc)}><${Icon} name=${p.copied.desc ? 'Check' : 'Copy'} size=${14} />${p.copied.desc ? 'Copied' : 'Copy'}</button></div>
            ${i === cur && html`<div style=${{ marginTop: 10 }}><button className="linkish" onClick=${() => up({ copiedAll: true })}>I've filled them in already</button></div>`}</div>`)}
          ${i === cur && s.k === 'link' && box(s.k, html`<div>
            <form className="row" onSubmit=${(e) => { e.preventDefault(); saveLink(); }}><input className="input" value=${link} onChange=${(e) => { setLink(e.target.value); setErr(''); }} placeholder="youtube.com/watch?v=…" aria-label="YouTube link" /><button className="btn primary" type="submit" disabled=${!link.trim()}>Save link</button></form>
            ${err && html`<div className="small" style=${{ color: 'var(--rec)', marginTop: 8 }}>${err}</div>`}
            <a className="btn ghost sm" style=${{ marginTop: 10 }} href="https://studio.youtube.com" target="_blank" rel="noopener"><${Icon} name="ArrowUpRight" size=${14} />Open YouTube Studio</a></div>`)}
          ${i === cur && s.k === 'mark' && box(s.k, html`<div className="row"><button className="btn primary" onClick=${markPublished}><${Icon} name="CircleCheck" size=${15} />Mark as published</button><span className="small muted">You can undo this.</span></div>`)}
          ${s.k === 'views' && v.stage === 'published' && box(s.k, html`<div>
            <div className="row" style=${{ alignItems: 'baseline', gap: 10 }}><span className="bignum">${fmtNum(p.views || 0)}</span><span className="muted">views since ${fmtDate(v.publishedAt)}</span><span className="grow"></span>${st.channel.id === 'samin' ? html`<span className=${'chip mult ' + window.CC.band(Math.max(0.05, (p.views || 0) / (D.usualViews * 0.02)))}>${fmtMult(Math.max(0.05, (p.views || 0) / (D.usualViews * 0.02)))} vs your usual first hours</span>` : null}</div>
            <div className="views-chart" aria-label="Views over time">${Array.from({ length: 24 }, (_, k) => { const val = hist[k] || 0; const mx = Math.max(1, ...hist, p.views || 0); return html`<i key=${k} style=${{ height: (val / mx) * 100 + '%', opacity: val ? .85 : .15 }}></i>`; })}</div>
            <div className="small muted" style=${{ marginTop: 8 }}>${st.channel.id === 'samin' ? 'Compared with your usual first hours. ' : ''}The 7-day result shows here next week.</div></div>`)}
        </div>
      </div>`)}
    </div>`;
  }

  Object.assign(window.CC, { Workspace });
})();
