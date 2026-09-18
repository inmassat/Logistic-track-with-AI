# Logistic-track with AI

A logistics operations dashboard built with React, TypeScript and Vite, with a built-in demo
AI assistant and a SQLite database. It presents a fleet management workspace ("haul.io") with
a login screen, a network overview and a shipments view.

Everything runs locally. There is no external AI provider, no API key and nothing to sign up
for: the AI features are a self-contained rules engine that reasons over the data in SQLite.

## Demo login

Sign in on the login screen with one of the demo accounts stored in SQLite. There is also a
"Use demo account" button on the login form that fills these in for you.

| Email | Password | Name | Role |
| --- | --- | --- | --- |
| `demo@haul.io` | `demo1234` | Jamie Morgan | Fleet manager |
| `dispatch@haul.io` | `dispatch1234` | Elena Rossi | Dispatcher |

Passwords are hashed with scrypt before they are stored. Signing in creates a session row and
sets an HttpOnly cookie; "Remember me" keeps the session for 30 days instead of 12 hours. Every
API route except login and health requires a valid session, and each user only sees their own
assistant conversations.

## Where the AI is

Open the **AI Assistant** entry in the left sidebar (or the "Ask the AI assistant" button in the
top bar). It is a full-page chat, in the style of ChatGPT: saved conversations on the left, the
thread in the middle, a composer at the bottom, and suggested questions to start from.

## AI features (demo engine)

All AI features are grounded in the same network snapshot the operator sees on screen
(shipments, metrics, fleet status and the activity feed), read fresh from SQLite on every
request, so answers cite real tracking IDs, customers, routes and figures.

- **AI Assistant** - a full-page chat that streams answers word by word. It understands
  questions about risk ("which shipments are at risk?"), recent activity ("what happened in the
  last two hours?"), priorities ("what should I deal with first?"), corridors and cities ("how is
  Rotterdam doing?"), customers ("show me Kovak") and single shipments ("what is happening with
  TRK-8479?"). Conversations are saved per user in SQLite, listed in the sidebar, and can be
  reopened or deleted.
- **AI daily briefing** - a card at the top of the overview with a headline, a short summary,
  highlights (critical / warning / positive / neutral) and suggested next steps that name
  specific shipments. Regenerate it on demand.
- **Delay-risk scoring** - every shipment row gets a badge (Low risk / Watch / At risk) with a
  0-100 score and a one-line reason derived from status, progress, ETA and reported hub delays.
- **Natural-language shipment search** - on the Shipments page, type a query in plain English
  ("late deliveries heading to Germany", "shipments still sitting at a hub", "Kovak") and the
  table filters to the matching shipments and status tab, with a sentence explaining how the
  query was read.

The engine lives in `server/demoAi.ts`. Its four exported functions return exactly the shapes
the front end consumes, so it can be swapped for a real model later without touching the UI.

## SQLite

The service uses Node's built-in `node:sqlite` module (Node 22.13+ / 24), so there is nothing
native to compile. The database is created at `server/data/haulio.db` on first start and seeded
with the two demo users, 12 sample shipments and 9 activity entries. Delete the file to reset
the demo.

Tables:

| Table | Purpose |
| --- | --- |
| `users` | Demo accounts with scrypt password hashes |
| `sessions` | Login sessions (token, user, expiry) behind the HttpOnly cookie |
| `shipments` | Tracking ID, route, customer, ETA, progress, status, service level |
| `activity` | The activity feed (deliveries, delays, bookings, reviews), linked to shipments |
| `conversations` | Each user's saved assistant conversations |
| `copilot_messages` | The messages inside each conversation |

Creating a shipment in the UI inserts a row and logs a "Shipment booked" activity entry.
"Mark for review" on a row logs a review entry. Both appear in the overview immediately.

## Dashboard features

- **Login screen** gating the dashboard
- **Network summary** metrics computed from the database: active shipments, on-time rate, fleet utilization, items needing attention
- **Live route overview** with an illustrated map, route lines, hub nodes and vehicle markers
- **Active shipments** panel with status filters (All / In transit / At hub / Delivered) and sorting by ETA, progress or shipment ID
- **Shipment volume** chart with selectable periods (this week / last week / this month)
- **Activity feed** with pagination, fed from SQLite
- **Shipments page** with search, filters, CSV export and a create-shipment dialog that writes to SQLite

## Tech stack

React 19 - TypeScript - Vite - Tailwind CSS - lucide-react - Recharts - TanStack Query -
date-fns - Express 5 - SQLite via `node:sqlite`

## Getting started

Requires Node 22.13 or newer (Node 24 recommended).

```bash
npm install
npm run dev
```

`npm run dev` starts two processes: the Vite dev server for the UI at http://localhost:5173
and the API on port 8787. Vite proxies every `/api` request to the API. Sign in with
`demo@haul.io` / `demo1234` (see Demo login above).

## Production

```bash
npm run build
npm start
```

`npm start` runs the Express service, which serves the built dashboard from `dist/` and the
API from the same port (8787 by default). Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | Port the API (and, after a build, the UI) listens on |
| `DATABASE_PATH` | `server/data/haulio.db` | Where the SQLite file lives |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server and the API together |
| `npm run dev:web` | Start only the Vite dev server |
| `npm run dev:server` | Start only the API (with reload on change) |
| `npm run build` | Type-check with `tsc -b` and build to `dist/` |
| `npm start` | Serve the built dashboard plus the API |
| `npm run lint` | Run ESLint over the project |
| `npm run check:server` | Type-check the API |
| `npm run check` | Lint, type-check the server and build |
| `npm run preview` | Serve the production build locally with Vite |

## API

All routes except `/api/health` and `/api/auth/login` require the session cookie.

```
POST   /api/auth/login                    {email, password, remember?} -> user, sets cookie
POST   /api/auth/logout                   ends the session
GET    /api/auth/me                       the signed-in user
GET    /api/health                        engine name and database path
GET    /api/snapshot                      shipments, metrics, fleet and activity in one payload
GET    /api/shipments                     all shipments
POST   /api/shipments                     create a shipment {customer, origin, destination, eta, reference?, service?}
POST   /api/shipments/:id/review          log a "marked for review" activity entry
GET    /api/activity                      the activity feed
GET    /api/conversations                 the user's saved conversations
GET    /api/conversations/:id/messages    one conversation with its messages
DELETE /api/conversations/:id             delete a conversation
POST   /api/chat                          {conversationId | null, message} -> server-sent events
                                          (meta with the conversation id, then delta frames, then done)
POST   /api/briefing                      daily briefing
POST   /api/risk                          delay-risk assessment per shipment
POST   /api/search                        natural-language search {query}
```

## Project structure

```
server/
  index.ts             Express API: auth, data, assistant, briefing, risk and search endpoints
  auth.ts              scrypt password hashing, session tokens and cookie helpers
  db.ts                SQLite schema, migration, seeding, queries and the snapshot builder
  demoAi.ts            rule-based demo AI engine
  seed.ts              demo users, sample shipments, activity and fleet figures
  data/                haulio.db (created on first run, gitignored)
src/
  App.tsx              dashboard, shipments view and login screen
  App.css / ai.css     application styles and AI surface styles
  components/
    AssistantPage.tsx  full-page chat with saved conversations
    BriefingCard.tsx   AI daily briefing
    RiskBadge.tsx      delay-risk badge on shipment rows
    SmartSearch.tsx    natural-language shipment search
  data/network.ts      shared types for shipments, activity, the snapshot and AI results
  lib/ai.ts            typed API client (fetch + SSE parsing)
  lib/useNetwork.ts    TanStack Query hooks for the snapshot and mutations
  lib/format.ts        date and relative-time helpers
public/                favicon and icon sprite
```

## Notes

The shipment volume chart and the fleet-level figures
(on-time rate, utilization, vehicle counts) are illustrative constants in `server/seed.ts`;
everything about shipments and activity is real data from SQLite.
