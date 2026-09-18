import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ActivityEntry, ActivityKind, Conversation, Dispatch, Driver, DriverStatus, NetworkContext, NetworkMetrics, NewDispatch, NewDriver, NewShipment, Shipment, ShipmentStatus, StoredMessage, User } from '../src/data/network'
import { hashPassword } from './auth'
import { FLEET, SEED_ACTIVITY, SEED_DRIVERS, SEED_SHIPMENTS, SEED_USERS } from './seed'

/**
 * SQLite persistence using Node's built-in `node:sqlite` module, so there is
 * nothing native to compile. The database lives in server/data/ (gitignored)
 * and is seeded with demo users and sample shipments the first time it is
 * created.
 */

const SCHEMA_VERSION = 3

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data')
mkdirSync(dataDir, { recursive: true })

export const DB_PATH = process.env.DATABASE_PATH ?? path.join(dataDir, 'haulio.db')

const db = new DatabaseSync(DB_PATH)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`)

// Version 1 stored copilot messages without users or conversations (and never
// set a user_version), so detect it by its columns. Those rows cannot be
// attributed to anyone and are dropped on upgrade.
const hasLegacyMessages = (() => {
  const table = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'copilot_messages'`).get()
  if (!table) return false
  const columns = db.prepare('PRAGMA table_info(copilot_messages)').all() as unknown as { name: string }[]
  return !columns.some((column) => column.name === 'conversation_id')
})()
if (hasLegacyMessages) {
  db.exec('DROP TABLE copilot_messages')
  console.log('[haul.io] Upgraded database schema: old copilot history discarded')
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

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

  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS copilot_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL,
    license    TEXT NOT NULL DEFAULT 'Class C',
    hub        TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'On route', 'Off duty')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dispatches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id   TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    hub           TEXT NOT NULL,
    vehicle       TEXT,
    dispatched_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS activity_occurred_at ON activity(occurred_at DESC);
  CREATE INDEX IF NOT EXISTS dispatches_created_at ON dispatches(created_at DESC);
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS conversations_user ON conversations(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS messages_conversation ON copilot_messages(conversation_id, id);

  PRAGMA user_version = ${SCHEMA_VERSION};
`)

const nowIso = () => new Date().toISOString()

/* ------------------------------------------------------------------ seeding */

function seedIfEmpty() {
  const users = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }
  if (users.count === 0) {
    const insertUser = db.prepare('INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    for (const user of SEED_USERS) {
      insertUser.run(user.email, user.name, user.role, hashPassword(user.password), nowIso())
    }
    console.log(`[haul.io] Seeded ${SEED_USERS.length} demo users`)
  }

  const drivers = db.prepare('SELECT COUNT(*) AS count FROM drivers').get() as { count: number }
  if (drivers.count === 0) {
    const insertDriver = db.prepare('INSERT INTO drivers (name, phone, license, hub, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    SEED_DRIVERS.forEach((driver, index) => {
      insertDriver.run(driver.name, driver.phone, driver.license, driver.hub, driver.status, new Date(Date.now() - (index + 1) * 24 * 60 * 60 * 1000).toISOString())
    })
    console.log(`[haul.io] Seeded ${SEED_DRIVERS.length} drivers`)
  }

  const shipments = db.prepare('SELECT COUNT(*) AS count FROM shipments').get() as { count: number }
  if (shipments.count > 0) return

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

/* ------------------------------------------------------------ users & auth */

type UserRow = { id: number; email: string; name: string; role: string; password_hash: string }

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, role: row.role }
}

/** Returns the user plus the stored hash so the caller can verify a password. */
export function findUserByEmail(email: string): (User & { passwordHash: string }) | null {
  const row = db.prepare('SELECT id, email, name, role, password_hash FROM users WHERE email = ?').get(email.trim()) as unknown as UserRow | undefined
  return row ? { ...toUser(row), passwordHash: row.password_hash } : null
}

export function createSession(userId: number, ttlMs: number, token: string): void {
  const created = Date.now()
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, new Date(created).toISOString(), new Date(created + ttlMs).toISOString())
}

/** Resolves a session token to its user, discarding the session if it has expired. */
export function getSessionUser(token: string): User | null {
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.password_hash, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token) as unknown as (UserRow & { expires_at: string }) | undefined
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token)
    return null
  }
  return toUser(row)
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

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

  db.exec('BEGIN')
  try {
    db.prepare(`
      INSERT INTO shipments (id, origin, destination, customer, eta, progress, status, color, reference, service, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 'In transit', ?, ?, ?, ?)
    `).run(id, input.origin.trim(), input.destination.trim(), input.customer.trim(), input.eta.trim(), SERVICE_COLORS[service] ?? '#1d9a8a', input.reference?.trim() || null, service, nowIso())
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
  const occurredAt = nowIso()
  const result = db.prepare('INSERT INTO activity (kind, title, body, shipment_id, occurred_at) VALUES (?, ?, ?, ?, ?)').run(kind, title, body, shipmentId, occurredAt)
  return { id: Number(result.lastInsertRowid), kind, title, body, shipmentId, occurredAt }
}

/* ------------------------------------------------------------------ drivers */

type DriverRow = { id: number; name: string; phone: string; license: string; hub: string; status: DriverStatus; created_at: string }

function toDriver(row: DriverRow): Driver {
  return { id: row.id, name: row.name, phone: row.phone, license: row.license, hub: row.hub, status: row.status, createdAt: row.created_at }
}

export function listDrivers(): Driver[] {
  const rows = db.prepare('SELECT * FROM drivers ORDER BY created_at DESC, id DESC').all() as unknown as DriverRow[]
  return rows.map(toDriver)
}

/** Adds a driver to the roster and logs it in the activity feed. */
export function createDriver(input: NewDriver): Driver {
  const name = input.name.trim()
  const hub = input.hub.trim()
  const license = input.license?.trim() || 'Class C'
  const createdAt = nowIso()

  db.exec('BEGIN')
  try {
    const result = db.prepare('INSERT INTO drivers (name, phone, license, hub, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, input.phone.trim(), license, hub, 'Available', createdAt)
    insertActivity('driver', 'Driver added', `${name} · ${hub} hub · ${license}`, null)
    db.exec('COMMIT')
    return { id: Number(result.lastInsertRowid), name, phone: input.phone.trim(), license, hub, status: 'Available', createdAt }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/* --------------------------------------------------------------- dispatches */

type DispatchRow = { id: number; shipment_id: string; hub: string; vehicle: string | null; dispatched_by: string | null; created_at: string }

function toDispatch(row: DispatchRow): Dispatch {
  return { id: row.id, shipmentId: row.shipment_id, hub: row.hub, vehicle: row.vehicle, dispatchedBy: row.dispatched_by ?? 'Unknown', createdAt: row.created_at }
}

export function listDispatches(limit = 50): Dispatch[] {
  const rows = db.prepare(`
    SELECT d.id, d.shipment_id, d.hub, d.vehicle, u.name AS dispatched_by, d.created_at
    FROM dispatches d LEFT JOIN users u ON u.id = d.dispatched_by
    ORDER BY d.created_at DESC, d.id DESC LIMIT ?
  `).all(limit) as unknown as DispatchRow[]
  return rows.map(toDispatch)
}

/**
 * Records a vehicle leaving a hub with a shipment. A shipment still sitting
 * at a hub moves to "In transit"; the dispatch is logged in the activity feed.
 * Returns null when the shipment does not exist or is already delivered.
 */
export function createDispatch(input: NewDispatch, user: User): Dispatch | null {
  const shipment = getShipment(input.shipmentId.trim())
  if (!shipment || shipment.status === 'Delivered') return null
  const hub = input.hub.trim()
  const vehicle = input.vehicle?.trim() || null
  const createdAt = nowIso()

  db.exec('BEGIN')
  try {
    const result = db.prepare('INSERT INTO dispatches (shipment_id, hub, vehicle, dispatched_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(shipment.id, hub, vehicle, user.id, createdAt)
    if (shipment.status === 'At hub') {
      db.prepare(`UPDATE shipments SET status = 'In transit' WHERE id = ?`).run(shipment.id)
    }
    insertActivity('dispatch', 'Vehicle dispatched', `${vehicle ? `${vehicle} · ` : ''}${shipment.id} left ${hub} hub`, shipment.id)
    db.exec('COMMIT')
    return { id: Number(result.lastInsertRowid), shipmentId: shipment.id, hub, vehicle, dispatchedBy: user.name, createdAt }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/* ---------------------------------------------------------- conversations */

type ConversationRow = { id: number; title: string; created_at: string; updated_at: string }

function toConversation(row: ConversationRow): Conversation {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }
}

export function listConversations(userId: number): Conversation[] {
  const rows = db.prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC, id DESC').all(userId) as unknown as ConversationRow[]
  return rows.map(toConversation)
}

export function getConversation(id: number, userId: number): Conversation | null {
  const row = db.prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?').get(id, userId) as unknown as ConversationRow | undefined
  return row ? toConversation(row) : null
}

export function createConversation(userId: number, title: string): Conversation {
  const now = nowIso()
  const result = db.prepare('INSERT INTO conversations (user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(userId, title, now, now)
  return { id: Number(result.lastInsertRowid), title, createdAt: now, updatedAt: now }
}

export function deleteConversation(id: number, userId: number): boolean {
  const result = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(id, userId)
  return Number(result.changes) > 0
}

export function listMessages(conversationId: number): StoredMessage[] {
  const rows = db.prepare('SELECT id, role, content, created_at FROM copilot_messages WHERE conversation_id = ? ORDER BY id ASC').all(conversationId) as unknown as { id: number; role: 'user' | 'assistant'; content: string; created_at: string }[]
  return rows.map((row) => ({ id: row.id, role: row.role, content: row.content, createdAt: row.created_at }))
}

export function addMessage(conversationId: number, role: 'user' | 'assistant', content: string): StoredMessage {
  const createdAt = nowIso()
  const result = db.prepare('INSERT INTO copilot_messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)').run(conversationId, role, content, createdAt)
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(createdAt, conversationId)
  return { id: Number(result.lastInsertRowid), role, content, createdAt }
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
    asOf: nowIso(),
    shipments,
    metrics: computeMetrics(shipments, activity),
    fleet: { vehiclesInMotion: FLEET.vehiclesInMotion, vehiclesAtHubs: FLEET.vehiclesAtHubs, vehiclesConnected: FLEET.vehiclesConnected, hubs: FLEET.hubs },
    drivers: listDrivers(),
    dispatches: listDispatches(),
    activity,
  }
}
