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

export type ActivityKind = 'delivered' | 'delay' | 'fuel' | 'driver' | 'booked' | 'checkin' | 'review'

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
  activity: ActivityEntry[]
}

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
