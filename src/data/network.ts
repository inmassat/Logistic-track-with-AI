/**
 * Shared data shapes. The Express server and the React app both import from
 * here so the SQLite rows, the API payloads and the UI all agree on one model.
 */

export type ShipmentStatus = 'In transit' | 'At hub' | 'Delivered'

export type Shipment = {
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
  createdAt: string
}

/** What the create-shipment form sends. */
export type NewShipment = {
  customer: string
  origin: string
  destination: string
  eta: string
  reference?: string
  service?: string
}

export type ActivityKind = 'delivered' | 'delay' | 'fuel' | 'driver' | 'booked' | 'checkin' | 'review' | 'dispatch'

export type ActivityEntry = {
  id: number
  kind: ActivityKind
  title: string
  body: string
  shipmentId: string | null
  occurredAt: string
}

export type MetricValue = { value: string; detail: string; trend: string }

export type NetworkMetrics = {
  activeShipments: MetricValue
  onTimeRate: MetricValue
  fleetUtilization: MetricValue
  needsAttention: MetricValue
}

export type FleetSnapshot = {
  vehiclesInMotion: number
  vehiclesAtHubs: number
  vehiclesConnected: number
  hubs: string[]
}

export type DriverStatus = 'Available' | 'On route' | 'Off duty'

export type Driver = {
  id: number
  name: string
  phone: string
  license: string
  hub: string
  status: DriverStatus
  createdAt: string
}

/** What the add-driver form sends. */
export type NewDriver = {
  name: string
  phone: string
  hub: string
  license?: string
}

/** A vehicle dispatched from a hub to carry a shipment. */
export type Dispatch = {
  id: number
  shipmentId: string
  hub: string
  vehicle: string | null
  dispatchedBy: string
  createdAt: string
}

/** What the dispatch-vehicle form sends. */
export type NewDispatch = {
  shipmentId: string
  hub: string
  vehicle?: string
}

/**
 * The snapshot handed to the demo AI endpoints. Keeping it in one place means
 * the copilot, the briefing and the risk scorer all reason over the same
 * numbers the operator is looking at on screen.
 */
export type NetworkContext = {
  asOf: string
  shipments: Shipment[]
  metrics: NetworkMetrics
  fleet: FleetSnapshot
  drivers: Driver[]
  dispatches: Dispatch[]
  activity: ActivityEntry[]
}

/* ------------------------------------------------------------ users & chat */

export type User = { id: number; email: string; name: string; role: string }

/** Per-user workspace preferences, stored in SQLite alongside the account. */
export type UserSettings = {
  name: string
  workspace: string
  riskAlerts: boolean
  driverUpdates: boolean
  dailyBriefing: boolean
  /** null until the user has saved settings at least once */
  updatedAt: string | null
}

/** What the settings form sends. */
export type SettingsInput = Omit<UserSettings, 'updatedAt'>

export type SupportStatus = 'Open' | 'Resolved'

/** A help-center request a user sent to support. */
export type SupportRequest = {
  id: number
  subject: string
  message: string
  status: SupportStatus
  createdAt: string
}

/** What the contact-support form sends. */
export type NewSupportRequest = { subject: string; message: string }

export type ReportKind = 'analytics' | 'routes'

/** A CSV report generated from the database and kept so it can be downloaded again. */
export type Report = {
  id: number
  kind: ReportKind
  filename: string
  rowCount: number
  createdAt: string
}

/** What the export button sends. */
export type NewReport = { kind: ReportKind }

export type Conversation = { id: number; title: string; createdAt: string; updatedAt: string }

export type StoredMessage = { id: number; role: 'user' | 'assistant'; content: string; createdAt: string }

/* ------------------------------------------------------- AI result shapes */

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type Briefing = {
  headline: string
  summary: string
  highlights: { tone: 'positive' | 'warning' | 'critical' | 'neutral'; title: string; detail: string }[]
  actions: string[]
}

export type RiskLevel = 'low' | 'medium' | 'high'
export type RiskAssessment = { id: string; level: RiskLevel; score: number; reason: string }
export type SearchResult = { status: string; matchingIds: string[]; interpretation: string }
