# Logistic-track with AI

A logistics operations dashboard built with React, TypeScript and Vite, with a built-in demo
AI assistant and a SQLite database. It presents a fleet management workspace ("haul.io") with
a login screen, a network overview and a shipments view.

Everything runs locally. There is no external AI provider, no API key and nothing to sign up
for: the AI features are a self-contained rules engine that reasons over the data in SQLite.

## AI features (demo engine)

All AI features are grounded in the same network snapshot the operator sees on screen
(shipments, metrics, fleet status and the activity feed), read fresh from SQLite on every
request, so answers cite real tracking IDs, customers, routes and figures.

- **Ops copilot** - a chat panel ("Ask copilot" in the top bar) that streams answers word by
  word. It understands questions about risk ("which shipments are at risk?"), recent activity
  ("what happened in the last two hours?"), priorities ("what should I deal with first?"),
  corridors and cities ("how is Rotterdam doing?"), customers ("show me Kovak") and single
  shipments ("what is happening with TRK-8479?"). Conversations are saved in SQLite and
  restored when the panel reopens; a trash button clears them.
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
with 12 sample shipments and 9 activity entries. Delete the file to reset the demo.

Tables:

| Table | Purpose |
| --- | --- |
| `shipments` | Tracking ID, route, customer, ETA, progress, status, service level |
| `activity` | The activity feed (deliveries, delays, bookings, reviews), linked to shipments |
| `copilot_messages` | Saved copilot conversation |

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
and the API on port 8787. Vite proxies every `/api` request to the API. Sign in with any email
and password.

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

```
GET    /api/health                  engine name and database path
GET    /api/snapshot                shipments, metrics, fleet and activity in one payload
GET    /api/shipments               all shipments
POST   /api/shipments               create a shipment {customer, origin, destination, eta, reference?, service?}
POST   /api/shipments/:id/review    log a "marked for review" activity entry
GET    /api/activity                the activity feed
POST   /api/chat                    copilot reply as server-sent events {messages: [{role, content}]}
GET    /api/chat/history            saved copilot conversation
DELETE /api/chat/history            clear it
POST   /api/briefing                daily briefing
POST   /api/risk                    delay-risk assessment per shipment
POST   /api/search                  natural-language search {query}
```

## Project structure

```
server/
  index.ts             Express API: data, copilot, briefing, risk and search endpoints
  db.ts                SQLite schema, seeding, queries and the snapshot builder
  demoAi.ts            rule-based demo AI engine
  seed.ts              sample shipments, activity and fleet figures
  data/                haulio.db (created on first run, gitignored)
src/
  App.tsx              dashboard, shipments view and login screen
  App.css / ai.css     application styles and AI surface styles
  components/
    CopilotPanel.tsx   streaming chat panel with saved history
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

The login screen accepts any submission. The shipment volume chart and the fleet-level figures
(on-time rate, utilization, vehicle counts) are illustrative constants in `server/seed.ts`;
everything about shipments and activity is real data from SQLite.
