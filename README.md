# Logistic-track with AI

A logistics operations dashboard built with React, TypeScript and Vite, with an AI layer
powered by Claude. It presents a fleet management workspace ("haul.io") with a login screen,
a network overview and a shipments view, and adds an operations copilot that reasons over
the live network snapshot.

## AI features

All AI features are grounded in the same network snapshot the operator sees on screen
(shipments, metrics, fleet status and the activity feed), so answers quote real tracking IDs,
customers, routes and figures rather than inventing them.

- **Ops copilot** - a chat panel ("Ask copilot" in the top bar) that streams answers token by
  token. Ask things like "Which shipments are at risk of missing their ETA?" or "What should I
  deal with first this morning?"
- **AI daily briefing** - a card at the top of the overview that summarises the state of the
  network with a headline, highlights (positive / warning / critical) and suggested next steps.
  Regenerate it on demand.
- **Delay-risk scoring** - every shipment row gets a risk badge (Low risk / Watch / At risk)
  with a 0-100 score and a one-line reason, produced by Claude from progress, ETA, hub dwell
  time and the activity feed.
- **Natural-language shipment search** - on the Shipments page, type a query in plain English
  ("late deliveries heading to Germany") and the table filters to the matching shipments and
  status tab.

The dashboard keeps working when the AI service is offline or no API key is configured: the
briefing and search show a clear "not configured" message, risk badges simply do not render,
and everything else is unaffected.

## Dashboard features

- **Login screen** gating the dashboard
- **Network summary** metrics: active shipments, on-time rate, fleet utilization, items needing attention
- **Live route overview** with an illustrated map, route lines, hub nodes and vehicle markers
- **Active shipments** panel with status filters (All / In transit / At hub / Delivered) and sorting by ETA, progress or shipment ID
- **Shipment volume** chart with selectable periods (this week / last week / this month)
- **Activity feed** with pagination
- **Shipments page** with search, filters, CSV export and a create-shipment dialog

## Tech stack

React 19 - TypeScript - Vite - Tailwind CSS - lucide-react - Recharts - TanStack Query & Table -
React Hook Form + Zod - Express - Anthropic TypeScript SDK (`@anthropic-ai/sdk`)

## Getting started

```bash
npm install
cp .env.example .env      # then paste your Anthropic API key into .env
npm run dev
```

`npm run dev` starts two processes: the Vite dev server for the UI (default
http://localhost:5173) and the AI service on port 8787. Vite proxies every `/api` request to
the AI service, so the API key never reaches the browser.

Create an API key at https://console.anthropic.com/settings/keys. The `.env` file is
gitignored and is never committed.

## Production

```bash
npm run build
npm start
```

`npm start` runs the Express service, which serves the built dashboard from `dist/` and the
AI endpoints from the same port (8787 by default, configurable with `PORT`).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server and the AI service together |
| `npm run dev:web` | Start only the Vite dev server |
| `npm run dev:server` | Start only the AI service (with reload on change) |
| `npm run build` | Type-check with `tsc -b` and build to `dist/` |
| `npm start` | Serve the built dashboard plus the AI endpoints |
| `npm run lint` | Run ESLint over the project |
| `npm run check:server` | Type-check the AI service |
| `npm run check` | Lint, type-check the server and build |
| `npm run preview` | Serve the production build locally with Vite |

## How the AI layer works

```
Browser (React)                       AI service (Express, server/index.ts)
---------------                       --------------------------------------
CopilotPanel   -> POST /api/chat     -> Claude, streamed back as server-sent events
BriefingCard   -> POST /api/briefing -> Claude with a JSON schema (structured output)
RiskBadge      -> POST /api/risk     -> Claude with a JSON schema, one score per shipment
SmartSearch    -> POST /api/search   -> Claude with a JSON schema: status tab + matching IDs
               -> GET  /api/health   -> whether a key is configured and which model is used
```

- The model is `claude-opus-5` with adaptive thinking. The copilot and briefing run at medium
  effort; search runs at low effort because it only needs to map a phrase to a filter.
- The network snapshot is placed in the system prompt with a prompt-caching breakpoint so
  follow-up copilot questions reuse the cached context.
- Structured endpoints use `output_config.format` with a JSON schema, so the front end never
  has to parse free text.
- Stopping a copilot reply in the browser aborts the upstream request as well.

## Project structure

```
server/
  index.ts             Express AI service: chat, briefing, risk and search endpoints
src/
  App.tsx              dashboard, shipments view and login screen
  App.css / ai.css     application styles and AI surface styles
  components/
    CopilotPanel.tsx   streaming chat panel
    BriefingCard.tsx   AI daily briefing
    RiskBadge.tsx      delay-risk badge on shipment rows
    SmartSearch.tsx    natural-language shipment search
  data/network.ts      sample shipments, metrics, activity and the snapshot builder
  lib/ai.ts            typed client for the AI endpoints (fetch + SSE parsing)
  lib/useRiskAssessments.ts
public/                favicon and icon sprite
```

## Notes

The dashboard runs on in-file sample data: there is no database, and the login screen accepts
any submission. The AI endpoints reason over that sample snapshot, which is what makes the
demo self-contained.
