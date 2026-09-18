import type { ActivityEntry, Briefing, ChatMessage, NetworkContext, RiskAssessment, SearchResult, Shipment, ShipmentStatus, User } from '../src/data/network'

/**
 * A self-contained demo "AI" for the dashboard. Every answer is produced by
 * rules over the live SQLite snapshot, so the demo runs with no API key and
 * no network access while still behaving like a grounded assistant: it cites
 * real tracking IDs, customers, routes and figures.
 *
 * Swap this module for a real model later: the four exported functions match
 * the shapes the front end already consumes.
 */

export const ENGINE = 'demo-rules-v1'

/* ---------------------------------------------------------------- helpers */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const isDueToday = (shipment: Shipment) => shipment.eta.startsWith('Today')
const isDelivered = (shipment: Shipment) => shipment.status === 'Delivered'

function delaysFor(shipment: Shipment, activity: ActivityEntry[]): ActivityEntry[] {
  return activity.filter((entry) => entry.kind === 'delay' && entry.shipmentId === shipment.id)
}

function listNames(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/* ------------------------------------------------------------- risk score */

export function assessRisk(context: NetworkContext): RiskAssessment[] {
  return context.shipments.map((shipment) => {
    const delays = delaysFor(shipment, context.activity)
    let score: number
    let reason: string

    if (isDelivered(shipment)) {
      score = 4
      reason = 'Delivered and signed off.'
    } else if (shipment.status === 'At hub') {
      score = 42 + delays.length * 28 + (isDueToday(shipment) ? 15 : 0)
      reason = delays.length
        ? `Dwell time reported: ${delays[0].body.split(' · ')[1] ?? delays[0].body}.`
        : 'Waiting at the hub, not yet dispatched on the final leg.'
    } else if (shipment.progress === 0) {
      score = 30
      reason = 'Booked but not yet moving.'
    } else if (isDueToday(shipment) && shipment.progress < 50) {
      score = 66 + delays.length * 20
      reason = `Only ${shipment.progress}% complete with delivery due ${shipment.eta.toLowerCase()}.`
    } else if (isDueToday(shipment) && shipment.progress < 75) {
      score = 38 + delays.length * 25
      reason = `${shipment.progress}% complete, which is tight against ${shipment.eta}.`
    } else {
      score = 12 + delays.length * 25
      reason = `${shipment.progress}% complete and tracking to ${shipment.eta}.`
    }

    score = clamp(Math.round(score), 0, 100)
    const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low'
    return { id: shipment.id, level, score, reason }
  })
}

function riskById(context: NetworkContext): Map<string, RiskAssessment> {
  return new Map(assessRisk(context).map((assessment) => [assessment.id, assessment]))
}

/* --------------------------------------------------------------- briefing */

export function buildBriefing(context: NetworkContext): Briefing {
  const { shipments, activity, metrics, fleet } = context
  const risks = riskById(context)
  const inTransit = shipments.filter((shipment) => shipment.status === 'In transit')
  const atHub = shipments.filter((shipment) => shipment.status === 'At hub')
  const delivered = shipments.filter(isDelivered)
  const high = shipments.filter((shipment) => risks.get(shipment.id)?.level === 'high')
  const medium = shipments.filter((shipment) => risks.get(shipment.id)?.level === 'medium')
  const dueToday = shipments.filter((shipment) => !isDelivered(shipment) && isDueToday(shipment))
  const delays = activity.filter((entry) => entry.kind === 'delay')

  const headline = high.length
    ? `${inTransit.length} shipments moving, ${atHub.length} at hubs, and ${high.length} at risk of missing ${high.length === 1 ? 'its' : 'their'} ETA.`
    : `${inTransit.length} shipments moving and ${atHub.length} at hubs, with nothing currently at high risk.`

  const summary = [
    `${dueToday.length} of today's ${shipments.length - delivered.length} active shipments are due before end of day, and ${delivered.length} ${delivered.length === 1 ? 'has' : 'have'} already been delivered.`,
    delays.length
      ? `${delays.length} ${delays.length === 1 ? 'delay has' : 'delays have'} been reported at hubs, which is where the attention is needed.`
      : 'No hub delays have been reported so far.',
    `The network is running at ${metrics.onTimeRate.value} on time with ${fleet.vehiclesInMotion} vehicles in motion and ${metrics.fleetUtilization.value} fleet utilization.`,
  ].join(' ')

  const highlights: Briefing['highlights'] = []
  for (const shipment of high) {
    highlights.push({ tone: 'critical', title: `${shipment.id} at risk`, detail: `${shipment.customer}, ${shipment.origin} to ${shipment.destination}. ${risks.get(shipment.id)?.reason ?? ''}` })
  }
  for (const shipment of medium.slice(0, 2)) {
    highlights.push({ tone: 'warning', title: `${shipment.id} needs watching`, detail: `${shipment.customer}, due ${shipment.eta}. ${risks.get(shipment.id)?.reason ?? ''}` })
  }
  if (delivered.length) {
    highlights.push({ tone: 'positive', title: `${delivered.length} delivered so far`, detail: `${listNames(delivered.map((shipment) => shipment.id))} completed on time.` })
  }
  highlights.push({ tone: 'neutral', title: 'Fleet position', detail: `${fleet.vehiclesInMotion} vehicles in motion, ${fleet.vehiclesAtHubs} at distribution hubs, ${fleet.vehiclesConnected} connected.` })

  const actions: string[] = []
  for (const shipment of high) {
    const hubDelay = delaysFor(shipment, activity)[0]
    actions.push(hubDelay
      ? `Call the ${shipment.origin} hub about ${shipment.id} (${shipment.customer}) and lock in a dispatch slot for the ${shipment.destination} leg.`
      : `Check in with the driver on ${shipment.id} (${shipment.customer}) and confirm whether ${shipment.eta} is still realistic.`)
  }
  const unstarted = shipments.find((shipment) => shipment.status === 'In transit' && shipment.progress === 0)
  if (unstarted) actions.push(`Assign a vehicle to ${unstarted.id} so the ${unstarted.customer} booking to ${unstarted.destination} starts moving.`)
  const latestDelivery = delivered[0]
  if (latestDelivery) actions.push(`Send the proof of delivery for ${latestDelivery.id} to ${latestDelivery.customer}.`)
  if (actions.length < 2) actions.push('Review fleet utilization before the afternoon wave of departures.')

  return { headline, summary, highlights: highlights.slice(0, 5), actions: actions.slice(0, 4) }
}

/* ------------------------------------------------------------ smart search */

const COUNTRY_CITIES: Record<string, string[]> = {
  germany: ['Berlin', 'Hamburg'],
  german: ['Berlin', 'Hamburg'],
  france: ['Paris', 'Lyon'],
  french: ['Paris', 'Lyon'],
  netherlands: ['Rotterdam'],
  holland: ['Rotterdam'],
  dutch: ['Rotterdam'],
  belgium: ['Antwerp'],
  belgian: ['Antwerp'],
  italy: ['Milan'],
  italian: ['Milan'],
  czech: ['Prague'],
  czechia: ['Prague'],
  austria: ['Vienna'],
  austrian: ['Vienna'],
}

export function searchShipments(query: string, context: NetworkContext): SearchResult {
  const q = query.toLowerCase()
  const risks = riskById(context)
  const phrases: string[] = []

  let status: ShipmentStatus | 'All' = 'All'
  if (/\bdelivered\b|\bcompleted\b|\barrived\b/.test(q)) status = 'Delivered'
  else if (/\bhub\b|\bhubs\b|\bsitting\b|\bwaiting\b|\bstuck\b|\bheld\b|\bparked\b/.test(q)) status = 'At hub'
  else if (/\btransit\b|\bmoving\b|\bon the road\b|\ben route\b|\bdriving\b/.test(q)) status = 'In transit'

  const wantsLate = /\blate\b|\bdelay|\bbehind\b|\brisk\b|\bslow\b|\boverdue\b|\bmiss/.test(q) && status !== 'Delivered'
  const wantsToday = /\btoday\b|\bthis afternoon\b|\btonight\b/.test(q)
  const wantsTomorrow = /\btomorrow\b/.test(q)
  const wantsUnstarted = /\bnot (yet )?(moving|started)\b|\bunassigned\b|\bnew booking/.test(q)

  const cities = new Set<string>()
  for (const [country, list] of Object.entries(COUNTRY_CITIES)) {
    if (q.includes(country)) list.forEach((city) => cities.add(city))
  }
  const knownCities = new Set(context.shipments.flatMap((shipment) => [shipment.origin, shipment.destination]))
  for (const city of knownCities) {
    if (q.includes(city.toLowerCase())) cities.add(city)
  }
  const direction: 'destination' | 'origin' | 'either' = /\b(to|heading|towards?|into|bound for|arriving|going)\b/.test(q)
    ? 'destination'
    : /\b(from|leaving|out of|departing)\b/.test(q) ? 'origin' : 'either'

  const customers = [...new Set(context.shipments.map((shipment) => shipment.customer))].filter((customer) => {
    const words = customer.toLowerCase().split(/\s+/).filter((word) => word.length > 3)
    return words.some((word) => q.includes(word))
  })

  const ids = [...q.matchAll(/trk-?\s?(\d{4})/g)].map((match) => `TRK-${match[1]}`)

  const recognised = status !== 'All' || wantsLate || wantsToday || wantsTomorrow || wantsUnstarted || cities.size > 0 || customers.length > 0 || ids.length > 0

  let matches = context.shipments.filter((shipment) => {
    if (ids.length && !ids.includes(shipment.id)) return false
    if (status !== 'All' && shipment.status !== status) return false
    if (wantsLate && (risks.get(shipment.id)?.score ?? 0) < 30) return false
    if (wantsToday && !(isDueToday(shipment) || shipment.eta.startsWith('Delivered'))) return false
    if (wantsTomorrow && !shipment.eta.startsWith('Tomorrow')) return false
    if (wantsUnstarted && shipment.progress !== 0) return false
    if (cities.size) {
      const hitsDestination = cities.has(shipment.destination)
      const hitsOrigin = cities.has(shipment.origin)
      if (direction === 'destination' && !hitsDestination) return false
      if (direction === 'origin' && !hitsOrigin) return false
      if (direction === 'either' && !hitsDestination && !hitsOrigin) return false
    }
    if (customers.length && !customers.includes(shipment.customer)) return false
    return true
  })

  if (!recognised) {
    // Fall back to a plain substring match so odd phrasing still finds something.
    const tokens = q.split(/[^a-z0-9-]+/).filter((token) => token.length > 2)
    matches = context.shipments.filter((shipment) => {
      const haystack = `${shipment.id} ${shipment.customer} ${shipment.origin} ${shipment.destination} ${shipment.service} ${shipment.eta}`.toLowerCase()
      return tokens.some((token) => haystack.includes(token))
    })
    phrases.push(matches.length ? `Matched "${query}" against tracking IDs, customers, routes and service levels` : `Could not map "${query}" to a filter`)
  } else {
    if (ids.length) phrases.push(`Looking up ${listNames(ids)}`)
    else phrases.push(status === 'All' ? 'Showing all shipments' : `Showing shipments ${status.toLowerCase()}`)
    if (wantsLate) phrases.push('flagged as running late or at risk')
    if (wantsUnstarted) phrases.push('that have not started moving')
    if (cities.size) {
      const where = listNames([...cities])
      phrases.push(direction === 'destination' ? `heading to ${where}` : direction === 'origin' ? `leaving ${where}` : `touching ${where}`)
    }
    if (customers.length) phrases.push(`for ${listNames(customers)}`)
    if (wantsToday) phrases.push(status === 'Delivered' ? 'today' : 'due or delivered today')
    if (wantsTomorrow) phrases.push('due tomorrow')
  }

  return {
    status,
    matchingIds: matches.map((shipment) => shipment.id),
    interpretation: `${phrases.join(' ')}.`,
  }
}

/* ----------------------------------------------------------------- copilot */

function riskAnswer(context: NetworkContext): string {
  const risks = riskById(context)
  const flagged = context.shipments
    .filter((shipment) => !isDelivered(shipment) && (risks.get(shipment.id)?.score ?? 0) >= 30)
    .sort((left, right) => (risks.get(right.id)?.score ?? 0) - (risks.get(left.id)?.score ?? 0))
  if (!flagged.length) return 'Nothing is currently at risk. Every active shipment is tracking to its ETA.'
  const lines = flagged.map((shipment) => {
    const risk = risks.get(shipment.id)!
    return `• ${shipment.id} · ${shipment.customer}, ${shipment.origin} to ${shipment.destination}, due ${shipment.eta}. Risk ${risk.score}/100: ${risk.reason}`
  })
  const high = flagged.filter((shipment) => risks.get(shipment.id)?.level === 'high')
  return `${flagged.length} shipment${flagged.length === 1 ? '' : 's'} need${flagged.length === 1 ? 's' : ''} attention, ${high.length} at high risk:\n\n${lines.join('\n')}\n\nStart with ${high[0]?.id ?? flagged[0].id}. It has the least slack against its ETA.`
}

function activityAnswer(context: NetworkContext, hours: number): string {
  const cutoff = Date.now() - hours * 60 * 60 * 1000
  const recent = context.activity.filter((entry) => new Date(entry.occurredAt).getTime() >= cutoff)
  if (!recent.length) return `Nothing has been logged in the last ${hours} hour${hours === 1 ? '' : 's'}.`
  const lines = recent.map((entry) => `• ${entry.title}: ${entry.body} (${timeAgo(entry.occurredAt)})`)
  const delays = recent.filter((entry) => entry.kind === 'delay').length
  const delivered = recent.filter((entry) => entry.kind === 'delivered').length
  return `In the last ${hours} hour${hours === 1 ? '' : 's'} there were ${recent.length} updates: ${delivered} deliver${delivered === 1 ? 'y' : 'ies'} and ${delays} delay report${delays === 1 ? '' : 's'}.\n\n${lines.join('\n')}`
}

function priorityAnswer(context: NetworkContext): string {
  const briefing = buildBriefing(context)
  return `Here is the order I would work in this morning:\n\n${briefing.actions.map((action, index) => `${index + 1}. ${action}`).join('\n')}\n\n${briefing.headline}`
}

function corridorAnswer(context: NetworkContext, city: string): string {
  const risks = riskById(context)
  const through = context.shipments.filter((shipment) => shipment.origin === city || shipment.destination === city)
  if (!through.length) return `No shipments in the current snapshot pass through ${city}.`
  const active = through.filter((shipment) => !isDelivered(shipment))
  const flagged = active.filter((shipment) => (risks.get(shipment.id)?.score ?? 0) >= 30)
  const lines = through.map((shipment) => `• ${shipment.id} · ${shipment.customer}, ${shipment.origin} to ${shipment.destination}, ${shipment.status.toLowerCase()} at ${shipment.progress}%, ${shipment.eta}`)
  const verdict = flagged.length
    ? `${flagged.length} of them (${listNames(flagged.map((shipment) => shipment.id))}) ${flagged.length === 1 ? 'is' : 'are'} behind and worth a call.`
    : 'All of them are tracking to plan.'
  return `The ${city} corridor has ${through.length} shipment${through.length === 1 ? '' : 's'}, ${active.length} still active. ${verdict}\n\n${lines.join('\n')}`
}

function shipmentAnswer(context: NetworkContext, id: string): string {
  const shipment = context.shipments.find((candidate) => candidate.id === id)
  if (!shipment) return `I cannot find ${id} in the current snapshot. Check the tracking ID and try again.`
  const risk = riskById(context).get(id)!
  const history = context.activity.filter((entry) => entry.shipmentId === id)
  const historyLines = history.length ? `\n\nRecent activity:\n${history.map((entry) => `• ${entry.title}: ${entry.body} (${timeAgo(entry.occurredAt)})`).join('\n')}` : ''
  const service = shipment.service.toLowerCase()
  return `${shipment.id} is ${/^[aeiou]/.test(service) ? "an" : "a"} ${service} shipment for ${shipment.customer}, ${shipment.origin} to ${shipment.destination}. It is ${shipment.status.toLowerCase()} at ${shipment.progress}% with an ETA of ${shipment.eta}.\n\nDelay risk is ${risk.level} (${risk.score}/100): ${risk.reason}${historyLines}`
}

function customerAnswer(context: NetworkContext, customer: string): string {
  const risks = riskById(context)
  const theirs = context.shipments.filter((shipment) => shipment.customer === customer)
  const lines = theirs.map((shipment) => `• ${shipment.id} · ${shipment.origin} to ${shipment.destination}, ${shipment.status.toLowerCase()} at ${shipment.progress}%, ${shipment.eta} (risk ${risks.get(shipment.id)?.score ?? 0}/100)`)
  return `${customer} has ${theirs.length} shipment${theirs.length === 1 ? '' : 's'} in the network:\n\n${lines.join('\n')}`
}

function overviewAnswer(context: NetworkContext): string {
  const { shipments, metrics, fleet } = context
  const inTransit = shipments.filter((shipment) => shipment.status === 'In transit').length
  const atHub = shipments.filter((shipment) => shipment.status === 'At hub').length
  const delivered = shipments.filter(isDelivered).length
  return `Right now there are ${shipments.length} shipments in the snapshot: ${inTransit} in transit, ${atHub} at hubs and ${delivered} delivered. ${metrics.activeShipments.detail} and the network is running at ${metrics.onTimeRate.value} on time. ${fleet.vehiclesInMotion} vehicles are in motion and ${fleet.vehiclesAtHubs} are at distribution hubs.`
}

function fallbackAnswer(context: NetworkContext): string {
  return `${overviewAnswer(context)}\n\nI can answer questions like:\n• Which shipments are at risk of missing their ETA?\n• Summarize what happened in the last two hours.\n• What should I deal with first this morning?\n• How is the Rotterdam corridor performing?\n• What is happening with TRK-8479?`
}

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** Produces the assistant's reply to the latest user message. */
export function answerQuestion(messages: ChatMessage[], context: NetworkContext, user?: User): string {
  const last = [...messages].reverse().find((message) => message.role === 'user')
  const q = (last?.content ?? '').toLowerCase().trim()
  if (!q) return fallbackAnswer(context)

  const idMatch = q.match(/trk-?\s?(\d{4})/)
  if (idMatch) return shipmentAnswer(context, `TRK-${idMatch[1]}`)

  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(q)) {
    const name = user?.name.split(' ')[0]
    return `${name ? `Good to see you, ${name}.` : 'Good to see you.'} ${overviewAnswer(context)}\n\nAsk me what is at risk, what happened recently, or what to deal with first.`
  }

  if (/who am i|my (account|role|name)|logged in as/.test(q) && user) {
    return `You are signed in as ${user.name} (${user.email}), ${user.role.toLowerCase()} at Atlas Haulage.`
  }

  if (/what can you do|help|how do (i|you)|what do you know/.test(q)) return fallbackAnswer(context)

  const customer = [...new Set(context.shipments.map((shipment) => shipment.customer))].find((name) => {
    const words = name.toLowerCase().split(/\s+/).filter((word) => word.length > 3)
    return words.some((word) => q.includes(word))
  })
  if (customer) return customerAnswer(context, customer)

  const city = [...new Set(context.shipments.flatMap((shipment) => [shipment.origin, shipment.destination]))].find((name) => q.includes(name.toLowerCase()))
  if (city) return corridorAnswer(context, city)

  if (/\brisk|\blate\b|\bmiss|\bdelay|\bbehind\b|\boverdue\b/.test(q)) return riskAnswer(context)

  if (/summar|happened|recent|update|last .*hour|activity|log\b/.test(q)) {
    const hoursMatch = q.match(/(\d+|one|two|three|four|five|six)\s*(hour|hr)/)
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
    const hours = hoursMatch ? (words[hoursMatch[1]] ?? Number(hoursMatch[1])) : 4
    return activityAnswer(context, hours)
  }

  if (/first|priorit|deal with|start with|focus|next step|to.?do|should i/.test(q)) return priorityAnswer(context)

  if (/how many|count|status|overview|how (is|are)|doing|performing|network/.test(q)) return overviewAnswer(context)

  return fallbackAnswer(context)
}
