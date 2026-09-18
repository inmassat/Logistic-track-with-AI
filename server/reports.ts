import type { NetworkContext, ReportKind, Shipment } from '../src/data/network'

/**
 * Builds the CSV reports the dashboard can export. Each report is generated
 * from a fresh snapshot on the server so the stored copy matches the database
 * at the moment it was exported, not whatever the browser happened to have.
 */

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
}

/** One row per origin-destination corridor, matching the Routes page's de-duplication. */
function routesRows(context: NetworkContext): (string | number)[][] {
  const byCorridor = new Map<string, Shipment>()
  for (const shipment of context.shipments) byCorridor.set(`${shipment.origin}-${shipment.destination}`, shipment)
  return [
    ['Origin', 'Destination', 'Customer', 'Progress', 'ETA', 'Status'],
    ...Array.from(byCorridor.values()).map((shipment) => [shipment.origin, shipment.destination, shipment.customer, `${shipment.progress}%`, shipment.eta, shipment.status]),
  ]
}

function analyticsRows(context: NetworkContext): (string | number)[][] {
  const { shipments, activity, metrics } = context
  const count = (status: string) => shipments.filter((shipment) => shipment.status === status).length
  const averageProgress = shipments.length ? Math.round(shipments.reduce((total, shipment) => total + shipment.progress, 0) / shipments.length) : 0
  return [
    ['Metric', 'Value'],
    ['Total shipments', shipments.length],
    ['Average progress', `${averageProgress}%`],
    ['In transit', count('In transit')],
    ['At hub', count('At hub')],
    ['Delivered', count('Delivered')],
    ['On-time rate', metrics.onTimeRate.value],
    ['Fleet utilization', metrics.fleetUtilization.value],
    ['Activity entries', activity.length],
  ]
}

const BUILDERS: Record<ReportKind, { filename: string; rows: (context: NetworkContext) => (string | number)[][] }> = {
  analytics: { filename: 'haulio-analytics-report.csv', rows: analyticsRows },
  routes: { filename: 'haulio-routes-report.csv', rows: routesRows },
}

export const REPORT_KINDS = Object.keys(BUILDERS) as ReportKind[]

/** Returns the CSV text, its filename and how many data rows it holds (excluding the header). */
export function buildReport(kind: ReportKind, context: NetworkContext): { filename: string; csv: string; rowCount: number } {
  const builder = BUILDERS[kind]
  const rows = builder.rows(context)
  return { filename: builder.filename, csv: toCsv(rows), rowCount: rows.length - 1 }
}
