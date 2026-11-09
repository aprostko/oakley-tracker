# Oakley GI Diet Trial Tracker

Static, offline-first PWA (HTML/CSS/vanilla JS, no build step, no dependencies) for a 30-day canine diet trial.
Works on desktop, iPhone, Android. Optional shared sync through a Google Sheet.

## 1. Architecture recommendation

```
 Phone A (Andrew)          Phone B (Mary)
 ┌───────────────┐         ┌───────────────┐
 │ static app    │         │ static app    │   hosted anywhere static (GitHub Pages)
 │ localStorage  │         │ localStorage  │   ← every write lands locally first (works offline)
 └──────┬────────┘         └──────┬────────┘
        │ POST (text/plain JSON)  │
        └──────────┬──────────────┘
          Google Apps Script web app  (Code.gs, token-checked)
                   │
             Google Sheet "records"  (one row per record; you own the data)
```

### Why Google Sheets + Apps Script (and not the Microsoft stack or Firebase)
- **Microsoft (OneDrive/Excel/Lists)** was the preferred option, but a browser-only static page cannot call Graph without an Azure AD app registration, MSAL sign-in per device (popup/redirect flows are fragile in iOS home-screen apps), and, if either of you signs in with a work (GCC) account, tenant consent/Conditional Access can block it. It would also put pet data in a work tenant. Too much setup for a dog diary.
- **Google Sheets via Apps Script**: no OAuth in the client, no API keys in the repo, ~5 minutes to set up, works from iOS/Android/desktop, data is a sheet you can open and chart yourself. Shared secret = long token.
- **Firebase** is the better *real-time* engine but needs a project, rules, and config; unnecessary for two writers.
- Hosting note: **OneDrive and Google Drive do not serve HTML as a website.** Use GitHub Pages (or Netlify/Cloudflare Pages). The repo holds no data, so a public repo is fine; the sync URL/token live only in each device's localStorage (share via the "Copy setup link" button).

### Sync / merge design
- Everything is a **record** `{id,type,date,t,del,d,ft}` (`stool`, `vomit`, `weight`, `day`, `cfg`).
- Stools/vomiting/weights: last-write-wins per record; deletes are soft so they propagate.
- Daily log + settings: **field-level merge** (per-field timestamps), so Mary logging appetite while Andrew logs treats never clobbers either.
- Each sync = one POST: push unsynced records, receive everything, merge. Runs on open, after edits (1.5 s debounce), on focus, every 60 s, when back online.
- Verified by a two-device test (concurrent edits to different fields of one day, add on A / delete on B).

## 2. Folder structure
```
oakley-tracker/
├─ index.html              shell
├─ css/styles.css          mobile-first, dark mode, print styles
├─ js/
│  ├─ util.js              dates, formatting, DOM helpers (text-safe)
│  ├─ store.js             local-first records, merge logic, backup/restore
│  ├─ sync.js              Apps Script sync
│  ├─ stats.js             averages, streaks, Week-1-vs-latest outcome
│  ├─ charts.js            dependency-free SVG charts
│  ├─ export.js            CSV, Excel (SpreadsheetML), JSON
│  ├─ ui.js                all views (Log, Dashboard, Outcome, Timeline, More, Vet report)
│  └─ app.js               tabs, theme, setup link, service worker
├─ sw.js, manifest.webmanifest, icons/     installable + offline
└─ apps-script/Code.gs     paste into the Google Sheet's Apps Script
```

## 3. Deploy
**Local only (no sharing):** push to GitHub Pages → open on each phone → Share ▸ *Add to Home Screen*.

**GitHub Pages:** create repo, upload the folder contents, Settings ▸ Pages ▸ deploy from `main` / root.

**Shared data setup (5 min):**
1. New Google Sheet → Extensions ▸ Apps Script → paste `apps-script/Code.gs`; change `TOKEN` to a long random string; Save.
2. Deploy ▸ New deployment ▸ Web app ▸ Execute as **Me**, access **Anyone** → authorize → copy the `/exec` URL.
3. In the app: More ▸ Shared sync → paste URL + token → *Save & sync now* → *Copy setup link* → send to Mary and open it on her phone (pre-fills her settings).
4. Set trial start date (More ▸ Trial settings, or the banner on the Log tab); pick who's logging on each device.
After editing `Code.gs` later, use Deploy ▸ Manage deployments ▸ new version.

## 4. Implementation plan
**MVP (this build, complete):**
1. Local-first store + PWA shell. 2. Log tab: tap-to-log stool (score tap = saved with time, optional urgency/mucus/blood set beforehand; ≈2 taps), details editor, **"Was this a good day?" 👍/👎**, 1–5 ratings (appetite, energy, nausea, gas, discomfort), vomiting episodes, weights, diet/treats/non-approved/meds/notes. 3. Dashboard (7/14/30-day averages, streak, best/worst, vomiting, 4 charts). 4. Outcome tab (auto summary + Week 1 vs latest-7-days table, verdict). 5. Timeline with week filter. 6. Exports (stools CSV, daily CSV, Excel workbook with 4 sheets, JSON backup/restore) + printable vet summary. 7. Google Sheet sync. 8. Dark mode (auto/light/dark).

**Definitions used (state these to your vet):**
- Liquid stool = score ≤ 2. Normal/"formed" = 4–5.
- *Days without liquid stool*: consecutive days (back from today; today skipped if nothing logged yet) with ≥1 stool logged and none ≤ 2. A day with no stool logged ends the streak.
- *Best/worst stool*: closest to / furthest from the 4–5 band (so a 7 is not "best").
- *Improvement %*: reduction in mean distance from the 4–5 band, Week 1 (trial days 1–7) vs the latest 7 trial days. Unlocks on day 10 with ≥3 stools in each window. Verdict is a simple rule on that figure (≥10% better/worse) plus flags for worsening appetite, energy, nausea, gas, discomfort, vomiting, good days. It is a summary, not a diagnosis.
- Weight is converted to your chosen unit (lb/kg) if entries differ.

**Known limits:** concurrent edits to the *same field* are last-write-wins; the Apps Script URL+token is a shared secret (anyone with both can read/write the sheet) — don't post the setup link publicly; localStorage can be cleared by the browser if a phone is very low on storage (sync or JSON backup protects you); iOS may purge unused home-screen app data after long inactivity.

## 5. Roadmap
- **v1.1** Stool photos (downscale to ~600 px, IndexedDB locally; Drive upload via Apps Script for sharing), reminders (needs push: Web Push via a tiny service, or scheduled Apps Script email/Telegram), per-meal feeding log with quick "same as yesterday".
- **v1.2** Bristol-style visual picker with illustrations, calendar heat-map, configurable ideal range, symptom flags (straining, tenesmus, borborygmi), medication schedule with check-offs.
- **v1.3** Multi-trial support (e.g. 2nd food trial / reintroduction challenge phases), phase markers on charts, compare trials side by side.
- **v2** Real-time sync (Firebase) if more than two users; PDF generation without browser print; conflict UI; encrypted export.
