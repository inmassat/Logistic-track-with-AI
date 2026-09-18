import type { ActivityKind, FleetSnapshot, ShipmentStatus } from '../src/data/network'

/**
 * Sample data written into SQLite the first time the service starts with an
 * empty database. Delete server/data/haulio.db to reset to this state.
 */

export type SeedShipment = {
  id: string
  origin: string
  destination: string
  customer: string
  eta: string
  progress: number
  status: ShipmentStatus
  color: string
  service: string
}

export const SEED_SHIPMENTS: SeedShipment[] = [
  { id: 'TRK-8504', origin: 'Rotterdam', destination: 'Vienna', customer: 'Blue Harbor Retail', eta: 'Sep 13, 14:30', progress: 0, status: 'In transit', color: '#1d9a8a', service: 'Standard road freight' },
  { id: 'TRK-8501', origin: 'Hamburg', destination: 'Berlin', customer: 'Helix Components', eta: 'Tomorrow, 08:30', progress: 9, status: 'At hub', color: '#e16f55', service: 'Express delivery' },
  { id: 'TRK-8497', origin: 'Rotterdam', destination: 'Antwerp', customer: 'Nordmarkt GmbH', eta: 'Today, 14:00', progress: 88, status: 'In transit', color: '#1d9a8a', service: 'Standard road freight' },
  { id: 'TRK-8492', origin: 'Rotterdam', destination: 'Berlin', customer: 'Nordmarkt GmbH', eta: 'Today, 16:30', progress: 72, status: 'In transit', color: '#f29b38', service: 'Express delivery' },
  { id: 'TRK-8490', origin: 'Lyon', destination: 'Paris', customer: 'Blue Harbor Retail', eta: 'Today, 19:20', progress: 55, status: 'In transit', color: '#1d9a8a', service: 'Temperature controlled' },
  { id: 'TRK-8488', origin: 'Antwerp', destination: 'Paris', customer: 'Maison Atlas', eta: 'Today, 18:15', progress: 48, status: 'In transit', color: '#1d9a8a', service: 'Standard road freight' },
  { id: 'TRK-8483', origin: 'Berlin', destination: 'Prague', customer: 'Kovak Industries', eta: 'Tomorrow, 12:00', progress: 18, status: 'At hub', color: '#e16f55', service: 'Standard road freight' },
  { id: 'TRK-8479', origin: 'Hamburg', destination: 'Prague', customer: 'Kovak Industries', eta: 'Tomorrow, 09:00', progress: 31, status: 'At hub', color: '#e16f55', service: 'Express delivery' },
  { id: 'TRK-8471', origin: 'Antwerp', destination: 'Hamburg', customer: 'Helix Components', eta: 'Today, 20:45', progress: 64, status: 'In transit', color: '#f29b38', service: 'Standard road freight' },
  { id: 'TRK-8466', origin: 'Lyon', destination: 'Milan', customer: 'Volta Retail', eta: 'Delivered 11:42', progress: 100, status: 'Delivered', color: '#7a8792', service: 'Temperature controlled' },
  { id: 'TRK-8462', origin: 'Milan', destination: 'Vienna', customer: 'Volta Retail', eta: 'Delivered 10:05', progress: 100, status: 'Delivered', color: '#7a8792', service: 'Standard road freight' },
  { id: 'TRK-8458', origin: 'Paris', destination: 'Lyon', customer: 'Maison Atlas', eta: 'Delivered 09:15', progress: 100, status: 'Delivered', color: '#7a8792', service: 'Express delivery' },
]

export type SeedActivity = {
  kind: ActivityKind
  title: string
  body: string
  shipmentId: string | null
  minutesAgo: number
}

export const SEED_ACTIVITY: SeedActivity[] = [
  { kind: 'delivered', title: 'Shipment delivered', body: 'TRK-8466 arrived in Milan', shipmentId: 'TRK-8466', minutesAgo: 11 },
  { kind: 'delay', title: 'Delay reported', body: 'TRK-8479 · 35 min at Hamburg hub', shipmentId: 'TRK-8479', minutesAgo: 28 },
  { kind: 'fuel', title: 'Fuel alert resolved', body: 'Vehicle NL-42 is back on route', shipmentId: null, minutesAgo: 60 },
  { kind: 'delay', title: 'Delay reported', body: 'TRK-8483 · 20 min at Berlin hub', shipmentId: 'TRK-8483', minutesAgo: 95 },
  { kind: 'driver', title: 'Driver shift started', body: 'Elena Rossi · Route DE-04', shipmentId: null, minutesAgo: 120 },
  { kind: 'delivered', title: 'Shipment delivered', body: 'TRK-8462 arrived in Vienna', shipmentId: 'TRK-8462', minutesAgo: 140 },
  { kind: 'booked', title: 'Shipment booked', body: 'TRK-8504 · Blue Harbor Retail', shipmentId: 'TRK-8504', minutesAgo: 180 },
  { kind: 'delivered', title: 'Shipment delivered', body: 'TRK-8458 arrived in Lyon', shipmentId: 'TRK-8458', minutesAgo: 190 },
  { kind: 'checkin', title: 'Vehicle checked in', body: 'NL-42 · Rotterdam hub', shipmentId: null, minutesAgo: 240 },
]

/** Fleet-level figures that are not derived from the shipment table. */
export const FLEET: FleetSnapshot & { onTimeRate: string; onTimeRateLastMonth: string; utilization: string } = {
  vehiclesInMotion: 18,
  vehiclesAtHubs: 6,
  vehiclesConnected: 142,
  hubs: ['Rotterdam', 'Antwerp', 'Hamburg', 'Lyon'],
  onTimeRate: '94.8%',
  onTimeRateLastMonth: '92.1%',
  utilization: '78.2%',
}
