/* App shell: store, sidebar, routing, palette, toasts. */
(function () {
  const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;
  const { html, D, Icon, fmtNum, buildVideo, initialChannels, STAGES, stageLabel, chosenTitle, defaultTab, progressText, Store, useStore, useRoute, go, Avatar, Thumb, Dialog, Menu, ytIdFrom, trendById, jobsById } = window.CC;

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
  let uid = 0;
  const newId = (p) => p + '-' + Date.now().toString(36) + (uid++);

  function App() {
    const [S, setS] = useState(() => ({ active: 'samin', channels: initialChannels() }));
    const [toasts, setToasts] = useState([]);
    const [theme, setThemeS] = useState(() => lsGet('cc_theme') || 'light');
    const [palette, setPalette] = useState(false);
    const [newOpen, setNewOpen] = useState(false);
    const [help, setHelp] = useState(false);
    const [recScene, setRecSceneS] = useState({});
    const [sbOpen, setSbOpen] = useState(null);
    const route = useRoute();
    const fromRef = useRef({ route: 'production', label: 'Production' });
    const LABELS = { overview: 'Overview', ideas: 'Ideas', trending: 'Working now', signals: 'Signals', production: 'Production', settings: 'Settings' };
    if (LABELS[route.parts[0]]) fromRef.current = { route: route.raw, label: LABELS[route.parts[0]] };
    const ch = S.channels[S.active];
    window.CC_ACTIVE_FIRST = () => (S.channels[S.active].person || S.channels[S.active].name || 'you').split(' ')[0];

    useEffect(() => { document.documentElement.setAttribute('data-theme', theme); lsSet('cc_theme', theme); }, [theme]);
    useEffect(() => { if (!route.parts.length) go(lsGet('cc_onboarded') ? 'overview' : 'welcome'); }, [route.raw]);
    useEffect(() => { setSbOpen(null); const m = document.querySelector('.main'); if (m && route.parts[0] !== 'video') m.scrollTop = 0; }, [route.parts.join('/')]);
    useEffect(() => {
      const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); } };
      window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
    }, []);

    const toast = useCallback((msg, opts = {}) => {
      const id = ++uid;
      setToasts((t) => t.concat({ id, msg, opts }).slice(-3));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.undo || opts.action ? 6000 : 3200);
    }, []);
    const mapVideos = (fn) => setS((s) => { const c = s.channels[s.active]; return Object.assign({}, s, { channels: Object.assign({}, s.channels, { [s.active]: Object.assign({}, c, { videos: fn(c.videos) }) }) }); });
    const updateVideo = useCallback((id, patch) => mapVideos((vs) => vs.map((v) => v.id === id ? Object.assign({}, v, typeof patch === 'function' ? patch(v) : patch, { updatedAt: new Date().toISOString() }) : v)), []);
    const addVideo = (v) => mapVideos((vs) => [v].concat(vs));
    const setStage = (id, stage, silent) => {
      let prevStage;
      mapVideos((vs) => vs.map((v) => { if (v.id !== id) return v; prevStage = v.stage; return Object.assign({}, v, { stage, hidden: stage === 'ideas' ? v.hidden : null, stageDates: Object.assign({}, v.stageDates, { [stage]: new Date().toISOString() }), updatedAt: new Date().toISOString() }); }));
      if (!silent) setTimeout(() => prevStage && prevStage !== stage && toast(`Moved to ${stageLabel(stage)}`, { undo: () => mapVideos((vs) => vs.map((v) => v.id === id ? Object.assign({}, v, { stage: prevStage }) : v)) }), 0);
    };
    const addIdea = (o) => {
      const id = newId('idea');
      addVideo(buildVideo(Object.assign({ id, stage: 'ideas', order: -1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stageDates: { ideas: new Date().toISOString() }, sources: [], why: '', demand: { level: 'mid', note: '' }, gap: { level: 'mid', note: '' }, show: { level: 'mid', note: '' } }, o)));
      return id;
    };
    const ideaFromConcept = (c, job) => {
      const ex = S.channels[S.active].videos.find((v) => v.title === c.title);
      if (ex) return ex.id;
      const id = addIdea({ title: c.title, why: c.why, demand: c.demand, gap: c.gap, show: c.show, angle: c.angle, twist: c.twist, hook: c.hook, timely: c.lane === 'timely', thumbId: job.video.videoId, sources: [{ label: `${job.video.title} (${job.video.channel})`, url: job.video.url, videoId: job.video.videoId }] });
      toast(`Added "${c.title}" to your ideas`, { action: { label: 'Open', fn: () => go('ideas?new=' + id) } });
      return id;
    };
    const ideaFromTrend = (t) => {
      const ex = S.channels[S.active].videos.find((v) => v.thumbId === t.videoId && v.fromTrend);
      if (ex) { go('ideas?new=' + ex.id); return ex.id; }
      const id = addIdea({ title: t.title, fromTrend: true, why: `Working now: ${fmtNum(t.views)} views at ${fmtNum(t.vpd)} a day on ${t.channel}. Make your version with your own twist.`, thumbId: t.videoId, demand: { level: t.vpd > 50000 ? 'high' : 'mid', note: `${fmtNum(t.views)} views in ${Math.max(1, Math.round(t.ageDays))} days on ${t.channel}.` }, sources: [{ label: `${t.title} (${t.channel})`, url: 'https://www.youtube.com/watch?v=' + t.videoId, videoId: t.videoId }] });
      toast('Added to your ideas', { action: { label: 'Open', fn: () => go('ideas?new=' + id) } });
      return id;
    };
    const ideaFromSignal = (s) => {
      const first = s.text.split(/(?<=[.?!])\s/)[0].replace(/https?:\S+/g, '').trim();
      const title = first.length > 70 ? first.slice(0, 67).replace(/\s\S*$/, '') + '…' : first;
      const id = addIdea({ title, signalId: s.id, why: `${s.author} on ${s.source === 'x' ? 'X' : 'Reddit'}: ${fmtNum(s.likes)} likes and ${fmtNum(s.replies)} replies in ${Math.round(s.ageHours)} hours.`, demand: { level: s.likes > 1000 ? 'high' : 'mid', note: `${fmtNum(s.likes)} likes, ${fmtNum(s.replies)} replies.` }, sources: [{ label: `${s.author}: ${title}`, url: s.url }] });
      toast('Turned the post into an idea', { action: { label: 'Open', fn: () => go('ideas?new=' + id) } });
      return id;
    };
    const createFresh = (p) => {
      setS((s) => ({ active: 'fresh', channels: Object.assign({}, s.channels, { fresh: Object.assign({ videos: [] }, s.channels.fresh || {}, { id: 'fresh', person: p.person, name: p.name, handle: null, url: null, topics: p.topics, audience: p.audience, about: p.about || `Videos about ${p.topics.slice(0, 2).join(' and ')} for ${p.audience.map((a) => a.toLowerCase()).join(', ')}.`, color: '#2563eb' }) }) }));
      return 'fresh';
    };
    const store = {
      channel: ch, channels: S.channels, active: S.active, videos: ch.videos, from: fromRef.current,
      setActive: (id) => setS((s) => Object.assign({}, s, { active: id })),
      updateVideo, addVideo, setStage, addIdea, ideaFromConcept, ideaFromTrend, ideaFromSignal, createFresh, toast,
      markOnboarded: () => lsSet('cc_onboarded', '1'),
      theme, setTheme: setThemeS, openNew: () => setNewOpen(true), openHelp: () => setHelp(true),
      recScene, setRecScene: (vid, i) => setRecSceneS((r) => Object.assign({}, r, { [vid]: i })),
    };

    const [p0, p1, p2] = route.parts;
    let screen;
    if (p0 === 'welcome') return html`<${Store.Provider} value=${store}><${window.CC.Welcome} /><${Toasts} toasts=${toasts} /><//>`;
    if (p0 === 'video') screen = html`<${window.CC.Workspace} id=${p1} tab=${p2 || 'board'} />`;
    else if (p0 === 'ideas') screen = html`<${window.CC.Ideas} />`;
    else if (p0 === 'trending') screen = html`<${window.CC.Trending} />`;
    else if (p0 === 'signals') screen = html`<${window.CC.Signals} />`;
    else if (p0 === 'production') screen = html`<${window.CC.Production} />`;
    else if (p0 === 'settings') screen = html`<${window.CC.Settings} />`;
    else screen = html`<${window.CC.Overview} />`;
    const autoCollapse = p0 === 'video' && (p2 === 'record' || p2 === 'edit');
    const collapsed = sbOpen == null ? autoCollapse : !sbOpen;

    return html`<${Store.Provider} value=${store}>
      <div className="shell">
        <${Sidebar} collapsed=${collapsed} onToggle=${() => setSbOpen(collapsed)} route=${route} onSearch=${() => setPalette(true)} />
        <main className="main" id="main"><${Boundary} k=${route.raw}>${screen}<//></main>
      </div>
      ${palette && html`<${Palette} onClose=${() => setPalette(false)} />`}
      ${newOpen && html`<${NewVideo} onClose=${() => setNewOpen(false)} />`}
      ${help && html`<${Help} onClose=${() => setHelp(false)} />`}
      <${Toasts} toasts=${toasts} />
    <//>`;
  }

  class Boundary extends React.Component {
    constructor(p) { super(p); this.state = { err: null }; }
    static getDerivedStateFromError(err) { return { err }; }
    componentDidUpdate(prev) { if (prev.k !== this.props.k && this.state.err) this.setState({ err: null }); }
    render() { return this.state.err ? html`<div className="page"><div className="card"><div className="empty"><h3>This screen couldn't load</h3><p>${String(this.state.err.message || this.state.err)}</p><a className="btn" href="#/overview">Back to overview</a></div></div></div>` : this.props.children; }
  }

  function Toasts({ toasts }) {
    return html`<div className="toasts" role="status" aria-live="polite">${toasts.map((t) => html`<div key=${t.id} className="toast"><${Icon} name="Check" size=${15} className="ok" />${t.msg}
      ${t.opts.undo && html`<button onClick=${(e) => { t.opts.undo(); e.currentTarget.parentElement.style.display = 'none'; }}>Undo</button>`}
      ${t.opts.action && html`<button onClick=${(e) => { t.opts.action.fn(); e.currentTarget.parentElement.style.display = 'none'; }}>${t.opts.action.label}</button>`}</div>`)}</div>`;
  }

  function Sidebar({ collapsed, onToggle, route, onSearch }) {
    const st = useStore();
    const p0 = route.parts[0] || 'overview';
    const vids = st.videos;
    const active = vids.filter((v) => ['planning', 'recording', 'editing', 'publishing'].includes(v.stage));
    const nIdeas = vids.filter((v) => v.stage === 'ideas' && !v.hidden).length;
    const NAV = [['overview', 'Overview', 'House'], ['ideas', 'Ideas', 'Lightbulb', nIdeas], ['trending', 'Working now', 'TrendingUp', D.trending.filter((t) => t.fit).length], ['signals', 'Signals', 'MessagesSquare', D.signals.length], ['production', 'Production', 'SquareKanban', active.length]];
    const ch = st.channel;
    return html`<nav className=${'sidebar' + (collapsed ? ' collapsed' : '')} aria-label="Main">
      <div className="sb-top">
        <${Menu} width=${240} button=${(t) => html`<button className="channel-btn" onClick=${t} title=${collapsed ? ch.name : null} aria-label="Switch channel">
          <${Avatar} name=${ch.name} size="lg" sq=${true} color=${ch.color} />
          <span className="meta"><div className="name ellipsis">${ch.name}</div><div className="sub">${ch.handle || 'Starting fresh'}</div></span>
          <${Icon} name="ChevronsUpDown" size=${15} className="chev faint" /></button>`}
          items=${[{ header: 'Channels' }].concat(Object.values(st.channels).map((c) => ({ label: c.name, check: c.id === st.active, fn: () => { st.setActive(c.id); go('overview'); } })), ['-', { label: 'Add a channel', icon: 'Plus', fn: () => go('welcome') }])} />
      </div>
      <button className="sb-search" onClick=${onSearch} title="Search"><${Icon} name="Search" size=${15} /><span>Search</span><span className="kbd">⌘K</span></button>
      <div className="nav">${NAV.map(([k, l, ic, n]) => html`<a key=${k} href=${'#/' + k} className=${'nav-item' + (p0 === k ? ' active' : '')} title=${collapsed ? l : null} aria-current=${p0 === k ? 'page' : null}><${Icon} name=${ic} size=${17} /><span className="label">${l}</span>${n ? html`<span className="count">${n}</span>` : null}</a>`)}</div>
      ${active.length > 0 && html`<div className="sb-videos"><div className="sb-label">In production</div>
        <div className="nav" style=${{ paddingTop: 0 }}>${active.slice(0, 5).map((v) => html`<a key=${v.id} href=${`#/video/${v.id}/${defaultTab(v)}`} className=${'sb-video' + (route.parts[1] === v.id ? ' active' : '')} title=${progressText(v)}>
          <span className="mini" style=${{ position: 'relative' }}><${Thumb} v=${v} style=${{ borderRadius: 4, aspectRatio: 'auto', height: 20 }} /></span><span className="t">${chosenTitle(v)}</span></a>`)}</div></div>`}
      <div className="sb-bottom">
        <a href="#/settings" className=${'nav-item' + (p0 === 'settings' ? ' active' : '')} title=${collapsed ? 'Settings' : null}><${Icon} name="Settings" size=${17} /><span className="label">Settings</span></a>
        <button className="nav-item" onClick=${st.openHelp} title=${collapsed ? 'How CreatorClub works' : null}><${Icon} name="CircleHelp" size=${17} /><span className="label">How it works</span></button>
        <button className="nav-item" onClick=${onToggle} title=${collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label=${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><${Icon} name=${collapsed ? 'PanelLeftOpen' : 'PanelLeftClose'} size=${17} /><span className="label">${collapsed ? 'Expand' : 'Collapse'}</span></button>
      </div>
    </nav>`;
  }

  function Palette({ onClose }) {
    const st = useStore();
    const [q, setQ] = useState('');
    const [i, setI] = useState(0);
    const items = useMemo(() => {
      const pages = [['Overview', 'overview', 'House'], ['Ideas', 'ideas', 'Lightbulb'], ['Working now', 'trending', 'TrendingUp'], ['Signals', 'signals', 'MessagesSquare'], ['Production', 'production', 'SquareKanban'], ['Production calendar', 'production/calendar', 'Calendar'], ['Settings', 'settings', 'Settings'], ['First launch setup', 'welcome', 'Sparkles']].map(([l, r, ic]) => ({ l, r, ic, k: 'Page' }));
      const vids = st.videos.map((v) => ({ l: chosenTitle(v), r: v.stage === 'ideas' ? 'ideas?open=' + v.id : `video/${v.id}/${defaultTab(v)}`, ic: v.stage === 'ideas' ? 'Lightbulb' : 'Film', k: stageLabel(v.stage) }));
      const all = pages.concat(vids);
      const s = q.trim().toLowerCase();
      return (s ? all.filter((x) => x.l.toLowerCase().includes(s)) : all).slice(0, 40);
    }, [q]);
    const pick = (x) => { onClose(); go(x.r); };
    return html`<${Fragment}><div className="scrim" onClick=${onClose}></div>
      <div className="palette" role="dialog" aria-label="Search">
        <div className="pi"><${Icon} name="Search" size=${17} className="faint" /><input autoFocus value=${q} onChange=${(e) => { setQ(e.target.value); setI(0); }} placeholder="Search videos, ideas and pages"
          onKeyDown=${(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(items.length - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); } if (e.key === 'Enter' && items[i]) pick(items[i]); if (e.key === 'Escape') onClose(); }} aria-label="Search" /><span className="kbd">Esc</span></div>
        <div className="pl">${items.length ? items.map((x, j) => html`<div key=${x.r + j} className=${'po' + (j === i ? ' on' : '')} onMouseEnter=${() => setI(j)} onClick=${() => pick(x)}><${Icon} name=${x.ic} size=${16} className="faint" /><span className="ellipsis">${x.l}</span><span className="k">${x.k}</span></div>`)
          : html`<div className="po faint">Nothing matches "${q}". Try a word from the title.</div>`}</div>
      </div><//>`;
  }

  function NewVideo({ onClose }) {
    const st = useStore();
    const [mode, setMode] = useState('link');
    const [val, setVal] = useState('');
    const go2 = () => {
      if (mode === 'link') { const id = ytIdFrom(val); if (!id) { st.toast("That doesn't look like a video link. Paste the full address."); return; } onClose(); go('ideas?bd=' + id); }
      else if (mode === 'title') { if (!val.trim()) return; const id = st.addIdea({ title: val.trim() }); onClose(); go('ideas?new=' + id); }
      else { const id = 'quick-' + Date.now().toString(36); st.addVideo(window.CC.buildVideo({ id, title: val.trim() || 'Quick recording', stage: 'recording', order: -1, stageDates: {}, why: '', sources: [], demand: { level: 'mid', note: '' }, gap: { level: 'mid', note: '' }, show: { level: 'mid', note: '' } })); st.updateVideo(id, { scenes: [{ id: id + '-s0', title: 'Quick recording', dur: 300, points: ['Say what this video is about in one sentence.', 'Show it on screen.'], show: 'Your screen', takes: [] }] }); onClose(); go(`video/${id}/record`); }
    };
    const OPTS = [['link', 'Link', 'Break down a video', 'Paste a YouTube or Instagram link. Keep the concept you like.'], ['title', 'Type', 'Start from a title', 'You already know the video. Add it to ideas.'], ['quick', 'Mic', 'Quick recording', 'Record right away and plan later.']];
    return html`<${Dialog} title="New video" onClose=${onClose} width=${560} footer=${html`<${Fragment}><button className="btn ghost" onClick=${onClose}>Cancel</button><button className="btn primary" onClick=${go2} disabled=${mode !== 'quick' && !val.trim()}>${{ link: 'Break down', title: 'Add idea', quick: 'Start recording' }[mode]}</button><//>`}>
      <div className="grid g3" style=${{ gap: 8, marginBottom: 16 }}>${OPTS.map(([k, ic, t, d]) => html`<button key=${k} className=${'topt' + (mode === k ? ' on' : '')} style=${{ flexDirection: 'column', gap: 6, textAlign: 'left', margin: 0, background: 'var(--surface)' }} onClick=${() => { setMode(k); setVal(''); }} aria-pressed=${mode === k}>
        <${Icon} name=${ic} size=${18} /><b style=${{ fontSize: 13.5 }}>${t}</b><span className="small muted" style=${{ lineHeight: 1.4 }}>${d}</span></button>`)}</div>
      <input className="input" autoFocus key=${mode} value=${val} onChange=${(e) => setVal(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && go2()}
        placeholder=${{ link: 'youtube.com/watch?v=…', title: 'e.g. Claude does my receipts automatically', quick: 'Name it (optional)' }[mode]} aria-label="New video" />
    <//>`;
  }

  function Help({ onClose }) {
    return html`<${Dialog} title="How CreatorClub works" onClose=${onClose} width=${620} footer=${html`<button className="btn primary" onClick=${onClose}>Start</button>`}>
      <p className="muted" style=${{ margin: 0, lineHeight: 1.55 }}>Every video is one card. Plan it, record the scenes, edit, publish, all in one place.</p>
      <div className="help-steps">${[['Lightbulb', '1 Find the idea', "Break down what's working. Keep the concept you'd make."], ['Layers', '2 Plan it', 'Gather references on its board, package it, draft the scenes.'], ['Mic', '3 Record, edit, publish', 'Talk through each scene, remove pauses, paste the YouTube link.']].map(([ic, t, d]) => html`<div key=${t} className="hs"><${Icon} name=${ic} size=${18} /><b>${t}</b><span>${d}</span></div>`)}</div>
      <p className="small faint" style=${{ margin: '14px 0 0' }}>Open this again with How it works in the sidebar.</p>
    <//>`;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
})();
