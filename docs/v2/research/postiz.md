# Postiz for CreatorClub Publish (research agent, 2026-10-29)

- AGPL-3.0, 40k stars, release v2.25.3 on 2026-10-24, actively maintained. Talking to it over HTTP is fine. Bundling or modifying it triggers AGPL duties.
- Open YouTube bugs: #2233 (reconnect drops refresh credentials), #1595 (token refresh), #2011 (scheduled uploads fail on Cloud), #2168 (extra scope blocks Google verification).
- Public API: base `https://api.postiz.com/public/v1` (Cloud) or `https://{host}/api/public/v1`. The auth header is the raw API key, no "Bearer".
  - `GET /integrations`: connected channels.
  - `POST /upload` (multipart): returns `{id,path}`. `POST /upload-from-url` needs a public HTTPS URL.
  - `POST /posts`: type now|schedule|draft. YouTube settings: title, type (public|unlisted|private), selfDeclaredMadeForKids, thumbnail, tags. No category and no YouTube-side publishAt.
  - Postiz uploads to YouTube at the scheduled time; the laptop need not be on for Cloud.
  - Limits: 90 create-post requests per hour, 1 GB per video, the video is uploaded twice (to Postiz, then to YouTube).
- Hosting: Cloud from $29/month (API on all plans, no free plan). Self-hosted needs Docker, Postgres, Redis, Temporal and the creator's own Google Cloud project. Too technical for the target user.
- Alternatives: the direct YouTube Data API (OAuth in the desktop app, free; category and publishAt are native; needs a CreatorClub OAuth client, verification, 100 uploads per day per project). Mixpost has no confirmed YouTube support. Buffer is unconfirmed.
- The agent's recommendation: a `Publisher` interface with two backends. First a Postiz Cloud adapter with the user's own API key (1–2 days), then a direct YouTube adapter. Biggest risks: Google verification and quota, Postiz's YouTube bugs, AGPL if bundled, thumbnails need a phone-verified channel.
- Publish screen: Connect → Review → Settings (visibility, made for kids, category, now or date) → Publish with progress → Result link.
