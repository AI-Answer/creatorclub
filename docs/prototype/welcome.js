/* First launch: connect AI → channel (add or start fresh) → voice → what's working → first idea. */
(function () {
  const { useState, useEffect, Fragment } = React;
  const { html, D, C, Icon, fmtNum, multFor, trendById, useStore, go, Avatar, MultChip, Thumb, Breakdown } = window.CC;

  const STEP_INFO = [
    { t: 'Connect your AI', why: 'CreatorClub uses your own Claude or ChatGPT account to find ideas and write your talking points. Nothing is billed here.' },
    { t: 'Do you have a YouTube channel?', why: "Either is fine. With a channel we learn your topics and how you talk from your videos. Without one, you tell us in a minute." },
    { t: 'How you talk', why: 'Talking points get written in your words, so recording feels like you, not like reading.' },
    { t: "Here's what's working in your space", why: "You don't need to know what to make yet. Pick a video that's doing well, see why, and keep the concept you'd make." },
  ];

  function Welcome() {
    const st = useStore();
    const [step, setStep] = useState(0);
    const [claude, setClaude] = useState('idle'); // idle | busy | on
    const [gpt, setGpt] = useState('idle');
    const [path, setPath] = useState(null); // 'channel' | 'fresh'
    const [url, setUrl] = useState('');
    const [reading, setReading] = useState(-1);
    const [name, setName] = useState('');
    const [chName, setChName] = useState('');
    const [topics, setTopics] = useState([]);
    const [other, setOther] = useState('');
    const [aud, setAud] = useState([]);
    const [answers, setAnswers] = useState({});
    const [pick, setPick] = useState(null);
    const W = C.WELCOME;

    useEffect(() => { if (reading >= 0 && reading < 3) { const t = setTimeout(() => setReading(reading + 1), 900); return () => clearTimeout(t); } }, [reading]);
    const connect = (which) => { (which === 'claude' ? setClaude : setGpt)('busy'); setTimeout(() => (which === 'claude' ? setClaude : setGpt)('on'), 1400); };
    const toggle = (arr, set, x) => set(arr.includes(x) ? arr.filter((y) => y !== x) : arr.concat(x));
    const freshReady = name.trim() && (topics.length || other.trim()) && aud.length;
    const canNext = [claude === 'on' || gpt === 'on', path === 'channel' ? reading >= 3 : path === 'fresh' ? !!freshReady : false, true, false][step];
    const finish = (ideaFn) => {
      let ch = 'samin';
      if (path === 'fresh') ch = st.createFresh({ person: name.trim(), name: chName.trim() || name.trim() + "'s channel", topics: topics.concat(other.trim() ? [other.trim()] : []), audience: aud, about: answers[0] || '' });
      else st.setActive('samin');
      st.markOnboarded();
      return ch;
    };
    const jobTrends = D.jobs.map((j) => trendById[j.video.videoId]).filter(Boolean);
    const moreTrends = D.trending.filter((t) => t.mult && t.fit && !jobTrends.includes(t)).sort((a, b) => b.mult - a.mult).slice(0, 3);
    useEffect(() => { window.scrollTo(0, 0); }, [step, pick]);

    const body = () => {
      if (step === 0) return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        ${[['claude', 'Claude', 'Recommended. Used for ideas, packaging, scenes and scripts.', claude, '#f4e9e1', '#c15f3c', 'Sparkles'], ['gpt', 'ChatGPT', 'Works the same way, if that is the account you have.', gpt, 'var(--bg-sunk)', 'var(--text)', 'Bot']].map(([k, l, d, s, bg, fg, ic]) => html`<div key=${k} className="card srow" style=${{ borderBottom: '1px solid var(--line)' }}>
          <span className="logo" style=${{ background: bg, color: fg }}><${Icon} name=${ic} size=${20} /></span>
          <div className="grow"><div style=${{ fontWeight: 600 }}>${l}</div><div className="small muted">${s === 'on' ? html`<span className="row"><span className="dotok"></span>Connected with your ${l} account</span>` : s === 'busy' ? 'Finish signing in in your browser…' : d}</div></div>
          ${s === 'on' ? html`<span className="chip b-green"><${Icon} name="Check" size=${12} />Connected</span>` : html`<button className=${'btn ' + (k === 'claude' && claude !== 'on' && gpt !== 'on' ? 'primary' : '')} disabled=${s === 'busy'} onClick=${() => connect(k)}>${s === 'busy' ? html`<${Fragment}><span className="spin"></span>Waiting<//>` : 'Connect ' + l}</button>`}
        </div>`)}
        <div className="small muted" style=${{ marginTop: 4 }}>Opens ${claude === 'busy' ? "Claude's" : 'the'} own sign-in page in your browser. CreatorClub never sees your password.</div>
      </div>`;
      if (step === 1) return html`<div>
        <div className="grid g2" style=${{ gap: 12, marginBottom: 18 }}>${[['channel', 'Youtube', 'Add my channel', "Paste the link. We'll read your recent videos."], ['fresh', 'Sprout', "I'm starting fresh", 'No channel yet. Tell us what you want to talk about.']].map(([k, ic, t, d]) => html`<button key=${k} className=${'topt' + (path === k ? ' on' : '')} style=${{ flexDirection: 'column', gap: 8, padding: 16, textAlign: 'left', background: path === k ? 'var(--surface-2)' : 'var(--surface)' }} onClick=${() => setPath(k)} aria-pressed=${path === k}>
          <span className="row" style=${{ width: '100%' }}><${Icon} name=${ic} size=${20} /><span className="grow"></span><span className="radio"></span></span><b style=${{ fontSize: 15 }}>${t}</b><span className="small muted">${d}</span></button>`)}</div>
        ${path === 'channel' && html`<div className="card" style=${{ padding: 16 }}>
          ${reading < 0 ? html`<form onSubmit=${(e) => { e.preventDefault(); if (url.trim()) setReading(0); }}><label className="field" htmlFor="ch-url">Your channel</label><div className="row"><input id="ch-url" className="input" autoFocus value=${url} onChange=${(e) => setUrl(e.target.value)} placeholder="youtube.com/@yourchannel" /><button className="btn primary" type="submit" disabled=${!url.trim()}>Add channel</button></div>
            <div className="small muted" style=${{ marginTop: 8 }}>Try <button type="button" className="linkish" onClick=${() => setUrl('youtube.com/@SaminYasar_')}>youtube.com/@SaminYasar_</button></div></form>`
          : html`<${Fragment}><div className="bd-steps">${[`Found ${D.profile.name} · @SaminYasar_`, 'Reading your last 9 videos', 'Writing your voice guide'].map((s, i) => html`<div key=${i} className=${'bd-step' + (reading === i ? ' on' : reading > i ? ' done' : '')}>${reading > i ? html`<${Icon} name="CircleCheck" size=${16} style=${{ color: 'var(--ok)' }} />` : reading === i ? html`<span className="spin"></span>` : html`<${Icon} name="Circle" size=${16} />`}${s}</div>`)}</div>
            ${reading >= 3 && html`<div className="row" style=${{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', gap: 12 }}><${Avatar} name=${D.profile.name} size="lg" color="#d9480f" /><div className="grow"><b>${D.profile.name}</b><div className="small muted">${D.profile.about}</div></div><div style=${{ textAlign: 'right' }}><div className="tnum" style=${{ fontWeight: 650 }}>${fmtNum(D.usualViews)}</div><div className="small faint">usual views</div></div></div>`}<//>`}
        </div>`}
        ${path === 'fresh' && html`<div className="card" style=${{ padding: 18 }}>
          <div className="grid g2" style=${{ gap: 12, marginBottom: 16 }}>
            <div><label className="field" htmlFor="w-name">Your first name</label><input id="w-name" className="input" autoFocus value=${name} onChange=${(e) => setName(e.target.value)} placeholder="Alex" /></div>
            <div><label className="field" htmlFor="w-ch">Channel name <span className="faint" style=${{ fontWeight: 500 }}>· optional</span></label><input id="w-ch" className="input" value=${chName} onChange=${(e) => setChName(e.target.value)} placeholder="You can decide later" /></div>
          </div>
          <label className="field">What do you want to talk about?</label>
          <div className="row" style=${{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>${W.topics.map((t) => html`<button key=${t} className=${'chip ' + (topics.includes(t) ? 'b-blue' : 'outline')} style=${{ height: 30, padding: '0 12px', cursor: 'pointer', fontSize: 13 }} aria-pressed=${topics.includes(t)} onClick=${() => toggle(topics, setTopics, t)}>${topics.includes(t) && html`<${Icon} name="Check" size=${12} stroke=${2.6} />`}${t}</button>`)}</div>
          <input className="input" value=${other} onChange=${(e) => setOther(e.target.value)} placeholder="Something else? Type it here" style=${{ marginBottom: 16 }} aria-label="Other topic" />
          <label className="field">Who is it for?</label>
          <div className="row" style=${{ flexWrap: 'wrap', gap: 6 }}>${W.audiences.map((t) => html`<button key=${t} className=${'chip ' + (aud.includes(t) ? 'b-blue' : 'outline')} style=${{ height: 30, padding: '0 12px', cursor: 'pointer', fontSize: 13 }} aria-pressed=${aud.includes(t)} onClick=${() => toggle(aud, setAud, t)}>${aud.includes(t) && html`<${Icon} name="Check" size=${12} stroke=${2.6} />`}${t}</button>`)}</div>
          ${!freshReady && html`<div className="small faint" style=${{ marginTop: 14 }}>Add your name, at least one topic and who it's for to continue.</div>`}
        </div>`}
      </div>`;
      if (step === 2) return path === 'channel' ? html`<div className="card" style=${{ padding: 18 }}>
          <div className="row" style=${{ marginBottom: 10 }}><${Icon} name="CircleCheck" size=${16} style=${{ color: 'var(--ok)' }} /><b>Learned from 9 of your videos</b></div>
          <div className="muted" style=${{ lineHeight: 1.6, fontSize: 14 }}>${D.voiceSummary}</div>
          <div className="small faint" style=${{ marginTop: 12 }}>You can change this any time in Settings.</div></div>`
        : html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 14 }}>${W.voice.map((q, i) => html`<div key=${i} className="card" style=${{ padding: 16 }}>
          <div className="row" style=${{ alignItems: 'flex-start' }}><span className="chip" style=${{ flex: 'none' }}>${i + 1} of 3</span><b style=${{ fontSize: 14.5 }}>${q.q}</b></div>
          <div className="small muted" style=${{ margin: '4px 0 10px' }}>${q.why}</div>
          ${q.options ? html`<div className="row" style=${{ flexWrap: 'wrap', gap: 6 }}>${q.options.map((o) => html`<button key=${o} className=${'chip ' + (answers[i] === o ? 'b-blue' : 'outline')} style=${{ height: 30, padding: '0 12px', cursor: 'pointer', fontSize: 13 }} onClick=${() => setAnswers(Object.assign({}, answers, { [i]: o }))} aria-pressed=${answers[i] === o}>${o}</button>`)}</div>`
            : html`<textarea className="input" rows="2" value=${answers[i] || ''} onChange=${(e) => setAnswers(Object.assign({}, answers, { [i]: e.target.value }))} placeholder=${q.ph} aria-label=${q.q}></textarea>`}
        </div>`)}<div className="small faint">All three are optional. Skip any you're unsure about.</div></div>`;
      if (step === 3) return html`<div>
        ${!pick ? html`<${Fragment}>
          <div className="grid g3" style=${{ gap: 12 }}>${jobTrends.map((t) => html`<div key=${t.videoId} className="card trend hov" onClick=${() => setPick(t.videoId)} tabIndex="0" onKeyDown=${(e) => e.key === 'Enter' && setPick(t.videoId)}>
            <${Thumb} videoId=${t.videoId} chip=${html`<${MultChip} m=${multFor(t)} onThumb=${true} />`} />
            <div className="meta"><${Avatar} name=${t.channel} size="xs" /><span className="ellipsis">${t.channel}</span></div>
            <div className="tt clamp2" style=${{ fontSize: 13.5 }}>${t.title}</div>
            <div className="stats"><span><b>${fmtNum(t.views)}</b> views</span><span><b>${fmtNum(t.vpd)}</b>/day</span></div>
            <button className="btn sm" onClick=${(e) => { e.stopPropagation(); setPick(t.videoId); }}><${Icon} name="Sparkles" size=${14} />Break this down</button>
          </div>`)}</div>
          <div className="row" style=${{ margin: '22px 0 10px' }}><b style=${{ fontSize: 14 }}>More outliers from channels you might follow</b></div>
          <div className="grid g3" style=${{ gap: 12 }}>${moreTrends.map((t) => html`<div key=${t.videoId} className="card trend hov" onClick=${() => setPick(t.videoId)} tabIndex="0" onKeyDown=${(e) => e.key === 'Enter' && setPick(t.videoId)}>
            <${Thumb} videoId=${t.videoId} chip=${html`<${MultChip} m=${multFor(t)} onThumb=${true} />`} />
            <div className="meta"><${Avatar} name=${t.channel} size="xs" /><span className="ellipsis">${t.channel}</span></div>
            <div className="tt clamp2" style=${{ fontSize: 13.5 }}>${t.title}</div>
            <div className="stats"><span><b>${fmtNum(t.views)}</b> views</span><span><b>${fmtNum(t.vpd)}</b>/day</span></div>
          </div>`)}</div>
          <div className="small muted" style=${{ marginTop: 12 }}>The coloured chip shows how far a video beat its channel's usual views: blue 1 to 3×, green 3 to 5×, amber 5 to 10×, orange 10× and up. You'll find ${D.trending.length} more in Working now.</div>
        <//>` : html`<div className="card" style=${{ overflow: 'hidden' }}>
          <div className="row" style=${{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}><button className="btn ghost sm" onClick=${() => setPick(null)}><${Icon} name="ChevronLeft" size=${14} />Pick another video</button><span className="grow"></span><span className="small muted">Add the concept you'd make. That's your first idea.</span></div>
          <${Breakdown} videoId=${pick} firstName=${path === 'fresh' ? (name.trim() || 'you') : 'Samin'} onAdded=${(id) => { go('ideas?new=' + id); }} onBack=${() => setPick(null)} />
        </div>`}
      </div>`;
    };

    // When a concept is added on step 4, the channel must exist first so the idea lands in it.
    useEffect(() => { if (step === 3) finish(); }, [step]);

    return html`<div style=${{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div className="row" style=${{ padding: '18px 28px' }}><span className="logo" style=${{ width: 30, height: 30, borderRadius: 8, background: 'var(--primary)', color: 'var(--on-primary)' }}><${Icon} name="Clapperboard" size=${16} /></span><b style=${{ letterSpacing: '-0.01em' }}>CreatorClub</b>
        <span className="grow"></span><button className="linkish" style=${{ color: 'var(--text-2)' }} onClick=${() => { st.markOnboarded(); go('overview'); }}>Skip setup</button></div>
      <main style=${{ flex: 1, display: 'flex', justifyContent: 'center', padding: '20px 24px 60px' }}>
        <div style=${{ width: step === 3 ? 900 : 640, maxWidth: '100%' }} key=${step} className="page" >
          <div className="row" style=${{ marginBottom: 14, gap: 10 }}>
            <span className="small muted tnum">Step ${step + 1} of 4</span>
            <div style=${{ display: 'flex', gap: 4, flex: 1, maxWidth: 220 }}>${[0, 1, 2, 3].map((i) => html`<span key=${i} style=${{ flex: 1, height: 4, borderRadius: 4, background: i <= step ? 'var(--primary)' : 'var(--line-strong)', transition: 'background .3s' }}></span>`)}</div>
          </div>
          <h1 style=${{ fontSize: 28, letterSpacing: '-0.025em', margin: '0 0 8px', lineHeight: 1.15 }}>${step === 2 && path === 'channel' ? 'This is how you talk' : STEP_INFO[step].t}</h1>
          <p className="muted" style=${{ margin: '0 0 22px', fontSize: 15, lineHeight: 1.55, maxWidth: 600 }}>${STEP_INFO[step].why}</p>
          ${body()}
          <div className="row" style=${{ marginTop: 26 }}>
            ${step > 0 ? html`<button className="btn ghost" onClick=${() => { setStep(step - 1); setPick(null); }}><${Icon} name="ChevronLeft" size=${15} />Back</button>` : html`<span></span>`}
            <span className="grow"></span>
            ${step === 2 && path === 'fresh' && html`<button className="btn ghost" onClick=${() => setStep(3)}>Skip questions</button>`}
            ${step < 3 ? html`<button className=${'btn ' + (canNext ? 'primary' : '')} disabled=${!canNext} onClick=${() => setStep(step + 1)}>Continue<${Icon} name="ChevronRight" size=${15} /></button>`
              : html`<button className="btn" onClick=${() => go('overview')}>I'll look around first<${Icon} name="ChevronRight" size=${15} /></button>`}
          </div>
        </div>
      </main>
    </div>`;
  }
  Object.assign(window.CC, { Welcome });
})();
