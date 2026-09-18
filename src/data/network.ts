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
}

export const shipments: Shipment[] = [
  { id: 'TRK-8492', origin: 'Rotterdam', destination: 'Berlin', customer: 'Nordmarkt GmbH', eta: 'Today, 16:30', progress: 72, status: 'In transit', color: '#f29b38' },
  { id: 'TRK-8488', origin: 'Antwerp', destination: 'Paris', customer: 'Maison Atlas', eta: 'Today, 18:15', progress: 48, status: 'In transit', color: '#1d9a8a' },
  { id: 'TRK-8479', origin: 'Hamburg', destination: 'Prague', customer: 'Kovak Industries', eta: 'Tomorrow, 09:00', progress: 31, status: 'At hub', color: '#e16f55' },
  { id: 'TRK-8466', origin: 'Lyon', destination: 'Milan', customer: 'Volta Retail', eta: 'Delivered 11:42', progress: 100, status: 'Delivered', color: '#7a8792' },
  { id: 'TRK-8504', origin: 'Rotterdam', destination: 'Vienna', customer: 'Blue Harbor Retail', eta: 'Sep 13, 14:30', progress: 0, status: 'In transit', color: '#1d9a8a' },
]

export const networkMetrics = {
  activeShipments: { value: '24', detail: '8 due today', trend: '+12.5%' },
  onTimeRate: { value: '94.8%', detail: 'vs. 92.1% last month', trend: '+2.7%' },
  fleetUtilization: { value: '78.2%', detail: '142 vehicles active', trend: '-1.4%' },
  needsAttention: { value: '03', detail: '2 delays · 1 service', trend: 'Review now' },
}

export const fleetSnapshot = {
  vehiclesInMotion: 18,
  vehiclesAtHubs: 6,
  vehiclesConnected: 142,
  hubs: ['Rotterdam', 'Antwerp', 'Hamburg', 'Lyon'],
}

export const recentActivity = [
  { title: 'Shipment delivered', body: 'TRK-8466 arrived in Milan', time: '11 min ago' },
  { title: 'Delay reported', body: 'TRK-8479 · 35 min at Hamburg hub', time: '28 min ago' },
  { title: 'Fuel alert resolved', body: 'Vehicle NL-42 is back on route', time: '1 hr ago' },
  { title: 'Driver shift started', body: 'Elena Rossi · Route DE-04', time: '2 hrs ago' },
  { title: 'Shipment booked', body: 'TRK-8504 · Blue Harbor Retail', time: '3 hrs ago' },
  { title: 'Vehicle checked in', body: 'NL-42 · Rotterdam hub', time: '4 hrs ago' },
]

/**
 * The snapshot handed to the AI endpoints. Keeping it in one place means the
 * copilot, the briefing and the risk scorer all reason over the same numbers
 * the operator is looking at on screen.
 */
export type NetworkContext = {
  asOf: string
  shipments: Shipment[]
  metrics: typeof networkMetrics
  fleet: typeof fleetSnapshot
  activity: typeof recentActivity
}

export function buildNetworkContext(rows: Shipment[] = shipments): NetworkContext {
  return {
    asOf: 'Thursday, September 11, 2026',
    shipments: rows,
    metrics: networkMetrics,
    fleet: fleetSnapshot,
    activity: recentActivity,
  }
}
