/* Top-level screens: Overview, Ideas, Working now, Signals, Production, Settings. */
(function () {
  const { useState, useEffect, useRef, useMemo, Fragment } = React;
  const { html, D, Icon, fmtNum, fmtMult, fmtDays, fmtHours, fmtDate, fmtClock, TODAY, jobByVideo, trendById, multFor, STAGES, stageLabel,
    progressText, nextAction, defaultTab, chosenTitle, recordedCount, useStore, go, Avatar, MultChip, Level, StagePill, Thumb, SceneDots, Empty, Menu, Drawer, Dialog, SourceIcon, MONTHS } = window.CC;

  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
  const openVideo = (v, tab) => go(`video/${v.id}/${tab || defaultTab(v)}`);
  const ytIdFrom = (s) => { const m = String(s).match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; };

  // ---------- shared cards ----------
  function TrendCard({ t, onBreak, compact }) {
    const st = useStore();
    const job = jobByVideo[t.videoId];
    return html`<div className="card trend hov" onClick=${() => onBreak(t)} tabIndex="0" onKeyDown=${(e) => e.key === 'Enter' && onBreak(t)}>
      <${Thumb} videoId=${t.videoId} chip=${html`<${MultChip} m=${multFor(t)} onThumb=${true} />`}>
        ${t.firstSeen === '2026-10-26' && t.ageDays < 2 && html`<span className="chip solid br">New</span>`}
      <//>
      <div className="meta"><${Avatar} name=${t.channel} size="xs" /><span className="ellipsis grow">${t.channel}</span>${t.kind === 'followed' && html`<span className="chip outline" style=${{ height: 20 }}>Followed</span>`}</div>
      <div className="tt clamp2">${t.title}</div>
      <div className="stats"><span title="Total views"><${Icon} name="Eye" size=${13} /><b>${fmtNum(t.views)}</b></span><span title="Views per day since it went up"><${Icon} name="TrendingUp" size=${13} /><b>${fmtNum(t.vpd)}</b>/day</span><span><${Icon} name="Clock" size=${13} />${fmtDays(t.ageDays)}</span></div>
      ${!compact && html`<div className="foot" onClick=${(e) => e.stopPropagation()}>
        <button className="btn sm" onClick=${() => onBreak(t)}><${Icon} name=${job ? 'FileText' : 'Sparkles'} size=${14} />${job ? 'Open breakdown' : 'Break down'}</button>
        <button className="btn sm ghost" onClick=${() => st.ideaFromTrend(t)}><${Icon} name="Plus" size=${14} />Make it an idea</button>
      </div>`}
    </div>`;
  }

  function SignalCard({ s }) {
    const st = useStore();
    const [more, setMore] = useState(false);
    const long = s.text.length > 260;
    const added = st.videos.some((v) => v.signalId === s.id);
    return html`<div className="card sig">
      <div className="who"><${Avatar} name=${s.source === 'x' ? s.author : s.author.replace('r/', '')} sq=${s.source === 'reddit'} />
        <div className="grow" style=${{ minWidth: 0 }}><div className="n ellipsis">${s.author}</div><div className="h ellipsis">${s.source === 'x' ? '@' + s.handle : 'u/' + s.handle} · ${fmtHours(s.ageHours)}</div></div>
        <${SourceIcon} source=${s.source} />
      </div>
      ${s.flair && html`<div><span className="chip">${s.flair}</span></div>`}
      <div className="text">${long && !more ? s.text.slice(0, 250).trim() + '…' : s.text}${long && html`<button className="linkish" style=${{ marginLeft: 4 }} onClick=${() => setMore(!more)}>${more ? 'Show less' : 'Show more'}</button>`}</div>
      <div className="foot">
        <span className="stats"><span title="Likes"><${Icon} name="Heart" size=${13} /><b>${fmtNum(s.likes)}</b></span><span title="Replies"><${Icon} name="MessageCircle" size=${13} /><b>${fmtNum(s.replies)}</b></span>${s.views ? html`<span title="Views"><${Icon} name="Eye" size=${13} /><b>${fmtNum(s.views)}</b></span>` : null}</span>
        <span className="grow"></span>
        <a className="btn sm ghost icon-only" href=${s.url} target="_blank" rel="noopener" aria-label="Open post" title="Open post"><${Icon} name="ArrowUpRight" size=${15} /></a>
        ${added ? html`<span className="chip b-green"><${Icon} name="Check" size=${12} />In ideas</span>` : html`<button className="btn sm" onClick=${() => st.ideaFromSignal(s)}><${Icon} name="Lightbulb" size=${14} />Turn into idea</button>`}
      </div>
    </div>`;
  }

  // ---------- Breakdown (paste-link result, inline or in drawer) ----------
  const STEPS = ['Reading the video', 'Reading the transcript', 'Reading the comments', 'Writing concepts'];
  function Breakdown({ videoId, onAdded, firstName = 'Samin', instant, onBack }) {
    const st = useStore();
    const job = jobByVideo[videoId];
    const t = trendById[videoId];
    const [step, setStep] = useState(instant ? 99 : 0);
    useEffect(() => {
      if (instant) return;
      setStep(0);
      const ids = [0, 1, 2, 3, 4].map((i) => setTimeout(() => setStep(i + 1), 520 + i * 560));
      return () => ids.forEach(clearTimeout);
    }, [videoId]);
    const video = job ? job.video : t ? { title: t.title, channel: t.channel, views: t.views, likes: t.likes, comments: t.comments, ageDays: t.ageDays, url: 'https://www.youtube.com/watch?v=' + videoId } : null;
    if (step < 5 || !job) {
      if (!job && step >= 5) return html`<div className="bd">
        <div className="bd-head">${video && html`<${Thumb} videoId=${videoId} />`}<div className="grow">
          <div style=${{ fontWeight: 600, fontSize: 15 }}>${video ? video.title : 'Your video'}</div>
          <div className="muted small" style=${{ marginTop: 4 }}>${video ? video.channel : ''}</div>
          <div className="row" style=${{ marginTop: 14, color: 'var(--text-2)' }}><span className="spin"></span>Breaking it down in the background. It shows up on Overview when it's done, in about a minute.</div>
          ${onBack && html`<button className="btn" style=${{ marginTop: 14 }} onClick=${onBack}><${Icon} name="ChevronLeft" size=${15} />Pick a video that's ready now</button>`}
        </div></div></div>`;
      return html`<div className="bd"><div className="bd-head">
        ${video && html`<${Thumb} videoId=${videoId} />`}
        <div className="grow"><div style=${{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>${video ? video.title : 'Reading the link'}</div>
          <div className="bd-steps">${STEPS.map((s, i) => html`<div key=${s} className=${'bd-step' + (step === i ? ' on' : step > i ? ' done' : '')}>
            ${step > i ? html`<${Icon} name="CircleCheck" size=${16} style=${{ color: 'var(--ok)' }} />` : step === i ? html`<span className="spin"></span>` : html`<${Icon} name="Circle" size=${16} />`}
            ${s}${i === 2 && step > 2 && video ? ` · ${fmtNum(video.comments)} comments` : ''}</div>`)}</div>
        </div></div></div>`;
    }
    const r = job.result;
    const usual = D.usualViews;
    return html`<div className="bd">
      <div className="bd-head">
        <a href=${video.url} target="_blank" rel="noopener" style=${{ width: 220, flex: 'none' }}><${Thumb} videoId=${videoId} chip=${html`<${MultChip} m=${multFor(t)} onThumb=${true} />`} /></a>
        <div className="grow">
          <div style=${{ fontWeight: 650, fontSize: 17, letterSpacing: '-0.015em', lineHeight: 1.3 }}>${video.title}</div>
          <div className="row" style=${{ marginTop: 8, gap: 8 }}><${Avatar} name=${video.channel} size="sm" /><span className="muted">${video.channel}</span></div>
          <div className="row" style=${{ marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
            <span className=${'chip mult ' + window.CC.band(video.views / usual)} title="Compared with your usual views">${fmtMult(video.views / usual)} your usual</span>
            <span className="chip outline"><${Icon} name="Eye" size=${12} />${fmtNum(video.views)} views</span>
            <span className="chip outline"><${Icon} name="Heart" size=${12} />${fmtNum(video.likes)}</span>
            <span className="chip outline"><${Icon} name="MessageCircle" size=${12} />${fmtNum(video.comments)}</span>
            <span className="chip outline"><${Icon} name="Clock" size=${12} />${fmtDays(video.ageDays)}</span>
          </div>
        </div>
      </div>
      <div className="bd-grid">
        <div><h3><${Icon} name="Sparkles" size=${15} style=${{ color: 'var(--accent)' }} />Why it worked</h3><ol>${r.whyItWorked.map((w, i) => html`<li key=${i}>${w}</li>`)}</ol></div>
        <div><h3><${Icon} name="MessagesSquare" size=${15} />What viewers ask</h3>${r.viewerQuestions.slice(0, 6).map((q, i) => html`<div key=${i} className="q"><span>${q.question}</span>${q.likes ? html`<span className="likes"><${Icon} name="Heart" size=${12} />${q.likes}</span>` : null}</div>`)}</div>
      </div>
      <h3 style=${{ marginTop: 26 }}><${Icon} name="Lightbulb" size=${15} />Concepts for ${firstName}</h3>
      <div className="concepts">${r.concepts.map((c) => html`<${ConceptCard} key=${c.title} c=${c} job=${job} onAdded=${onAdded} />`)}</div>
    </div>`;
  }
  function ConceptCard({ c, job, onAdded }) {
    const st = useStore();
    const existing = st.videos.find((v) => v.title === c.title);
    return html`<div className="card concept">
      <div className="tt">${c.title}</div>
      <div className="hookq">${c.hook}</div>
      <div className="kv"><b>Angle.</b> ${c.angle}</div>
      <div className="kv"><b>Twist.</b> ${c.twist}</div>
      <div className="row" style=${{ flexWrap: 'wrap', gap: 6 }}><${Level} label="Demand" d=${c.demand} /><${Level} label="Gap" d=${c.gap} /><${Level} label="Easy to show" d=${c.show} /></div>
      <div style=${{ marginTop: 'auto' }}>${existing
        ? html`<button className="btn sm" style=${{ width: '100%' }} onClick=${() => onAdded ? onAdded(existing.id) : go('ideas?new=' + existing.id)}><${Icon} name="Check" size=${14} style=${{ color: 'var(--ok)' }} />In your ideas · Open</button>`
        : html`<button className="btn sm" style=${{ width: '100%' }} onClick=${() => { const id = st.ideaFromConcept(c, job); if (onAdded) onAdded(id); }}><${Icon} name="Plus" size=${14} />Add to my ideas</button>`}</div>
    </div>`;
  }
  function BreakdownDrawer({ videoId, onClose }) {
    const t = trendById[videoId];
    return html`<${Drawer} onClose=${onClose} header=${html`<div className="row"><${Icon} name="FileText" size=${16} /><b>Breakdown</b>${t && html`<span className="faint small ellipsis" style=${{ maxWidth: 260 }}>· ${t.channel}</span>`}</div>`}>
      <div style=${{ margin: '-20px -22px' }}><${BreakdownWide} videoId=${videoId} /></div>
    <//>`;
  }
  function BreakdownWide(props) {
    return html`<div className="bd-narrow"><${Breakdown} ...${props} /></div>`;
  }

  // ---------- Overview ----------
  function Overview() {
    const st = useStore();
    const vids = st.videos;
    const active = vids.filter((v) => ['planning', 'recording', 'editing', 'publishing'].includes(v.stage)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const ideas = vids.filter((v) => v.stage === 'ideas' && !v.hidden);
    const published = vids.filter((v) => v.stage === 'published').sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
    const trends = D.trending.filter((t) => t.fit).sort((a, b) => b.vpd - a.vpd).slice(0, 6);
    const sigs = D.signals.slice().sort((a, b) => b.likes / (b.ageHours + 2) - a.likes / (a.ageHours + 2)).slice(0, 4);
    const [bd, setBd] = useState(null);
    const first = (st.channel.person || st.channel.name).split(' ')[0];
    const fresh = vids.length === 0 || (active.length === 0 && published.length === 0);

    return html`<div className="page">
      <div className="page-head greet">
        <div><h1>${greeting()}, ${first}</h1>
          <div className="lede">${fresh ? (ideas.length ? `You have ${ideas.length} idea${ideas.length > 1 ? 's' : ''}. Open one and start planning.` : "Let's find your first video. Start with what's already working in your space.")
            : `${active.length} videos in production · ${ideas.length} ideas waiting · ${published.length} published`}</div></div>
        <div className="actions"><button className=${'btn' + (fresh ? '' : ' primary')} onClick=${() => st.openNew()}><${Icon} name="Plus" size=${15} />New video</button></div>
      </div>

      ${fresh ? html`<${FirstSteps} ideas=${ideas} onBreak=${(t) => setBd(t.videoId)} />` : html`<${Fragment}>
        <div className="sec-head"><h2 className="sec">Pick up where you left off</h2><button className="linkish more" onClick=${() => go('production')}>Open production</button></div>
        <div className="resume">${active.slice(0, 3).map((v) => {
          const na = nextAction(v);
          return html`<div key=${v.id} className="card hov" onClick=${() => openVideo(v)} tabIndex="0" onKeyDown=${(e) => e.key === 'Enter' && openVideo(v)}>
            <${Thumb} v=${v} chip=${html`<span className="chip solid on-thumb">${stageLabel(v.stage)}</span>`} />
            <div className="body">
              <div className="title clamp2">${chosenTitle(v)}</div>
              <div className="row small muted"><${SceneDots} v=${v} /><span>${progressText(v)}</span></div>
              <div className="row" style=${{ marginTop: 'auto', paddingTop: 4 }}>
                <button className="btn sm" onClick=${(e) => { e.stopPropagation(); openVideo(v, na.tab); }}><${Icon} name=${na.icon} size=${14} />${na.label}</button>
                ${v.plannedDate && html`<span className="faint small" style=${{ marginLeft: 'auto' }}><${Icon} name="Calendar" size=${12} /> ${fmtDate(v.plannedDate)}</span>`}
              </div>
            </div>
          </div>`;
        })}</div>
      <//>`}

      <div className="ov-cols" style=${{ marginTop: 8 }}>
        <div>
          <div className="sec-head"><h2 className="sec"><${Icon} name="TrendingUp" size=${16} />Working now</h2><span className="faint small">Outliers in your space this week</span><button className="linkish more" onClick=${() => go('trending')}>See all ${D.trending.length}</button></div>
          <div className="grid g3">${trends.map((t) => html`<${TrendCard} key=${t.videoId} t=${t} onBreak=${(x) => setBd(x.videoId)} compact=${true} />`)}</div>
          ${published.length > 0 && html`<${Fragment}>
            <div className="sec-head"><h2 className="sec">Recently published</h2><span className="faint small">Compared with your usual ${fmtNum(D.usualViews)} views</span></div>
            <div className="card list-card">${published.slice(0, 4).map((v) => html`<div key=${v.id} className="li" onClick=${() => openVideo(v)}>
              <${Thumb} v=${v} className="lt" />
              <div className="grow"><div className="tt clamp2">${v.title}</div><div className="stats" style=${{ marginTop: 4 }}><span><b>${fmtNum(v.views)}</b> views</span><span>${fmtDate(v.publishedAt)}</span></div></div>
              <${MultChip} m=${v.views / D.usualViews} />
            </div>`)}</div>
          <//>`}
        </div>
        <div>
          ${!fresh && html`<${Fragment}>
            <div className="sec-head"><h2 className="sec">In production</h2></div>
            <div className="card pipeline">${STAGES.map((s) => {
              const n = vids.filter((v) => v.stage === s.id && !v.hidden).length;
              const max = Math.max(...STAGES.map((x) => vids.filter((v) => v.stage === x.id && !v.hidden).length));
              return html`<div key=${s.id} className=${'pipe-row st-' + s.id} style=${{ background: 'none' }} onClick=${() => go('production')}>
                <span style=${{ width: 82, fontSize: 13, fontWeight: 550, color: 'var(--text)' }}>${s.label}</span>
                <span className="bar"><i style=${{ width: (n / max) * 100 + '%' }}></i></span><span className="n" style=${{ color: 'var(--text)' }}>${n}</span></div>`;
            })}</div>
          <//>`}
          <div className="sec-head"><h2 className="sec">Next-up ideas</h2><button className="linkish more" onClick=${() => go('ideas')}>All ideas</button></div>
          ${ideas.length ? html`<div className="card list-card">${ideas.slice().sort((a, b) => a.order - b.order).slice(0, 4).map((v) => html`<div key=${v.id} className="li" onClick=${() => go('ideas?open=' + v.id)}>
            <div className="grow"><div className="tt clamp2">${v.title}</div><div className="row" style=${{ marginTop: 6, gap: 4 }}><${Level} label="Demand" d=${v.demand} /><${Level} label="Gap" d=${v.gap} /></div></div>
            <${Icon} name="ChevronRight" size=${16} className="faint" />
          </div>`)}</div>` : html`<div className="card"><${Empty} icon="Lightbulb" title="No ideas yet">Break down one of the videos that's working and keep the concept you'd make.</${Empty}></div>`}
          <div className="sec-head"><h2 className="sec">Latest signals</h2><button className="linkish more" onClick=${() => go('signals')}>All signals</button></div>
          <div className="card list-card">${sigs.map((s) => html`<div key=${s.id} className="li" style=${{ alignItems: 'flex-start' }} onClick=${() => go('signals')}>
            <${SourceIcon} source=${s.source} />
            <div className="grow" style=${{ minWidth: 0 }}><div className="small muted ellipsis"><b style=${{ color: 'var(--text)' }}>${s.author}</b> · ${fmtHours(s.ageHours)}</div><div className="clamp2" style=${{ fontSize: 13.5, marginTop: 2 }}>${s.text}</div>
              <div className="stats" style=${{ marginTop: 4 }}><span><${Icon} name="Heart" size=${12} />${fmtNum(s.likes)}</span><span><${Icon} name="MessageCircle" size=${12} />${fmtNum(s.replies)}</span></div></div>
          </div>`)}</div>
        </div>
      </div>
      ${bd && html`<${BreakdownDrawer} videoId=${bd} onClose=${() => setBd(null)} />`}
    </div>`;
  }

  function FirstSteps({ ideas, onBreak }) {
    const jobsVids = D.jobs.map((j) => trendById[j.video.videoId]).filter(Boolean);
    const done = (k) => k === 'ai' || k === 'space' || (k === 'idea' && ideas.length > 0);
    const steps = [
      { k: 'ai', t: 'Connect your AI', d: 'Claude is connected.' },
      { k: 'space', t: 'Tell CreatorClub your space', d: 'Topics and who you make videos for.' },
      { k: 'idea', t: 'Pick your first idea', d: "Break down a video that's working and keep a concept." },
      { k: 'plan', t: 'Plan it, record the scenes, edit, publish', d: 'Every video goes through the same five steps.' },
    ];
    const cur = steps.findIndex((s) => !done(s.k));
    return html`<div className="card" style=${{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 28 }}>
      <div>
        <h2 className="sec" style=${{ fontSize: 17, marginBottom: 4 }}>Your first video</h2>
        <div className="muted" style=${{ marginBottom: 16 }}>${ideas.length ? 'You have an idea. Open it and start planning.' : 'You don\'t need to know what to make yet. Start from something that\'s already working.'}</div>
        ${steps.map((s, i) => html`<div key=${s.k} className="row" style=${{ alignItems: 'flex-start', gap: 12, padding: '9px 0', borderBottom: i < 3 ? '1px solid var(--line)' : 0 }}>
          <span style=${{ width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done(s.k) ? 'var(--ok)' : i === cur ? 'var(--primary)' : 'var(--bg-sunk)', color: done(s.k) || i === cur ? 'var(--on-primary)' : 'var(--text-3)', fontSize: 12, fontWeight: 700 }}>${done(s.k) ? html`<${Icon} name="Check" size=${13} stroke=${2.6} style=${{ color: '#fff' }} />` : i + 1}</span>
          <div><div style=${{ fontWeight: 600, color: done(s.k) ? 'var(--text-2)' : 'var(--text)', textDecoration: done(s.k) ? 'line-through' : 'none', textDecorationColor: 'var(--line-strong)' }}>${s.t}</div><div className="small muted">${s.d}</div></div>
        </div>`)}
        ${ideas.length > 0 && html`<button className="btn primary" style=${{ marginTop: 16 }} onClick=${() => go('ideas?new=' + ideas[0].id)}><${Icon} name="ArrowRight" size=${15} />Open "${ideas[0].title}"</button>`}
      </div>
      <div>
        <div className="row" style=${{ marginBottom: 10 }}><b style=${{ fontSize: 14 }}>Start here: break one of these down</b></div>
        <div className="grid g3" style=${{ gap: 12 }}>${jobsVids.map((t) => html`<div key=${t.videoId} className="card trend hov" onClick=${() => onBreak(t)}>
          <${Thumb} videoId=${t.videoId} chip=${html`<${MultChip} m=${multFor(t)} onThumb=${true} />`} />
          <div className="tt clamp2" style=${{ fontSize: 13 }}>${t.title}</div>
          <div className="stats"><span><b>${fmtNum(t.views)}</b> views</span><span><b>${fmtNum(t.vpd)}</b>/day</span></div>
          <button className="btn sm" onClick=${(e) => { e.stopPropagation(); onBreak(t); }}><${Icon} name="Sparkles" size=${14} />Break this down</button>
        </div>`)}</div>
        <div className="small muted" style=${{ marginTop: 12 }}>A breakdown shows why the video worked, what viewers asked, and three concepts you could make.</div>
      </div>
    </div>`;
  }

  // ---------- Ideas ----------
  function Ideas() {
    const st = useStore();
    const { q } = window.CC.useRoute();
    const filter = q.get('filter') || 'new';
    const newId = q.get('new');
    const openId = q.get('open');
    const bdParam = q.get('bd');
    const [url, setUrl] = useState('');
    const [bdId, setBdId] = useState(null);
    const [drawer, setDrawer] = useState(openId);
    const [addOpen, setAddOpen] = useState(false);
    useEffect(() => { if (openId) setDrawer(openId); }, [openId]);
    useEffect(() => { if (bdParam) { setUrl('https://www.youtube.com/watch?v=' + bdParam); setBdId(bdParam); } }, [bdParam]);
    useEffect(() => { if (newId) setTimeout(() => { const el = document.getElementById('idea-' + newId); el && el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120); }, [newId]);
    const all = st.videos.filter((v) => v.stage === 'ideas');
    const counts = { new: all.filter((v) => !v.hidden).length, later: all.filter((v) => v.hidden === 'later').length, skipped: all.filter((v) => v.hidden === 'skipped').length };
    let list = all.filter((v) => (filter === 'new' ? !v.hidden : v.hidden === filter));
    list = list.slice().sort((a, b) => (a.id === newId ? -1 : b.id === newId ? 1 : (b.createdAt || '').localeCompare(a.createdAt || '') || a.order - b.order));
    const jobsVids = D.jobs.map((j) => j.video);
    const submit = (u) => {
      const id = ytIdFrom(u || url);
      if (!id) { st.toast("That doesn't look like a YouTube or Instagram link. Paste the full address."); return; }
      setUrl(u || url); setBdId(id);
    };
    const newIdea = newId && st.videos.find((v) => v.id === newId);

    return html`<div className="page">
      <div className="page-head"><div><h1>Ideas</h1><div className="lede">Every video starts here. Break down what's working, keep the concepts you'd make.</div></div>
        <div className="actions"><button className="btn" onClick=${() => setAddOpen(true)}><${Icon} name="Plus" size=${15} />Add idea</button></div></div>

      ${newIdea && newIdea.stage === 'ideas' && html`<div className="card" style=${{ padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--accent-soft)', borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }}>
        <${Icon} name="Sparkles" size=${18} style=${{ color: 'var(--accent)' }} />
        <div className="grow"><b>"${newIdea.title}" is in your ideas.</b><div className="small muted">Next: open it and start planning. You'll gather references on its board, then turn them into scenes.</div></div>
        <button className="btn primary" onClick=${() => { st.setStage(newIdea.id, 'planning', true); go(`video/${newIdea.id}/board`); }}><${Icon} name="ArrowRight" size=${15} />Open it and start planning</button>
      </div>`}

      <div className="card" style=${{ marginBottom: 22, overflow: 'hidden' }}>
        <form className="breakbar" onSubmit=${(e) => { e.preventDefault(); submit(); }}>
          <span className="lead"><${Icon} name="Link" size=${17} /></span>
          <input className="input" value=${url} onChange=${(e) => setUrl(e.target.value)} placeholder="Paste a YouTube or Instagram link to break it down" aria-label="Video link" />
          <button className=${'btn ' + (newIdea ? '' : 'primary')} type="submit" disabled=${!url.trim()}><${Icon} name="Sparkles" size=${15} />Break down</button>
        </form>
        ${!bdId && html`<div className="try">Try one that's working now:${jobsVids.map((v) => html`<button key=${v.videoId} type="button" onClick=${() => submit('https://www.youtube.com/watch?v=' + v.videoId)}><img src=${window.CC.ytThumb(v.videoId)} alt="" />${v.channel.split('|')[0].trim()}</button>`)}</div>`}
        ${bdId && html`<div style=${{ position: 'relative' }}><button className="btn ghost sm" style=${{ position: 'absolute', right: 12, top: 12, zIndex: 2 }} onClick=${() => { setBdId(null); setUrl(''); }}><${Icon} name="X" size=${14} />Close</button><${Breakdown} videoId=${bdId} onAdded=${(id) => go('ideas?new=' + id)} /></div>`}
      </div>

      <div className="row" style=${{ marginBottom: 14 }}>
        <div className="seg" role="tablist">${[['new', 'New'], ['later', 'Later'], ['skipped', 'Skipped']].map(([k, l]) => html`<button key=${k} role="tab" aria-selected=${filter === k} className=${filter === k ? 'on' : ''} onClick=${() => go('ideas' + (k === 'new' ? '' : '?filter=' + k))}>${l} <span className="n">${counts[k]}</span></button>`)}</div>
      </div>
      ${list.length ? html`<div className="grid g3">${list.map((v) => html`<${IdeaCard} key=${v.id} v=${v} hi=${v.id === newId} onOpen=${() => setDrawer(v.id)} />`)}</div>`
        : filter === 'later' ? html`<div className="card"><${Empty} icon="Bookmark" title="Nothing saved for later">Press Later on an idea that's good but not for this week. It waits here, out of the way.</${Empty}></div>`
        : filter === 'skipped' ? html`<div className="card"><${Empty} icon="EyeOff" title="Nothing skipped">Skipped ideas land here with the reason you gave, so the next ideas fit better.</${Empty}></div>`
        : html`<div className="card"><${Empty} icon="Lightbulb" title="No ideas yet" action=${html`<button className="btn primary" onClick=${() => submit('https://www.youtube.com/watch?v=' + D.jobs[0].video.videoId)}><${Icon} name="Sparkles" size=${15} />Break down a video that's working</button>`}>Paste a link above, or break down a video that's doing well right now and keep a concept.</${Empty}></div>`}
      ${drawer && st.videos.find((v) => v.id === drawer) && html`<${IdeaDrawer} v=${st.videos.find((v) => v.id === drawer)} onClose=${() => { setDrawer(null); if (openId) go('ideas'); }} />`}
      ${addOpen && html`<${AddIdeaDialog} onClose=${() => setAddOpen(false)} />`}
    </div>`;
  }

  function AddIdeaDialog({ onClose }) {
    const st = useStore();
    const [t, setT] = useState('');
    const add = () => { if (!t.trim()) return; const id = st.addIdea({ title: t.trim(), why: '' }); onClose(); go('ideas?new=' + id); };
    return html`<${Dialog} title="Add idea" onClose=${onClose} footer=${html`<${Fragment}><button className="btn ghost" onClick=${onClose}>Cancel</button><button className="btn primary" disabled=${!t.trim()} onClick=${add}>Add idea</button><//>`}>
      <label className="field" htmlFor="idea-t">What's the video?</label>
      <input id="idea-t" className="input" autoFocus value=${t} onChange=${(e) => setT(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && add()} placeholder="e.g. Claude does my receipts automatically" />
      <div className="small muted" style=${{ marginTop: 8 }}>A working title is enough. You'll package it properly in Plan.</div>
    <//>`;
  }

  const SKIP = ['Too generic', 'Not their style', 'Already covered', "Can't show it", 'Bad timing'];
  function IdeaActions({ v, compact }) {
    const st = useStore();
    if (v.hidden) return html`<button className="btn sm" onClick=${(e) => { e.stopPropagation(); st.updateVideo(v.id, { hidden: null, dropReason: null }); st.toast('Restored to New'); }}><${Icon} name="RotateCcw" size=${14} />Restore</button>`;
    return html`<${Fragment}>
      <button className="btn sm" onClick=${(e) => { e.stopPropagation(); st.setStage(v.id, 'planning'); go(`video/${v.id}/board`); }}><${Icon} name="ArrowRight" size=${14} />Start planning</button>
      <button className="btn sm ghost" onClick=${(e) => { e.stopPropagation(); st.updateVideo(v.id, { hidden: 'later' }); st.toast('Saved for later', { undo: () => st.updateVideo(v.id, { hidden: null }) }); }}><${Icon} name="Bookmark" size=${14} />Later</button>
      <span onClick=${(e) => e.stopPropagation()}><${Menu} align="right" button=${(t) => html`<button className="btn sm ghost" onClick=${t}><${Icon} name="EyeOff" size=${14} />Skip</button>`}
        items=${[{ header: 'Why skip it?' }].concat(SKIP.map((r) => ({ label: r, fn: () => { st.updateVideo(v.id, { hidden: 'skipped', dropReason: r }); st.toast(`Skipped · ${r}`, { undo: () => st.updateVideo(v.id, { hidden: null, dropReason: null }) }); } })))} /></span>
    <//>`;
  }
  function IdeaCard({ v, hi, onOpen }) {
    const src = v.sources[0];
    const t = v.thumbId && trendById[v.thumbId];
    return html`<div id=${'idea-' + v.id} className="card idea hov" onClick=${onOpen} tabIndex="0" onKeyDown=${(e) => e.key === 'Enter' && onOpen()} style=${hi ? { boxShadow: '0 0 0 2px var(--accent), var(--shadow-2)', borderColor: 'transparent' } : null}>
      <${Thumb} v=${v} chip=${html`<${MultChip} m=${multFor(t)} onThumb=${true} />`}>
        ${t && html`<span className="chip solid br"><${Icon} name="Youtube" size=${12} />From ${t.channel.split('|')[0].trim()}</span>`}
        ${hi && html`<span className="chip b-blue" style=${{ position: 'absolute', top: 8, right: 8 }}>New</span>`}
      <//>
      <div className="body">
        <div className="row" style=${{ gap: 6 }}>${v.timely && html`<span className="chip b-amber">Timely</span>`}${v.dropReason && html`<span className="chip">Skipped · ${v.dropReason}</span>`}</div>
        <div className="tt">${v.title}</div>
        ${v.ideaHook ? html`<div className="hookq clamp3">${v.ideaHook}</div>` : html`<div className="why clamp3">${v.why}</div>`}
        <div className="sigs"><${Level} label="Demand" d=${v.demand} /><${Level} label="Gap" d=${v.gap} /><${Level} label="Easy to show" d=${v.show} /></div>
        ${src && html`<div className="src"><${Icon} name=${src.videoId ? 'Youtube' : 'Link'} size=${13} /><span className="ellipsis">${src.label}</span></div>`}
      </div>
      <div className="foot"><${IdeaActions} v=${v} /></div>
    </div>`;
  }
  function IdeaDrawer({ v, onClose }) {
    const st = useStore();
    const job = v.thumbId && jobByVideo[v.thumbId];
    return html`<${Drawer} onClose=${onClose} header=${html`<div className="row"><${StagePill} stage=${v.stage} />${v.timely && html`<span className="chip b-amber">Timely</span>`}</div>`}
      footer=${html`<${Fragment}>${v.hidden ? html`<${IdeaActions} v=${v} />` : html`<${Fragment}><button className="btn ghost sm" onClick=${() => { st.updateVideo(v.id, { hidden: 'later' }); onClose(); st.toast('Saved for later'); }}><${Icon} name="Bookmark" size=${14} />Later</button><span className="grow"></span><button className="btn primary" onClick=${() => { st.setStage(v.id, 'planning'); go(`video/${v.id}/board`); }}><${Icon} name="ArrowRight" size=${15} />Start planning</button><//>`}<//>`}>
      <${Thumb} v=${v} />
      <h2 style=${{ fontSize: 21, letterSpacing: '-0.02em', margin: '18px 0 8px', lineHeight: 1.25 }}>${v.title}</h2>
      <p className="muted" style=${{ margin: '0 0 18px', lineHeight: 1.55 }}>${v.why}</p>
      ${v.ideaHook && html`<div style=${{ marginBottom: 18 }}><div className="small faint" style=${{ marginBottom: 6 }}>Hook</div><div className="hookq">${v.ideaHook}</div></div>`}
      ${v.angle && html`<div className="kv" style=${{ marginBottom: 8 }}><b>Angle.</b> ${v.angle}</div>`}
      ${v.twist && html`<div className="kv" style=${{ marginBottom: 18 }}><b>Twist.</b> ${v.twist}</div>`}
      <div className="card" style=${{ padding: '4px 14px', marginBottom: 18 }}>
        ${[['Demand', v.demand], ['Gap', v.gap], ['Easy to show', v.show]].map(([k, d]) => d && html`<div key=${k} className="dgs-row" style=${{ gridTemplateColumns: '120px 1fr' }}><${Level} label=${k} d=${d} /><span className="muted" style=${{ lineHeight: 1.5 }}>${d.note || sentenceLevel(d.level)}</span></div>`)}
      </div>
      ${v.sources.length > 0 && html`<div><div className="small faint" style=${{ marginBottom: 8 }}>Sources</div>${v.sources.map((s, i) => html`<div key=${i} className="row" style=${{ padding: '6px 0', fontSize: 13.5 }}>
        ${s.videoId ? html`<img src=${window.CC.ytThumb(s.videoId)} alt="" style=${{ width: 48, height: 27, borderRadius: 4, objectFit: 'cover' }} />` : html`<span className="src-ic" style=${{ background: 'var(--bg-sunk)', color: 'var(--text-2)' }}><${Icon} name="Link" size=${12} /></span>`}
        ${s.url || s.videoId ? html`<a href=${s.url || 'https://www.youtube.com/watch?v=' + s.videoId} target="_blank" rel="noopener" className="ellipsis" style=${{ color: 'var(--accent-text)' }}>${s.label}</a>` : html`<span className="ellipsis">${s.label}</span>`}</div>`)}</div>`}
      ${job && html`<div style=${{ marginTop: 18 }}><div className="small faint" style=${{ marginBottom: 6 }}>From the breakdown</div><ol style=${{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', lineHeight: 1.55, fontSize: 13.5 }}>${job.result.whyItWorked.slice(0, 2).map((w, i) => html`<li key=${i} style=${{ marginBottom: 6 }}>${w}</li>`)}</ol></div>`}
    <//>`;
  }
  const sentenceLevel = (l) => ({ high: 'High', mid: 'Medium', low: 'Low' }[l] || '');

  // ---------- Working now ----------
  function Trending() {
    const { q } = window.CC.useRoute();
    const show = q.get('show') || 'fit';
    const sort = q.get('sort') || 'vpd';
    const [bd, setBd] = useState(null);
    const set = (k, val) => { const p = new URLSearchParams({ show, sort }); p.set(k, val); go('trending?' + p.toString()); };
    let list = D.trending.filter((t) => show === 'all' || (show === 'fit' ? t.fit : t.kind === 'followed'));
    list = list.slice().sort((a, b) => sort === 'views' ? b.views - a.views : sort === 'growth' ? ((b.mult || 0) - (a.mult || 0)) || b.vpd - a.vpd : b.vpd - a.vpd);
    const cnt = { fit: D.trending.filter((t) => t.fit).length, followed: D.trending.filter((t) => t.kind === 'followed').length, all: D.trending.length };
    return html`<div className="page wide">
      <div className="page-head"><div><h1>Working now</h1><div className="lede">Videos outperforming in your space. Break one down to see why, or make it an idea.</div></div>
        <div className="actions"><span className="faint small"><${Icon} name="RotateCcw" size=${12} /> Updated Oct 26 · ${D.trending.length} videos</span></div></div>
      <div className="row" style=${{ marginBottom: 16, gap: 12 }}>
        <div className="seg">${[['fit', 'For ' + window.CC_ACTIVE_FIRST()], ['followed', 'Followed'], ['all', 'All']].map(([k, l]) => html`<button key=${k} className=${show === k ? 'on' : ''} onClick=${() => set('show', k)}>${l} <span className="n">${cnt[k]}</span></button>`)}</div>
        <span className="grow"></span>
        <label className="small muted" htmlFor="sortby">Sort by</label>
        <select id="sortby" className="select" value=${sort} onChange=${(e) => set('sort', e.target.value)}><option value="vpd">Views per day</option><option value="views">Total views</option><option value="growth">Growth</option></select>
      </div>
      <div className="grid g4">${list.map((t) => html`<${TrendCard} key=${t.videoId} t=${t} onBreak=${(x) => setBd(x.videoId)} />`)}</div>
      ${bd && html`<${BreakdownDrawer} videoId=${bd} onClose=${() => setBd(null)} />`}
    </div>`;
  }

  // ---------- Signals ----------
  function Signals() {
    const { q } = window.CC.useRoute();
    const src = q.get('source') || 'all';
    const sort = q.get('sort') || 'top';
    let list = D.signals.filter((s) => src === 'all' || s.source === src);
    list = list.slice().sort((a, b) => sort === 'new' ? a.ageHours - b.ageHours : b.likes - a.likes);
    const set = (k, v) => { const p = new URLSearchParams({ source: src, sort }); p.set(k, v); go('signals?' + p.toString()); };
    return html`<div className="page wide">
      <div className="page-head"><div><h1>Signals</h1><div className="lede">What people in your space are posting and asking on X and Reddit.</div></div>
        <div className="actions"><span className="faint small">${D.signals.length} posts · last 3 days</span></div></div>
      <div className="row" style=${{ marginBottom: 16, gap: 12 }}>
        <div className="seg">${[['all', 'All'], ['x', 'X'], ['reddit', 'Reddit']].map(([k, l]) => html`<button key=${k} className=${src === k ? 'on' : ''} onClick=${() => set('source', k)}>${l} <span className="n">${k === 'all' ? D.signals.length : D.signals.filter((s) => s.source === k).length}</span></button>`)}</div>
        <span className="grow"></span>
        <div className="seg">${[['top', 'Most liked'], ['new', 'Newest']].map(([k, l]) => html`<button key=${k} className=${sort === k ? 'on' : ''} onClick=${() => set('sort', k)}>${l}</button>`)}</div>
      </div>
      <div className="sig-cols">${list.map((s) => html`<${SignalCard} key=${s.id} s=${s} />`)}</div>
    </div>`;
  }

  // ---------- Production ----------
  function Production() {
    const { parts } = window.CC.useRoute();
    const view = parts[1] || 'board';
    const st = useStore();
    return html`<div className=${'page' + (view === 'board' ? ' wide' : '')} style=${view === 'board' ? { maxWidth: 'none', paddingLeft: 24, paddingRight: 24 } : null}>
      <div className="page-head"><div><h1>Production</h1><div className="lede">Every video from idea to published. Drag a card to move it.</div></div>
        <div className="actions">
          <div className="seg">${[['board', 'Board', 'SquareKanban'], ['table', 'Table', 'Table'], ['calendar', 'Calendar', 'Calendar']].map(([k, l, i]) => html`<button key=${k} className=${view === k ? 'on' : ''} onClick=${() => go('production' + (k === 'board' ? '' : '/' + k))}><${Icon} name=${i} size=${14} />${l}</button>`)}</div>
          <button className="btn primary" onClick=${() => st.openNew()}><${Icon} name="Plus" size=${15} />New video</button>
        </div></div>
      ${view === 'board' ? html`<${Kanban} />` : view === 'table' ? html`<${TableView} />` : html`<${CalendarView} />`}
    </div>`;
  }
  function Kanban() {
    const st = useStore();
    const [drag, setDrag] = useState(null);
    const [over, setOver] = useState(null);
    const cols = STAGES.map((s) => {
      let vs = st.videos.filter((v) => v.stage === s.id && !v.hidden);
      vs.sort((a, b) => s.id === 'published' ? (b.publishedAt || '').localeCompare(a.publishedAt || '') : a.order - b.order);
      return { s, all: vs, vs: s.id === 'ideas' ? vs.slice(0, 6) : vs };
    });
    const EMPTY = { planning: 'Start planning an idea to bring it here.', recording: 'Videos land here once their scenes are planned.', editing: 'Recorded videos land here.', publishing: "Nothing waiting to publish. Finish editing a video and it moves here.", published: 'Paste the YouTube link on a finished video to land it here.', ideas: 'Break down a video to get your first idea.' };
    return html`<div className="kanban">${cols.map(({ s, vs, all }) => html`<div key=${s.id} className=${'col' + (over === s.id ? ' over' : '')}
        onDragOver=${(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave=${() => setOver(null)}
        onDrop=${(e) => { e.preventDefault(); setOver(null); if (drag) st.setStage(drag, s.id); setDrag(null); }}>
      <div className="col-h"><span className=${'stage-pill st-' + s.id}><span className="d"></span>${s.label}</span><span className="n">${all.length}</span></div>
      ${vs.map((v) => html`<${KCard} key=${v.id} v=${v} dragging=${drag === v.id} onDrag=${setDrag} />`)}
      ${s.id === 'ideas' && all.length > vs.length && html`<button className="addscene" style=${{ height: 34 }} onClick=${() => go('ideas')}>View all ${all.length} ideas</button>`}
      ${!vs.length && html`<div className="col-empty">${EMPTY[s.id]}</div>`}
    </div>`)}</div>`;
  }
  function KCard({ v, dragging, onDrag }) {
    const na = nextAction(v);
    return html`<div className=${'card kcard hov' + (dragging ? ' dragging' : '')} draggable="true" onDragStart=${(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', v.id); onDrag(v.id); }} onDragEnd=${() => onDrag(null)}
      onClick=${() => v.stage === 'ideas' ? go('ideas?open=' + v.id) : openVideo(v)} tabIndex="0" onKeyDown=${(e) => e.key === 'Enter' && openVideo(v)}>
      <${Thumb} v=${v} chip=${v.own ? html`<${MultChip} m=${v.views / D.usualViews} onThumb=${true} />` : null} />
      <div className="tt clamp2">${chosenTitle(v)}</div>
      ${v.scenes.length > 0 && html`<div className="na"><${SceneDots} v=${v} /><span>${recordedCount(v)} of ${v.scenes.length} scenes</span></div>`}
      <div className="na" style=${{ color: v.stage === 'published' ? 'var(--text-2)' : 'var(--accent-text)', fontWeight: 550 }}><${Icon} name=${na.icon || 'ArrowRight'} size=${13} />${na.label}${v.plannedDate && v.stage !== 'published' ? html`<span className="faint" style=${{ marginLeft: 'auto', fontWeight: 500 }}>${fmtDate(v.plannedDate)}</span>` : v.own ? html`<span className="faint" style=${{ marginLeft: 'auto', fontWeight: 500 }}>${fmtDate(v.publishedAt)}</span>` : null}</div>
    </div>`;
  }
  function TableView() {
    const st = useStore();
    const [sort, setSort] = useState({ k: 'stage', d: 1 });
    const idx = (s) => STAGES.findIndex((x) => x.id === s);
    const rows = st.videos.filter((v) => !v.hidden).slice().sort((a, b) => {
      const k = sort.k; let r = 0;
      if (k === 'stage') r = idx(b.stage) - idx(a.stage) || a.order - b.order;
      if (k === 'title') r = chosenTitle(a).localeCompare(chosenTitle(b));
      if (k === 'views') r = (b.views || 0) - (a.views || 0);
      if (k === 'date') r = (b.publishedAt || b.plannedDate || '').localeCompare(a.publishedAt || a.plannedDate || '');
      if (k === 'scenes') r = recordedCount(b) - recordedCount(a);
      return r * sort.d;
    });
    const th = (k, l) => html`<th onClick=${() => setSort({ k, d: sort.k === k ? -sort.d : 1 })} aria-sort=${sort.k === k ? (sort.d > 0 ? 'descending' : 'ascending') : 'none'}>${l}${sort.k === k ? (sort.d > 0 ? ' ↓' : ' ↑') : ''}</th>`;
    return html`<div className="card" style=${{ overflow: 'hidden' }}><table className="table">
      <thead><tr>${th('title', 'Video')}${th('stage', 'Stage')}${th('scenes', 'Scenes recorded')}${th('date', 'Publish date')}${th('views', 'Views')}</tr></thead>
      <tbody>${rows.map((v) => html`<tr key=${v.id} onClick=${() => v.stage === 'ideas' ? go('ideas?open=' + v.id) : openVideo(v)}>
        <td><div className="row" style=${{ gap: 12 }}><${Thumb} v=${v} style=${{ width: 72, flex: 'none', borderRadius: 5 }} /><span style=${{ fontWeight: 550 }}>${chosenTitle(v)}</span></div></td>
        <td><${StagePill} stage=${v.stage} /></td>
        <td>${v.scenes.length ? html`<span className="row"><${SceneDots} v=${v} /><span className="muted tnum">${recordedCount(v)} of ${v.scenes.length}</span></span>` : html`<span className="faint">—</span>`}</td>
        <td className="tnum">${v.publishedAt ? fmtDate(v.publishedAt) : v.plannedDate ? html`<span className="muted">${fmtDate(v.plannedDate)} · planned</span>` : html`<span className="faint">—</span>`}</td>
        <td className="tnum">${v.views ? html`<span className="row"><b>${fmtNum(v.views)}</b><${MultChip} m=${v.views / D.usualViews} /></span>` : html`<span className="faint">—</span>`}</td>
      </tr>`)}</tbody></table></div>`;
  }
  function CalendarView() {
    const st = useStore();
    const [ym, setYm] = useState([2026, 9]);
    const [y, m] = ym;
    const first = new Date(y, m, 1);
    const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
    const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const evs = {};
    st.videos.forEach((v) => { const d = v.publishedAt || v.plannedDate; if (d) (evs[d] = evs[d] || []).push(v); });
    const unscheduled = st.videos.filter((v) => ['planning', 'recording', 'editing', 'publishing'].includes(v.stage) && !v.plannedDate);
    return html`<div>
      <div className="row" style=${{ marginBottom: 12 }}>
        <h2 className="sec" style=${{ fontSize: 17 }}>${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m]} ${y}</h2>
        <button className="btn sm icon-only" aria-label="Previous month" onClick=${() => setYm(m === 0 ? [y - 1, 11] : [y, m - 1])}><${Icon} name="ChevronLeft" size=${15} /></button>
        <button className="btn sm icon-only" aria-label="Next month" onClick=${() => setYm(m === 11 ? [y + 1, 0] : [y, m + 1])}><${Icon} name="ChevronRight" size=${15} /></button>
        <button className="btn sm" onClick=${() => setYm([2026, 9])}>Today</button>
        <span className="grow"></span>
        ${unscheduled.length > 0 && html`<span className="small muted">Not scheduled: ${unscheduled.map((v, i) => html`<button key=${v.id} className="linkish" onClick=${() => openVideo(v, 'publish')}>${chosenTitle(v)}${i < unscheduled.length - 1 ? ', ' : ''}</button>`)}</span>`}
      </div>
      <div className="cal">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => html`<div key=${d} className="dow">${d}</div>`)}
        ${days.map((d) => { const k = iso(d); return html`<div key=${k} className=${'day' + (d.getMonth() !== m ? ' out' : '') + (k === TODAY ? ' today' : '')}>
          <span className="dn">${d.getDate()}</span>
          ${(evs[k] || []).map((v) => html`<div key=${v.id} className=${'ev st-' + v.stage} onClick=${() => openVideo(v)} title=${chosenTitle(v)}>
            <${Thumb} v=${v} className="mini" style=${{ width: 30, height: 17, aspectRatio: 'auto', borderRadius: 3, flex: 'none' }} />
            <span className="ellipsis">${chosenTitle(v)}</span></div>`)}
        </div>`; })}
      </div>
    </div>`;
  }

  // ---------- Settings ----------
  function Settings() {
    const st = useStore();
    const { parts } = window.CC.useRoute();
    const sec = parts[1] || 'ai';
    const [gem, setGem] = useState('');
    const [gemSaved, setGemSaved] = useState(false);
    const [gpt, setGpt] = useState(false);
    const ch = st.channel;
    useEffect(() => { const el = document.getElementById('set-' + sec); el && el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [sec]);
    return html`<div className="page" style=${{ maxWidth: 1040 }}>
      <div className="page-head"><div><h1>Settings</h1><div className="lede">Your AI, your channel, and how CreatorClub looks.</div></div></div>
      <div className="set">
        <nav className="set-nav">${[['ai', 'Connected AI', 'Bot'], ['channel', 'Channel', 'Youtube'], ['appearance', 'Appearance', 'Sun']].map(([k, l, i]) => html`<a key=${k} href=${'#/settings/' + k} className=${'nav-item' + (sec === k ? ' active' : '')}><${Icon} name=${i} size=${16} /><span className="label">${l}</span></a>`)}</nav>
        <div>
          <section className="set-sec" id="set-ai"><h2>Connected AI</h2><p>CreatorClub uses your own Claude or ChatGPT account. Nothing is billed here.</p>
            <div className="card">
              <div className="srow"><span className="logo" style=${{ background: '#f4e9e1', color: '#c15f3c' }}><${Icon} name="Sparkles" size=${20} /></span>
                <div className="grow"><div style=${{ fontWeight: 600 }}>Claude</div><div className="small muted row"><span className="dotok"></span>Connected as ${ch.name} · used for ideas, packaging, scenes and scripts</div></div>
                <button className="btn sm" onClick=${() => st.toast('Signed out of Claude', { undo: () => {} })}>Sign out</button></div>
              <div className="srow"><span className="logo" style=${{ background: 'var(--bg-sunk)' }}><${Icon} name="Bot" size=${20} /></span>
                <div className="grow"><div style=${{ fontWeight: 600 }}>ChatGPT</div><div className="small muted">${gpt ? html`<span className="row"><span className="dotok"></span>Connected · used when Claude is busy</span>` : 'Optional. Used when Claude is unavailable.'}</div></div>
                ${gpt ? html`<button className="btn sm" onClick=${() => setGpt(false)}>Sign out</button>` : html`<button className="btn sm" onClick=${() => { setGpt(true); st.toast('Connected ChatGPT'); }}>Connect ChatGPT</button>`}</div>
              <div className="srow" style=${{ alignItems: 'flex-start' }}><span className="logo" style=${{ background: '#e8effd', color: '#1d4ed8' }}><${Icon} name="Eye" size=${20} /></span>
                <div className="grow"><div style=${{ fontWeight: 600 }}>Gemini <span className="chip" style=${{ marginLeft: 6 }}>Optional</span></div><div className="small muted" style=${{ marginBottom: 10 }}>Lets CreatorClub watch videos with sound and motion when it breaks them down.</div>
                  ${gemSaved ? html`<div className="row small"><span className="dotok"></span>Key saved · breakdowns now say "Watched with Gemini" <button className="linkish" onClick=${() => { setGemSaved(false); setGem(''); }}>Remove</button></div>`
                    : html`<div className="row"><input className="input" type="password" autoComplete="off" value=${gem} onChange=${(e) => setGem(e.target.value)} placeholder="Paste your Gemini API key" style=${{ maxWidth: 340 }} aria-label="Gemini API key" /><button className="btn" disabled=${gem.length < 8} onClick=${() => { setGemSaved(true); st.toast('Saved Gemini key'); }}>Save key</button></div>`}
                </div></div>
            </div></section>
          <section className="set-sec" id="set-channel"><h2>Channel</h2><p>What CreatorClub knows about your channel. It shapes every idea and script.</p>
            <div className="card" style=${{ padding: 18 }}>
              <div className="row" style=${{ gap: 14, marginBottom: 18 }}><${Avatar} name=${ch.name} size="lg" color=${ch.color} />
                <div className="grow"><div style=${{ fontWeight: 650, fontSize: 15 }}>${ch.name}</div><div className="small muted">${ch.handle || 'No YouTube channel yet'}${ch.url ? html`<a style=${{ marginLeft: 6 }} href=${ch.url} target="_blank" rel="noopener" style=${{ color: 'var(--accent-text)' }}>Open on YouTube</a>` : ''}</div></div>
                <button className="btn sm" onClick=${() => go('welcome')}>Run setup again</button></div>
              <label className="field">About</label>
              <textarea className="input" rows="2" defaultValue=${ch.about} aria-label="About the channel"></textarea>
              <label className="field" style=${{ marginTop: 16 }}>Topics</label>
              <div className="row" style=${{ flexWrap: 'wrap' }}>${(ch.topics || []).map((t) => html`<span key=${t} className="tag">${window.CC.sentence(t)}</span>`)}<button className="btn sm ghost"><${Icon} name="Plus" size=${14} />Add topic</button></div>
              ${ch.id === 'samin' && html`<${Fragment}>
                <label className="field" style=${{ marginTop: 16 }}>Ending rule</label>
                <div className="muted" style=${{ fontSize: 13.5 }}>${window.CC.sentence(D.profile.cta)}</div>
                <label className="field" style=${{ marginTop: 16 }}>Voice guide</label>
                <div className="card" style=${{ padding: 14, background: 'var(--surface-2)', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)' }}>${D.voiceSummary}<div className="small faint" style=${{ marginTop: 8 }}>Built from 9 of your transcripts.</div></div>
              <//>`}
            </div></section>
          <section className="set-sec" id="set-appearance"><h2>Appearance</h2><p>Light is the default. Dark is easier at night.</p>
            <div className="theme-pick">${[['light', 'Light', '#f8f7f4', '#fff'], ['dark', 'Dark', '#161615', '#1e1e1d']].map(([k, l, a, b]) => html`<button key=${k} className=${st.theme === k ? 'on' : ''} onClick=${() => st.setTheme(k)}>
              <div className="sw" style=${{ background: a, display: 'flex', gap: 6, padding: 8 }}><div style=${{ width: 30, borderRadius: 4, background: k === 'light' ? '#efece7' : '#232322' }}></div><div style=${{ flex: 1, borderRadius: 6, background: b, border: '1px solid ' + (k === 'light' ? '#e9e6e1' : '#2f2e2c') }}></div></div>
              <span className="row">${st.theme === k && html`<${Icon} name="Check" size=${14} />`}${l}</span></button>`)}</div>
          </section>
        </div>
      </div>
    </div>`;
  }

  Object.assign(window.CC, { Overview, Ideas, Trending, Signals, Production, Settings, Breakdown, BreakdownDrawer, TrendCard, SignalCard, ytIdFrom, openVideo });
})();
