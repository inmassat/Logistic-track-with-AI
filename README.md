# Logistics track

A logistics operations dashboard built with React, TypeScript and Vite. It presents a fleet
management workspace ("haul.io") with a login screen, a network overview and a shipments view.

## Features

- **Login screen** gating the dashboard
- **Network summary** metrics: active shipments, on-time rate, fleet utilization, items needing attention
- **Live route overview** with an illustrated map, route lines, hub nodes and vehicle markers
- **Active shipments** panel with status filters (All / In transit / At hub / Delivered) and sorting by ETA, progress or shipment ID
- **Shipment volume** chart with selectable periods (this week / last week / this month)
- **Activity feed** with pagination
- **Shipments page** as a separate view from the overview

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS · lucide-react · Recharts · TanStack Query & Table · React Hook Form + Zod

## Getting started

```bash
npm install
npm run dev
```

The dev server prints a local URL (Vite's default is http://localhost:5173).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check with `tsc -b` and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint over the project |

## Project structure

```
src/
  App.tsx      dashboard, shipments view and login screen
  App.css      application styles
  index.css    global styles
  assets/      images and icons
public/        favicon and icon sprite
```

## Notes

The dashboard runs on in-file sample data — there is no backend or API integration, so the
login screen accepts any submission and the shipments, metrics and activity feed are static.
