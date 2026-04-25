# CommunityPulse — AI Handoff Context File
# Last updated: mid-hackathon (accounts + leaderboard + profile complete)
# Purpose: Any AI continuing this build should read this file first.

---

## What We're Building
**CommunityPulse** — A One Health participatory health surveillance app for Arizona.
- Users self-report symptoms (or wellness) daily
- AI detects community outbreak clusters using self-reports + CDC FluView + weather + Epicore
- Tells users whether to notify contacts, shows forecast trend, reads recommendation aloud (ElevenLabs)
- Engages users with streaks, friends leaderboard, and profile stats

**Hackathon:** EpiHack Arizona (May 18–22, 2026) | **Track:** Track 2 — Participatory Surveillance Risk Challenge
**Team:** Jacob (backend), Kayvon (frontend), Joeli (data/forecast), Aurora (UI)

---

## Current Build Status
- [x] Flask backend (port 5001) — all endpoints working
- [x] React frontend (port 3000) — full flow working
- [x] CDC FluView live (HHS Region 9 ILI rate)
- [x] OpenWeatherMap live (weather by zip)
- [x] OpenAI GPT-4o live (risk analysis)
- [x] ElevenLabs live (voice TTS)
- [x] SQLite DB — empty (no synthetic data)
- [x] Demo mode — seed/clear 371 realistic reports via UI button
- [x] User accounts (register/login/JWT auth)
- [x] Friends list (add/remove by username)
- [x] Streak leaderboard (friends ranked by streak)
- [x] Profile page (stats: streak, best streak, check-ins, healthy %, county, rank)
- [x] Server-side streak tracking (linked to user_id on reports)
- [x] CORS fixed via React proxy (package.json → `"proxy": "http://localhost:5001"`)
- [ ] Epicore API base URL (pending — goes live at event May 18)
- [ ] BEACON API (pending — DNS not resolving yet)
- [ ] Deploy (Vercel + Railway)
- [ ] GitHub README
- [ ] Devpost submission

---

## CRITICAL: No Synthetic Data Policy
The database (reports.db) is EMPTY by design. Do NOT seed it with fake data permanently.
The "🎭 Load Demo Data" button in the UI adds 371 demo rows (tagged `is_demo=1`) temporarily.
"🗑 Clear Demo Data" removes them. Real user check-ins are never affected.

---

## Epicore + BEACON — Pending Until Event
Both APIs gracefully fall back to "data unavailable" strings in GPT-4o prompt.
- Epicore: set `EPICORE_API_URL=https://[domain]/api/events/closed` in `.env` when organizers share it
- BEACON: `beacon.phiresearchlab.org` — DNS not resolving yet, same graceful fallback
- No code changes needed — both functions already read from env vars and handle failures

---

## API Keys (.env)
```
OPENAI_API_KEY=sk-proj-...          ← ACTIVE
OPENWEATHERMAP_API_KEY=eab75a27...  ← ACTIVE
ELEVENLABS_API_KEY=sk_5a116...      ← ACTIVE
EPICORE_API_URL=                    ← EMPTY — add when organizers provide domain
JWT_SECRET=                         ← Optional — defaults to dev secret, set in prod
```

---

## How to Run
```bash
# Backend (from hackathon-az/hackathon-az/)
source venv/bin/activate
python3 app.py
# → Flask on http://localhost:5001

# Frontend (separate terminal)
cd frontend
npm start
# → React on http://localhost:3000
# Proxy routes all /api/* calls to :5001
```

---

## Architecture
```
React (port 3000)
  → proxy → Flask (port 5001)
              → OpenAI GPT-4o        — risk analysis + JSON response
              → CDC FluView API      — HHS Region 9 ILI rate (LIVE)
              → Epicore API          — verified outbreak events (PENDING)
              → BEACON API           — biosurveillance signals (PENDING)
              → OpenWeatherMap API   — weather by zip (LIVE)
              → ElevenLabs API       — voice TTS (LIVE)
              → SQLite (reports.db)  — symptom reports + user accounts
```

---

## Database Schema

### reports
```sql
id, timestamp, zip_code, county, feeling, symptoms (JSON array),
age_group, household_members, sick_household_members,
first_time_reporting, recent_travel, event_attendance,
animal_contact, sick_animals, water_concerns, reporting_to_authority,
is_demo (0/1), user_id (FK → users.id, nullable for guests)
```

### users
```sql
id, username (unique), email (unique), password_hash,
streak, best_streak, last_checkin, created_at
```

### friendships
```sql
id, user_id, friend_id, created_at
-- Bidirectional: both (A→B) and (B→A) rows inserted on add
```

---

## Backend Endpoints

### Public
| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/checkin` | Submit check-in (auth optional — attaches user_id if logged in) |
| GET | `/api/community-risk` | County risk map for AZMap |

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account → returns JWT |
| POST | `/api/auth/login` | Login → returns JWT |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/profile` | Full profile stats (streak, best streak, check-in counts, county, rank) |

### Friends & Leaderboard
| Method | Path | Description |
|---|---|---|
| GET | `/api/friends` | List friends |
| POST | `/api/friends/add` | Add friend by username |
| POST | `/api/friends/remove` | Remove friend |
| GET | `/api/leaderboard` | Friends + self ranked by streak |

### Demo
| Method | Path | Description |
|---|---|---|
| POST | `/api/demo/seed` | Insert 371 demo reports |
| POST | `/api/demo/clear` | Remove all is_demo=1 rows |
| GET | `/api/demo/status` | Returns {demo_active, demo_rows} |

---

## Frontend Components
```
App.js                  — routing, auth state, header (username → profile, 🏆 → leaderboard)
api.js                  — all axios calls, auth token injected via authHeader()
components/
  CheckIn.js            — home screen, demo toggle, leaderboard card if logged in
  SymptomForm.js        — full One Health intake form
  ResultsDashboard.js   — risk banner, forecast chart, recommendation, audio
  ForecastChart.js      — Recharts 7-day trend (hidden if all-zero)
  WellnessMode.js       — healthy check-in: streak, tip, campaign message
  NotifyButton.js       — pre-written contact alert (shown only if report_count >= 2)
  AIExplainer.js        — accordion: data sources, model, caveats
  AZMap.js              — SVG county map colored by risk level
  AuthScreen.js         — register/login tabs
  ProfileScreen.js      — user stats: streak, best streak, check-ins, county, rank
  LeaderboardScreen.js  — friends leaderboard + add/remove friends
```

---

## Auth Flow
- JWT stored in `localStorage` as `cp_token`
- User object stored in `localStorage` as `cp_user`
- All protected API calls send `Authorization: Bearer <token>` header
- Clicking username in header → ProfileScreen
- ProfileScreen has Sign Out button
- "Continue without an account" skips auth — app fully works for guests

---

## Streak Logic
- **Guest:** tracked in `localStorage` only (cp_streak, cp_last_checkin)
- **Logged in:** tracked server-side in `users.streak` + `users.best_streak`
  - Updated on every `/api/checkin` call
  - `server_streak` returned in checkin response, synced to localStorage
- **Best streak:** updated whenever current streak exceeds previous best

---

## Demo Mode
- Button at bottom of CheckIn screen: "🎭 Load Demo Data" / "🗑 Clear Demo Data"
- Seeds 371 rows across 7 counties: Pima has growing cluster (8→52/day), Maricopa stable, others low
- All demo rows have `is_demo=1` — cleared without touching real data

---

## Deployment (TODO)
- Frontend: `cd frontend && npm run build` → Vercel
- Backend: Railway (set all .env vars, `python3 app.py` start command)
- Update CORS if needed (currently allows all origins)
- Set `JWT_SECRET` to a strong random string in production

---

## Progress Log
### Hour 0 — Claude — Full codebase generated
All backend and frontend files written and integrated.

### Mid-hackathon pass 1 — Claude — Synthetic data removal + real APIs
- Cleared reports.db, replaced az_health_baseline.json with factual-only content
- Confirmed CDC FluView, OpenWeatherMap, ElevenLabs all live
- Fixed CORS via React proxy (port 5001)
- Added demo mode (seed/clear via UI)

### Mid-hackathon pass 2 — Claude — Account system
- Added users + friendships tables to SQLite
- JWT auth (register, login, /me, /profile)
- Friends: add/remove by username, bidirectional rows
- Streak leaderboard: friends + self ranked by streak
- Profile page: all-time stats, best streak, check-in breakdown, county, rank
- user_id attached to reports when logged in
- Sign out moved to profile page; username in header is now a button → profile

**NEXT STEPS:**
1. Get Epicore API base URL from organizers/Discord → add to .env
2. Deploy: `cd frontend && npm run build` → Vercel; backend → Railway
3. Set JWT_SECRET to a real secret in prod .env
4. Create GitHub README
5. Submit on Devpost 15 min before deadline
