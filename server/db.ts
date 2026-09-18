import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ActivityEntry, ActivityKind, NetworkContext, NetworkMetrics, NewShipment, Shipment, ShipmentStatus } from '../src/data/network'
import { FLEET, SEED_ACTIVITY, SEED_SHIPMENTS } from './seed'

/**
 * SQLite persistence using Node's built-in `node:sqlite` module, so there is
 * nothing native to compile. The database lives in server/data/ (gitignored)
 * and is seeded with sample shipments the first time it is created.
 */

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data')
mkdirSync(dataDir, { recursive: true })

export const DB_PATH = process.env.DATABASE_PATH ?? path.join(dataDir, 'haulio.db')

const db = new DatabaseSync(DB_PATH)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS shipments (
    id          TEXT PRIMARY KEY,
    origin      TEXT NOT NULL,
    destination TEXT NOT NULL,
    customer    TEXT NOT NULL,
    eta         TEXT NOT NULL,
    progress    INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL CHECK (status IN ('In transit', 'At hub', 'Delivered')),
    color       TEXT NOT NULL,
    reference   TEXT,
    service     TEXT NOT NULL DEFAULT 'Standard road freight',
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
    occurred_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS copilot_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS activity_occurred_at ON activity(occurred_at DESC);
`)

/* ------------------------------------------------------------------ seeding */

function seedIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS count FROM shipments').get() as { count: number }
  if (row.count > 0) return

  const now = Date.now()
  const insertShipment = db.prepare(`
    INSERT INTO shipments (id, origin, destination, customer, eta, progress, status, color, reference, service, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `)
  const insertActivity = db.prepare(`
    INSERT INTO activity (kind, title, body, shipment_id, occurred_at) VALUES (?, ?, ?, ?, ?)
  `)

  db.exec('BEGIN')
  try {
    // Stagger created_at so the seed order is preserved when sorting newest first.
    SEED_SHIPMENTS.forEach((shipment, index) => {
      const createdAt = new Date(now - (index + 4) * 60 * 60 * 1000).toISOString()
      insertShipment.run(shipment.id, shipment.origin, shipment.destination, shipment.customer, shipment.eta, shipment.progress, shipment.status, shipment.color, shipment.service, createdAt)
    })
    for (const entry of SEED_ACTIVITY) {
      const occurredAt = new Date(now - entry.minutesAgo * 60 * 1000).toISOString()
      insertActivity.run(entry.kind, entry.title, entry.body, entry.shipmentId, occurredAt)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  console.log(`[haul.io] Seeded ${SEED_SHIPMENTS.length} shipments and ${SEED_ACTIVITY.length} activity entries into ${DB_PATH}`)
}

seedIfEmpty()

/* ---------------------------------------------------------------- shipments */

type ShipmentRow = {
  id: string
  origin: string
  destination: string
  customer: string
  eta: string
  progress: number
  status: ShipmentStatus
  color: string
  reference: string | null
  service: string
  created_at: string
}

function toShipment(row: ShipmentRow): Shipment {
  return {
    id: row.id,
    origin: row.origin,
    destination: row.destination,
    customer: row.customer,
    eta: row.eta,
    progress: row.progress,
    status: row.status,
    color: row.color,
    reference: row.reference,
    service: row.service,
    createdAt: row.created_at,
  }
}

export function listShipments(): Shipment[] {
  const rows = db.prepare('SELECT * FROM shipments ORDER BY created_at DESC, id DESC').all() as unknown as ShipmentRow[]
  return rows.map(toShipment)
}

export function getShipment(id: string): Shipment | null {
  const row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id) as unknown as ShipmentRow | undefined
  return row ? toShipment(row) : null
}

/** Allocates the next TRK number after the highest one in the table. */
function nextShipmentId(): string {
  const row = db.prepare(`SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) AS max FROM shipments WHERE id LIKE 'TRK-%'`).get() as { max: number | null }
  return `TRK-${(row.max ?? 8500) + 1}`
}

const SERVICE_COLORS: Record<string, string> = {
  'Express delivery': '#f29b38',
  'Temperature controlled': '#7c6bd9',
}

export function createShipment(input: NewShipment): Shipment {
  const id = nextShipmentId()
  const service = input.service?.trim() || 'Standard road freight'
  const createdAt = new Date().toISOString()

  db.exec('BEGIN')
  try {
    db.prepare(`
      INSERT INTO shipments (id, origin, destination, customer, eta, progress, status, color, reference, service, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 'In transit', ?, ?, ?, ?)
    `).run(id, input.origin.trim(), input.destination.trim(), input.customer.trim(), input.eta.trim(), SERVICE_COLORS[service] ?? '#1d9a8a', input.reference?.trim() || null, service, createdAt)
    insertActivity('booked', 'Shipment booked', `${id} · ${input.customer.trim()}`, id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return getShipment(id)!
}

export function markShipmentForReview(id: string): ActivityEntry | null {
  const shipment = getShipment(id)
  if (!shipment) return null
  return insertActivity('review', 'Marked for review', `${id} · ${shipment.customer}`, id)
}

/* ----------------------------------------------------------------- activity */

type ActivityRow = { id: number; kind: ActivityKind; title: string; body: string; shipment_id: string | null; occurred_at: string }

function toActivity(row: ActivityRow): ActivityEntry {
  return { id: row.id, kind: row.kind, title: row.title, body: row.body, shipmentId: row.shipment_id, occurredAt: row.occurred_at }
}

export function listActivity(limit = 50): ActivityEntry[] {
  const rows = db.prepare('SELECT * FROM activity ORDER BY occurred_at DESC, id DESC LIMIT ?').all(limit) as unknown as ActivityRow[]
  return rows.map(toActivity)
}

function insertActivity(kind: ActivityKind, title: string, body: string, shipmentId: string | null): ActivityEntry {
  const occurredAt = new Date().toISOString()
  const result = db.prepare('INSERT INTO activity (kind, title, body, shipment_id, occurred_at) VALUES (?, ?, ?, ?, ?)').run(kind, title, body, shipmentId, occurredAt)
  return { id: Number(result.lastInsertRowid), kind, title, body, shipmentId, occurredAt }
}

/* --------------------------------------------------------- copilot history */

export type StoredMessage = { id: number; role: 'user' | 'assistant'; content: string; createdAt: string }

export function listChatMessages(): StoredMessage[] {
  const rows = db.prepare('SELECT id, role, content, created_at FROM copilot_messages ORDER BY id ASC').all() as unknown as { id: number; role: 'user' | 'assistant'; content: string; created_at: string }[]
  return rows.map((row) => ({ id: row.id, role: row.role, content: row.content, createdAt: row.created_at }))
}

export function addChatMessage(role: 'user' | 'assistant', content: string): StoredMessage {
  const createdAt = new Date().toISOString()
  const result = db.prepare('INSERT INTO copilot_messages (role, content, created_at) VALUES (?, ?, ?)').run(role, content, createdAt)
  return { id: Number(result.lastInsertRowid), role, content, createdAt }
}

export function clearChatMessages(): void {
  db.exec('DELETE FROM copilot_messages')
}

/* ----------------------------------------------------------------- snapshot */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function computeMetrics(shipments: Shipment[], activity: ActivityEntry[]): NetworkMetrics {
  const active = shipments.filter((shipment) => shipment.status !== 'Delivered')
  const dueToday = active.filter((shipment) => shipment.eta.startsWith('Today')).length
  const delays = activity.filter((entry) => entry.kind === 'delay').length
  const service = activity.filter((entry) => entry.kind === 'fuel' || entry.kind === 'checkin').length ? 1 : 0

  return {
    activeShipments: { value: pad(active.length), detail: `${dueToday} due today`, trend: '+12.5%' },
    onTimeRate: { value: FLEET.onTimeRate, detail: `vs. ${FLEET.onTimeRateLastMonth} last month`, trend: '+2.7%' },
    fleetUtilization: { value: FLEET.utilization, detail: `${FLEET.vehiclesConnected} vehicles active`, trend: '-1.4%' },
    needsAttention: { value: pad(delays + service), detail: `${delays} delays · ${service} service`, trend: 'Review now' },
  }
}

/** Everything the dashboard and the demo AI reason over, read fresh from SQLite. */
export function getSnapshot(): NetworkContext {
  const shipments = listShipments()
  const activity = listActivity()
  return {
    asOf: new Date().toISOString(),
    shipments,
    metrics: computeMetrics(shipments, activity),
    fleet: { vehiclesInMotion: FLEET.vehiclesInMotion, vehiclesAtHubs: FLEET.vehiclesAtHubs, vehiclesConnected: FLEET.vehiclesConnected, hubs: FLEET.hubs },
    activity,
  }
}
