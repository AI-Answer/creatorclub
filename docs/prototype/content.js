/* Authored content for screens whose data doesn't exist yet (packages, scenes, takes, transcript).
   Written to match Samin's real ideas, outlines and voice guide. */
(function () {
  const T = (titles, thumb) => ({ titles, thumb });

  // Title options (7 words or fewer, a claim or fix) and thumbnail text, per video id.
  const PACK = {
    'agent-cost': T(['What My AI Agent Really Costs a Month', 'My Real Monthly AI Agent Bill', 'AI Agents Cost Less Than You Think'], 'My real bill'),
    'agent-inbox-week': T(['I Let an AI Agent Run My Inbox for a Week', 'AI Agent vs 5 Planted Scam Emails', 'One Week, One AI Agent, My Inbox'], '5 scams planted'),
    'agent-safety': T(['How to Protect Your AI Agent and Your Money', 'Set Up Your AI Agent Safely', 'Stop Your AI Agent Spending Your Money'], 'Lock it down'),
    'beginner-agent': T(['A Total Beginner Builds an AI Agent in 20 Minutes', 'A Real Beginner Builds an AI Agent', 'No Code, 20 Minutes, One AI Agent'], 'Total beginner. 20 min'),
    'claude-course': T(['Claude Full Course: Beginner to Building', 'Learn Claude From Zero to Building', 'The Only Claude Course You Need'], 'Beginner → building'),
    'claude-plus-app': T(['Claude + an App You Already Use', 'Claude Inside the App You Already Own', 'Your Everyday App, Now With Claude'], 'Claude + your app'),
    'duet-vs-grok': T(['Claude Duet vs Grok Bot: What Each Costs', 'Claude Duet vs Grok Bot, Real Costs', 'What Duet and Grok Bot Really Cost'], 'Which costs more'),
    'hidden-features': T(["Hidden AI Features You're Not Using", 'Your AI Tool Has Features You Missed', 'Claude Hidden Features Nobody Shows You'], 'Nobody showed you this'),
    'idea-1a179c8273f-0': T(['Will Claude Duet Send Without Asking', 'Claude Duet Buy Test: Does It Ask', 'I Tested Whether Claude Duet Asks First'], 'Asks first?'),
    'idea-1a179c8273f-1': T(["Still Using Claude Like It's 2024?", 'Same Task Twice: Old Claude vs New', 'Your Claude Habits Are From 2024'], '2024 vs now'),
    'idea-1a179c8273f-2': T(['Claude Made This Video, No Editing', 'Make a Full Video by Just Asking', 'Can Claude Make a Video With No Editing?'], 'Zero editing'),
    'idea-1a179ca7065-0': T(['Make Claude Plan Before It Builds', 'Plan First: Claude Builds It Right', 'Why Should Claude Plan Before It Builds?'], 'Plan first'),
    'idea-1a179ca7065-1': T(['One Phone Photo, One Full Ad', 'Turn a Phone Photo Into an Ad', 'One Phone Photo Into a Full Ad?'], 'Photo → ad'),
    'idea-1a179ce142b-0': T(['Stop Switching for Every New Model', 'When a New AI Model Is Worth It', 'Should You Switch for Every New Model?'], "Don't switch yet"),
    'idea-1a179ce142b-1': T(['7 Daily Tasks AI Should Do', 'Hand These 7 Tasks to AI', 'Which 7 Daily Tasks Should AI Do?'], '7 tasks gone'),
    'idea-1a179ce142b-2': T(['NotebookLM Is the Free AI Tutor', 'Turn NotebookLM Into Your Tutor', 'Can NotebookLM Be Your AI Tutor?'], 'Free AI tutor'),
    'idea-1a179e170fc-0': T(['Build a Claude Skill Without Coding', 'Your First Claude Skill, No Code', 'Build a Claude Skill Without Coding?'], 'No-code skill'),
    'idea-1a17a020d9e-0': T(["Claude Code Isn't Too Technical", 'Claude Code for Non-Coders', 'Is Claude Code Really Too Technical?'], 'Not just for coders'),
    'idea-1a17a020d9e-1': T(['Build and Publish a Website With Claude', 'A Live Website in One Claude Chat', 'Claude Built and Published My Website'], 'Live in 1 chat'),
    'idea-1a17de2703c-0': T(['Claude + Google Vids: Full Animations on Autopilot', 'Full Animations Without Animating', 'Claude + Google Vids Animations, Automated'], 'Auto animations'),
    'idea-1a17de2703c-1': T(['Build an AI Agent Team, No Code', 'Build Your First AI Agent Team, No Code', 'Stop Using One AI Agent, Build a Team'], 'My AI team'),
    'idea-1a17de2703c-2': T(['Claude Does My Receipts and Expenses Automatically', 'Claude Sorts My Receipts Automatically', 'Never Type an Expense Again'], 'Receipts: done'),
    'idea-mvqz34xrzqp': T(['Run Claude Doctor: Fix Your Bloated Setup', 'One Command Cleans Up Claude', 'Your Claude Setup Is Bloated. Fix It'], '312 problems'),
    'idea-mvqz34xxdno': T(['One Chat That Runs Your Whole Project', 'One Claude Chat Runs Everything', 'Stop Juggling Five Claude Chats'], '1 chat, 5 jobs'),
    'idea-mvqz34y3fer': T(['Side Chats: Ask Claude Without Derailing It', 'Side Chats Keep Claude On Track', 'Ask Claude Without Losing Your Place'], "Don't derail it"),
    'learn-tool-20': T(['Learn a New Tool in 20 Minutes (Beginner)', 'Learn Any AI Tool in 20 Minutes', 'Higgsfield for Total Beginners'], '20 min'),
    'php-bug': T(['The AI-Found PHP Bug: Check Your Website', 'AI Found a PHP Bug. Check Your Site', 'Check Your Website for the PHP Bug'], 'Check your site'),
    'weekly-roundup': T(['10 Claude Updates You Missed This Week', 'Claude Updates You Missed This Week', 'This Week in Claude, in 10 Minutes'], '10 updates'),
    'which-claude-tab': T(['Cowork or Claude Code: Which Should You Use?', 'Cowork vs Claude Code, Explained Simply', 'When to Use Cowork, When to Use Code'], 'Which one?'),
  };

  const S = (title, dur, points, show, takes, extra) => Object.assign({ title, dur, points, show, takes: takes || [] }, extra || {});
  const take = (n, dur, kept) => ({ n, dur, kept: !!kept });

  const DETAIL = {
    'hidden-features': {
      target: 600,
      chosen: 0,
      hook: {
        visual: 'A feature already running on screen, mid-task. Cut to the three-level roadmap.',
        spoken: "This just did in one step what used to take me five. Most people never touch it, and it's sitting right there in your AI tool.",
        onscreen: '3 levels · no code',
      },
      angle: "A non-technical viewer finds the features in their AI tool they've never used, from a one-click setting to a setup that remembers them.",
      twist: 'Every feature is shown live and checked against the tool\'s docs first, in three levels, the way the phone "hidden features" videos do it.',
      scenes: [
        S('Opening', 45, [
          'Start on one feature already running. Say what it just did in one sentence.',
          '"Most people never touch this."',
          'Roadmap: Level 1 takes one click, Level 2 changes how you work, Level 3 makes it work for you.',
          '"If you\'re not technical, this is for you. Let\'s get into it."',
        ], 'The feature mid-run on screen, then the three levels as on-screen text.', [take(1, 52), take(2, 47, true)]),
        S('Why this matters', 60, [
          'Phone channels get huge views on "hidden features": everyone owns the thing and uses a sliver of it. AI tools are the same.',
          'Proof: iPhone versions got 710K and 530K views from one small channel.',
          'Analogy: a car dashboard where you only ever use the radio and the wipers.',
          'Name the false belief: "I need to be super technical." These are settings and menus, not code.',
        ], 'Quick cut to a phone settings page, then the AI tool\'s home screen.', [take(1, 64, true)]),
        S('Level 1: one-click features', 135, [
          'What a hidden feature is, with the car dashboard comparison.',
          'Two or three features that take one click or one sentence.',
          'For each: what it is in plain words, what it saves, what it costs.',
          'Say honestly if one is smaller than expected.',
        ], "Open the tool's docs, then do each feature live. Say the prompt aloud as it's typed.", [take(1, 141), take(2, 128)]),
        S('Level 2: a workflow that changes how you work', 180, [
          'This is where features stack: chain two or three into one real task.',
          'Handle a pile of messages, notes or a document, start to finish.',
          'Analogy: a phone shortcut that runs five taps at once.',
          'Time saved versus doing it by hand. If a step fails, show the fix.',
        ], 'The task start to finish, with the spoken prompt on screen. "I\'ll come back" while it works, then "okay, it got done".'),
        S('Level 3: set it up once, reuse it', 120, [
          "The biggest hidden win: set the tool up so it already knows you and your repeat jobs.",
          'Tie it to the "no AI employee working for me yet" problem.',
          'Analogy: training a new assistant once instead of explaining the job every morning.',
          'Run it on a fresh task. Give the setup time and cost honestly.',
        ], 'Build a small reusable setup live, then show it running on a fresh task.'),
        S('Ending', 40, [
          'Close on the Level 3 result.',
          "Where to find more features: the docs page, now you know what to look for.",
          '"Watch this video right here." Point to the agent teams video.',
        ], 'End screen with the agent teams video.'),
      ],
    },
    'idea-1a179c8273f-1': {
      target: 720,
      chosen: 0,
      plannedDate: '2026-10-31',
      hook: {
        visual: 'Two Claude windows side by side, the same task in both. Left is labelled 2024.',
        spoken: "Are you still using Claude the way you did in 2024? I'm going to run the same task twice, once the old way and once the new way, and you can judge the difference yourself.",
        onscreen: 'Same task. Twice.',
      },
      angle: 'One task, run twice on screen: the 2024 way and the current way, side by side, for a non-technical viewer who feels behind.',
      twist: 'Three rounds, each dropping one old habit, with the results from all three on one screen at the end.',
      scenes: [
        S('Hook', 30, ['"Are you still using Claude the way you did in 2024?"', 'Same task twice: old way, new way. You judge.'], 'Both windows side by side.', [take(1, 34, true)], { cut: 14 }),
        S('Setup', 75, ['For non-technical people who feel behind. No coding.', "Silicon Valley Girl's interview: 197K views at 32K a day. People are asking.", '"Even if you\'ve never touched anything beyond a basic chat."', 'State the task, then run round one the old way.'], 'The task card on screen.', [take(1, 88), take(2, 81, true)], { cut: 22 }),
        S('Round 1: drop the old habit', 165, ['The 2024 habit: one giant prompt, retyped every time.', 'Run it the old way, then with a saved instruction.', 'Rule: if you\'re repeating yourself to Claude, there\'s a feature for that.'], 'Both outputs side by side.', [take(1, 201, true)], { cut: 41 }),
        S('Round 2: stop redoing work', 180, ['Monday morning, starting from zero again.', 'Projects keep the context. Set it once.', 'Checklist: did I explain this before? Can Claude keep it? Then set it once.'], 'The project settings, then the same task with no re-explaining.', [take(1, 214, true)], { cut: 38 }),
        S('Round 3: hand over the bigger job', 195, ['Old way: every step by hand.', 'New way: hand Claude the whole job, check, adjust.', 'Loop: ask, check, adjust replaces retype, retry, give up.'], 'The full task both ways, results next to each other.', [take(1, 236), take(2, 247, true)], { cut: 52 }),
        S('Ending', 45, ['All three rounds\' results on one screen.', 'Pick one habit to change today.', '"If you want to keep going, watch this video right here."'], 'Side-by-side recap, then end screen.', [take(1, 70, true)], { cut: 25 }),
      ],
    },
    'idea-1a179c8273f-2': {
      target: 600,
      chosen: 0,
      plannedDate: '2026-11-07',
      hook: {
        visual: 'The finished clip plays first, full screen, no intro.',
        spoken: "I made this whole video by just asking Claude. No editing app. Let me show you exactly how, and where it broke.",
        onscreen: '0 editing apps',
      },
      angle: 'Samin makes one short clip start to finish on screen, using only prompts.',
      twist: 'He names the exact tool he uses, shows where it fails, and fixes it live, so beginners see the real limits.',
      scenes: [],
    },
    'idea-mvqz34xrzqp': { target: 540 },
  };

  // Transcript for the video in Editing. Segments: text, or {p: seconds} pause, or {r: text} repeat.
  const TRANSCRIPT = {
    'idea-1a179c8273f-1': [
      [["Are you still using Claude the way you did in 2024?"], { p: 1.8 }, ["I'm going to run the same task twice, once the old way and once the new way,"], { r: "once the old way and once the new way," }, ["and you can judge the difference yourself."]],
      [["Okay, so this one is for you if you're not technical and you feel like you're falling behind."], { p: 2.4 }, ["A video called Stop Using Claude Like It's 2024 has almost two hundred thousand views, so people are asking."], { p: 3.1 }, ["And even if you've never touched anything beyond a basic chat, you can follow this."], { r: "So the task is," }, ["So the task is a weekly update email for a small business. Let's do round one the old way."]],
      [["The 2024 habit is one giant prompt that you retype every single time."], { p: 2.2 }, ["Imagine handwriting the same letter every Monday."], { p: 4.6 }, ["Now watch what happens when I save that as an instruction once."], { r: "Now watch what happens when I" }, ["Same output, and I didn't type any of it."], { p: 1.9 }, ["So here's the rule: if you're repeating yourself to Claude, there's a feature for that."]],
      [["Round two. It's Monday morning and you're starting from zero again."], { p: 3.4 }, ["Projects keep the context for you, so you set it once."], { p: 2.7 }, ["Did I explain this before? Can Claude keep it? Then set it once."], { r: "Then set it once." }, ["Okay, it got done, and I didn't re-explain anything."]],
      [["Round three is the big one. The old way, I do every step by hand."], { p: 5.2 }, ["The new way, I hand Claude the whole job, and I'll come back once it's finished."], { p: 2.6 }, ["Okay, so it got done."], { r: "So it got done." }, ["Ask, check, adjust. That replaces retype, retry, give up."]],
      [["So here are all three rounds on one screen."], { p: 2.0 }, ["Pick one habit and change it today."], { p: 3.3 }, ["If you want to keep going, watch this video right here."]],
    ],
  };

  // The research board for the video in Recording (positions in canvas px).
  const BOARD = {
    'hidden-features': [
      { type: 'note', x: 60, y: 60, w: 260, text: 'under 10min - provide with great exampels and analogies from other videos', by: 'Dani' },
      { type: 'idea', x: 60, y: 230, w: 300 },
      { type: 'breakdown', x: 400, y: 60, w: 340, job: 'v-J5EbL1UaqG8-mvqz25nn' },
      { type: 'video', x: 780, y: 60, w: 260, videoId: 'bTqizdva04g' },
      { type: 'video', x: 1070, y: 60, w: 260, videoId: '3TwbE7gv6qo' },
      { type: 'video', x: 780, y: 380, w: 260, videoId: 'LqCPwQ1IcA4' },
      { type: 'video', x: 1070, y: 380, w: 260, videoId: 'CoFeT_SJXvg' },
      { type: 'questions', x: 400, y: 500, w: 340, job: 'v-J5EbL1UaqG8-mvqz25nn' },
      { type: 'image', x: 60, y: 560, w: 300, caption: 'Claude settings: features most people never open' },
      { type: 'link', x: 1370, y: 60, w: 240, url: 'https://docs.claude.com', label: 'Claude docs: check every feature here first' },
      { type: 'note', x: 1370, y: 200, w: 240, text: 'Opening idea: show one result first, then "Most people never touch this." Thumbnail must name one real feature.', by: 'Samin' },
      { type: 'signal', x: 780, y: 700, w: 300, signalId: 'x-2114441867521860066' },
      { type: 'signal', x: 1110, y: 700, w: 300, signalId: 'x-2114750294760587416' },
    ],
  };

  const CHAT = {
    'What do these have in common?': (b) => `<p>Three things repeat across the board:</p><ul><li><b>Show it, don't list it.</b> The Ben AI breakdown says each feature got "what it is, where to click, then a personal example" <span class="cite">Breakdown</span>. That's your Level 1 format.</li><li><b>Proof from your own account.</b> /doctor's 404 files and 312 problems landed because they were his real numbers <span class="cite">Breakdown</span>. Use your own before and after.</li><li><b>Beginners are the audience.</b> The top viewer question is "I'm on the Max plan and can't see these features yet" <span class="cite">Questions</span>. Say which plan each feature needs.</li></ul><p>Your note asks for analogies from other videos. The car dashboard and the "train an assistant once" lines already fit.</p>`,
    'Write three hooks from this board': (b) => `<p>Three openings, each proving the claim in the first seconds:</p><ul><li><b>Result first:</b> "This just did in one step what used to take me five. Most people never touch it."</li><li><b>Admission:</b> "I've used this tool every day for a year and I missed this until last week."</li><li><b>Number:</b> "Three features in your AI tool, one click, one workflow, one setup, and you'll use all three by the end of this video."</li></ul><p>The first matches your outline's recommended opening.</p>`,
    "What's missing before I plan?": (b) => `<ul><li><b>Which tool.</b> Claude is your default. Pick before recording so the proof doesn't split.</li><li><b>The Level 2 task.</b> Choose a safe sample with no private data.</li><li><b>The opening feature.</b> Test it once so it works on the first take.</li><li><b>Plan access.</b> Viewers asked which plan unlocks what. Check each feature's plan in the docs tile.</li></ul>`,
  };

  // First-launch: topic choices and voice questions for a brand-new creator.
  const WELCOME = {
    topics: ['Claude', 'AI agents', 'Vibe coding', 'AI for small business', 'Automation', 'ChatGPT', 'AI video', 'Making money with AI', 'Productivity'],
    audiences: ['Complete beginners', 'Small-business owners', 'Creators', 'Developers', 'Students'],
    voice: [
      { q: 'How would you explain what your channel is about to a friend?', ph: "I show people who aren't technical how to get real work done with AI…", why: 'This becomes the one line Claude uses to pick ideas for you.' },
      { q: 'How do you sound on camera?', options: ['Calm and clear, like a teacher', 'Upbeat and fast', 'Dry and honest, a bit funny', "I don't know yet"], why: 'Talking points get written the way you speak.' },
      { q: 'Which creators do you like watching, and why?', ph: 'e.g. Riley Brown, because he builds it live…', why: "Their channels are added to Working now so you see what's landing." },
    ],
  };

  window.CC_CONTENT = { PACK, DETAIL, TRANSCRIPT, BOARD, CHAT, WELCOME };
})();
