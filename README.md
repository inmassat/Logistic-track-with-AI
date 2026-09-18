# Logistic-track with AI

A logistics operations dashboard built with React, TypeScript and Vite, with a built-in demo
AI assistant and a SQLite database. It presents a fleet management workspace ("haul.io") with
a login screen and pages for the network overview, shipments, fleet, drivers, analytics, routes,
the AI assistant, settings and a help center.

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
with the two demo users, 5 drivers, 12 sample shipments and 9 activity entries. Delete the file
to reset the demo.

Tables:

| Table | Purpose |
| --- | --- |
| `users` | Demo accounts with scrypt password hashes |
| `sessions` | Login sessions (token, user, expiry) behind the HttpOnly cookie |
| `user_settings` | Each user's workspace name and notification preferences |
| `support_requests` | Help-center requests (subject, message, status), linked to the user who sent them |
| `reports` | Saved CSV exports (kind, filename, row count and the CSV itself), linked to the user who exported them |
| `shipments` | Tracking ID, route, customer, ETA, progress, status, service level |
| `activity` | The activity feed (deliveries, delays, bookings, reviews, dispatches), linked to shipments |
| `drivers` | The driver roster: name, phone, license class, home hub and status |
| `dispatches` | Vehicles dispatched from a hub with a shipment, and who dispatched them |
| `conversations` | Each user's saved assistant conversations |
| `copilot_messages` | The messages inside each conversation |

Creating a shipment in the UI inserts a row and logs a "Shipment booked" activity entry.
"Mark for review" on a row logs a review entry. "Dispatch vehicle" on the Fleet page inserts a
dispatch row and logs a "Vehicle dispatched" entry. "Add driver" on the Drivers page inserts a
roster row and logs a "Driver added" entry. All of them appear in the overview immediately.

## Pages

Every entry in the left sidebar opens a page. The operational pages all read from the same
network snapshot (shipments, metrics, fleet status, drivers, dispatches and activity), the
Settings and Help center pages load the signed-in user's own rows, and long lists are
paginated five rows at a time.

- **Overview** - the landing page after login. Network summary metrics computed from the
  database (active shipments, on-time rate, fleet utilization, items needing attention), the AI
  daily briefing, a live route overview with an illustrated map, route lines, hub nodes and
  vehicle markers, the active shipments panel with status filters (All / In transit / At hub /
  Delivered) and sorting by ETA, progress or shipment ID, a shipment volume chart with
  selectable periods (this week / last week / this month) and the paginated activity feed.
  Shipment rows have a menu to copy the tracking ID, and clicking a row's risk badge shows
  the one-line reason behind the score.
- **Shipments** - the full shipment table with natural-language search, status filters, CSV
  export and a create-shipment dialog that writes to SQLite. Each row has an action menu to
  copy the tracking ID or mark the shipment for review.
- **Fleet** - fleet control. Metrics for vehicles connected, vehicles in motion, hub coverage
  and utilization, a paginated "Vehicles in motion" list of undelivered shipments with their
  risk badges (click one for the reason), a paginated hub list, a "Recent dispatches" log and a
  "Dispatch vehicle" dialog that picks a hub, an active shipment and an optional vehicle ID.
  Dispatching writes a row to SQLite, moves a shipment that was "At hub" to "In transit" and
  logs a "Vehicle dispatched" activity entry.
- **Drivers** - driver operations. Metrics for active drivers (from the roster in SQLite),
  fleet connected, check-ins today and items needing attention, a paginated "Latest check-ins"
  list built from driver and check-in activity, the paginated driver roster (name, hub, license,
  phone, status) and an "Add driver" dialog (name, phone, license, hub). Adding a driver inserts
  a roster row and logs a "Driver added" activity entry.
- **Analytics** - network analytics. Total shipments, average progress, on-time rate and fleet
  utilization, a current-status breakdown (in transit / at hub / delivered) as bars, network
  signals, the paginated activity pulse and an "Export report" button. The export is generated
  on the server from a fresh database read, saved to the `reports` table under the signed-in
  user and downloaded as CSV. A paginated "Saved reports" panel lists every export with its
  row count and a link to download it again.
- **Routes** - one row per origin-destination corridor, deduplicated from the shipments, with
  customer, progress, ETA and status. Metrics for active routes and average progress, and an
  export to CSV.
- **AI Assistant** - the full-page chat described under "Where the AI is".
- **Settings** - profile name and workspace plus notification toggles for risk alerts, driver
  updates and the daily briefing. Saved per user in SQLite: the name updates the account row
  (so the header greeting and dispatch attribution change too) and the preferences live in the
  `user_settings` table, so they follow the user to any browser.
- **Help center** - searchable help topics (getting started, shipments, fleet and drivers, the
  AI assistant, settings, exports), a "Contact support" form that saves the request to SQLite
  under the signed-in user, and a paginated "Support requests" list showing each request's
  ticket number, status and when it was sent. Users only ever see their own requests.

Creating a shipment, marking one for review, dispatching a vehicle, adding a driver, saving
settings, contacting support and exporting an analytics report all write to SQLite and show
up across the dashboard on the next refresh.

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
GET    /api/settings                      the user's preferences (defaults until first saved)
PUT    /api/settings                      save {name, workspace, riskAlerts, driverUpdates, dailyBriefing} -> user, settings
GET    /api/support                       the user's support requests, newest first
POST   /api/support                       send a support request {subject, message}
GET    /api/reports                       the user's saved exports, newest first
POST   /api/reports                       generate and save a report {kind: "analytics"} -> report, csv
GET    /api/reports/:id/download          the saved CSV as an attachment
GET    /api/health                        engine name and database path
GET    /api/snapshot                      shipments, metrics, fleet, drivers, dispatches and activity in one payload
GET    /api/shipments                     all shipments
POST   /api/shipments                     create a shipment {customer, origin, destination, eta, reference?, service?}
POST   /api/shipments/:id/review          log a "marked for review" activity entry
GET    /api/activity                      the activity feed
GET    /api/drivers                       the driver roster
POST   /api/drivers                       add a driver {name, phone, hub, license?}
GET    /api/dispatches                    vehicles dispatched, newest first
POST   /api/dispatches                    dispatch a vehicle {shipmentId, hub, vehicle?}
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
  index.ts             Express API: auth, shipments, drivers, dispatches, settings, support,
                       reports, assistant, briefing, risk and search endpoints
  auth.ts              scrypt password hashing, session tokens and cookie helpers
  db.ts                SQLite schema, migration, seeding, queries and the snapshot builder
  demoAi.ts            rule-based demo AI engine
  reports.ts           builds the CSV exports from a network snapshot
  seed.ts              demo users, drivers, sample shipments, activity and fleet figures
  data/                haulio.db (created on first run, gitignored)
src/
  App.tsx              login screen, sidebar shell and the Overview, Shipments, Fleet, Drivers,
                       Analytics, Routes, Settings and Help center pages
  App.css / ai.css     application styles and AI surface styles
  components/
    AssistantPage.tsx  full-page chat with saved conversations
    BriefingCard.tsx   AI daily briefing
    RiskBadge.tsx      delay-risk badge on shipment rows
    SmartSearch.tsx    natural-language shipment search
  data/network.ts      shared types for shipments, drivers, dispatches, activity, settings,
                       support requests, reports, the snapshot and AI results
  lib/ai.ts            typed API client (fetch + SSE parsing)
  lib/useNetwork.ts    TanStack Query hooks for the snapshot, settings, support requests,
                       reports, conversations and every mutation
  lib/useRiskAssessments.ts  delay-risk scores for the shipments on screen
  lib/format.ts        date and relative-time helpers
public/                favicon and icon sprite
```

## Notes

The shipment volume chart and the fleet-level figures (on-time rate, utilization, vehicle
counts, hub list) are illustrative constants in `server/seed.ts`. Shipments, activity, drivers,
dispatches, user settings, support requests, saved reports and assistant conversations are all
real data from SQLite.
