import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ChatMessage, NetworkContext, NewDispatch, NewDriver, NewShipment, SettingsInput, User } from '../src/data/network'
import { REMEMBERED_SESSION_TTL_MS, SESSION_COOKIE, SESSION_TTL_MS, clearedSessionCookie, newSessionToken, parseCookies, sessionCookie, verifyPassword } from './auth'
import { DB_PATH, addMessage, createConversation, createDispatch, createDriver, createSession, createShipment, deleteConversation, deleteSession, findUserByEmail, getConversation, getSessionUser, getSnapshot, getUserSettings, listActivity, listConversations, listDispatches, listDrivers, listMessages, listShipments, markShipmentForReview, saveUserSettings } from './db'
import { ENGINE, answerQuestion, assessRisk, buildBriefing, searchShipments } from './demoAi'

const PORT = Number(process.env.PORT ?? 8787)

const app = express()
app.use(express.json({ limit: '1mb' }))

/* ------------------------------------------------------------------- auth */

/** Public endpoints; everything else under /api needs a valid session. */
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login'])

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  const user = token ? getSessionUser(token) : null
  res.locals.user = user
  res.locals.token = token
  if (user || PUBLIC_PATHS.has(req.originalUrl.split('?')[0])) return next()
  res.status(401).json({ error: 'unauthorized', message: 'Please sign in to continue.' })
})

const currentUser = (res: Response): User => res.locals.user as User

app.post('/api/auth/login', (req: Request, res: Response) => {
  const email = String(req.body?.email ?? '').trim()
  const password = String(req.body?.password ?? '')
  const remember = Boolean(req.body?.remember)
  if (!email || !password) {
    return res.status(400).json({ error: 'bad_request', message: 'Email and password are required.' })
  }
  const account = findUserByEmail(email)
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'That email and password do not match. Try demo@haul.io with demo1234.' })
  }
  const token = newSessionToken()
  const ttl = remember ? REMEMBERED_SESSION_TTL_MS : SESSION_TTL_MS
  createSession(account.id, ttl, token)
  res.setHeader('Set-Cookie', sessionCookie(token, ttl))
  res.json({ id: account.id, email: account.email, name: account.name, role: account.role } satisfies User)
})

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  if (res.locals.token) deleteSession(String(res.locals.token))
  res.setHeader('Set-Cookie', clearedSessionCookie())
  res.status(204).end()
})

app.get('/api/auth/me', (_req: Request, res: Response) => {
  res.json(currentUser(res))
})

app.get('/api/settings', (_req: Request, res: Response) => {
  res.json(getUserSettings(currentUser(res)))
})

app.put('/api/settings', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Partial<SettingsInput>
  const input: SettingsInput = {
    name: String(body.name ?? ''),
    workspace: String(body.workspace ?? ''),
    riskAlerts: body.riskAlerts !== false,
    driverUpdates: body.driverUpdates !== false,
    dailyBriefing: body.dailyBriefing !== false,
  }
  if (input.name.length > 80 || input.workspace.length > 80) {
    return res.status(400).json({ error: 'bad_request', message: 'Name and workspace must be 80 characters or fewer.' })
  }
  res.json(saveUserSettings(currentUser(res), input))
})

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, configured: true, engine: ENGINE, database: DB_PATH })
})

/* ------------------------------------------------------------------- data */

/** The AI endpoints always answer from a fresh SQLite read. */
function currentContext(): NetworkContext {
  return getSnapshot()
}

app.get('/api/snapshot', (_req: Request, res: Response) => {
  res.json(getSnapshot())
})

app.get('/api/shipments', (_req: Request, res: Response) => {
  res.json({ shipments: listShipments() })
})

app.post('/api/shipments', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Partial<NewShipment>
  const missing = (['customer', 'origin', 'destination', 'eta'] as const).filter((field) => !String(body[field] ?? '').trim())
  if (missing.length) {
    return res.status(400).json({ error: 'bad_request', message: `Missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.` })
  }
  const shipment = createShipment({
    customer: String(body.customer),
    origin: String(body.origin),
    destination: String(body.destination),
    eta: String(body.eta),
    reference: body.reference ? String(body.reference) : undefined,
    service: body.service ? String(body.service) : undefined,
  })
  res.status(201).json(shipment)
})

app.post('/api/shipments/:id/review', (req: Request, res: Response) => {
  const entry = markShipmentForReview(String(req.params.id))
  if (!entry) return res.status(404).json({ error: 'not_found', message: 'No shipment with that tracking ID.' })
  res.status(201).json(entry)
})

app.get('/api/activity', (_req: Request, res: Response) => {
  res.json({ activity: listActivity() })
})

/* ------------------------------------------------------ drivers & dispatch */

app.get('/api/drivers', (_req: Request, res: Response) => {
  res.json({ drivers: listDrivers() })
})

app.post('/api/drivers', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Partial<NewDriver>
  const missing = (['name', 'phone', 'hub'] as const).filter((field) => !String(body[field] ?? '').trim())
  if (missing.length) {
    return res.status(400).json({ error: 'bad_request', message: `Missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.` })
  }
  const driver = createDriver({
    name: String(body.name),
    phone: String(body.phone),
    hub: String(body.hub),
    license: body.license ? String(body.license) : undefined,
  })
  res.status(201).json(driver)
})

app.get('/api/dispatches', (_req: Request, res: Response) => {
  res.json({ dispatches: listDispatches() })
})

app.post('/api/dispatches', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Partial<NewDispatch>
  const missing = (['shipmentId', 'hub'] as const).filter((field) => !String(body[field] ?? '').trim())
  if (missing.length) {
    return res.status(400).json({ error: 'bad_request', message: `Missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.` })
  }
  const dispatch = createDispatch({
    shipmentId: String(body.shipmentId),
    hub: String(body.hub),
    vehicle: body.vehicle ? String(body.vehicle) : undefined,
  }, currentUser(res))
  if (!dispatch) return res.status(404).json({ error: 'not_found', message: 'No active shipment with that tracking ID.' })
  res.status(201).json(dispatch)
})

/* ---------------------------------------------------------- conversations */

app.get('/api/conversations', (_req: Request, res: Response) => {
  res.json({ conversations: listConversations(currentUser(res).id) })
})

app.get('/api/conversations/:id/messages', (req: Request, res: Response) => {
  const conversation = getConversation(Number(req.params.id), currentUser(res).id)
  if (!conversation) return res.status(404).json({ error: 'not_found', message: 'Conversation not found.' })
  res.json({ conversation, messages: listMessages(conversation.id) })
})

app.delete('/api/conversations/:id', (req: Request, res: Response) => {
  const removed = deleteConversation(Number(req.params.id), currentUser(res).id)
  if (!removed) return res.status(404).json({ error: 'not_found', message: 'Conversation not found.' })
  res.status(204).end()
})

/* -------------------------------------------------------------- assistant */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function titleFrom(message: string): string {
  const cleaned = message.replace(/\s+/g, ' ').trim()
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned
}

/**
 * Streams the assistant's reply as server-sent events. The answer is computed
 * instantly by the demo engine and then released word by word so the page
 * behaves the way a streaming model would. The first frame carries the
 * conversation id so a brand-new chat can be selected in the sidebar.
 */
app.post('/api/chat', async (req: Request, res: Response) => {
  const user = currentUser(res)
  const message = String(req.body?.message ?? '').trim()
  if (!message) {
    return res.status(400).json({ error: 'bad_request', message: 'message is required.' })
  }

  const requestedId = req.body?.conversationId
  let conversation = requestedId != null ? getConversation(Number(requestedId), user.id) : null
  if (requestedId != null && !conversation) {
    return res.status(404).json({ error: 'not_found', message: 'Conversation not found.' })
  }
  if (!conversation) conversation = createConversation(user.id, titleFrom(message))

  const history: ChatMessage[] = listMessages(conversation.id).map(({ role, content }) => ({ role, content }))
  history.push({ role: 'user', content: message })
  addMessage(conversation.id, 'user', message)

  const answer = answerQuestion(history, currentContext(), user)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  let aborted = false
  res.on('close', () => { aborted = true })

  send('meta', { conversationId: conversation.id, title: conversation.title })

  const chunks = answer.match(/\S+\s*/g) ?? [answer]
  for (const chunk of chunks) {
    if (aborted) break
    send('delta', { text: chunk })
    await sleep(18)
  }

  // Persist the full reply even if the operator hit Stop, so history stays coherent.
  addMessage(conversation.id, 'assistant', answer)
  if (!aborted) {
    send('done', { stopReason: 'end_turn' })
    res.end()
  }
})

/* --------------------------------------------------------- AI endpoints */

app.post('/api/briefing', (_req: Request, res: Response) => {
  res.json(buildBriefing(currentContext()))
})

app.post('/api/risk', (_req: Request, res: Response) => {
  res.json({ assessments: assessRisk(currentContext()) })
})

app.post('/api/search', (req: Request, res: Response) => {
  const query = String(req.body?.query ?? '').trim()
  if (!query) {
    return res.status(400).json({ error: 'bad_request', message: 'query is required.' })
  }
  res.json(searchShipments(query, currentContext()))
})

/* --------------------------------------------------- production static site */
// After `npm run build`, this same process serves the compiled dashboard so a
// single `npm start` runs both the UI and the API.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('/{*splat}', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`[haul.io] API listening on http://localhost:${PORT}`)
  console.log(`[haul.io] SQLite database: ${DB_PATH}`)
  console.log(`[haul.io] AI engine: ${ENGINE} (no API key required)`)
  console.log('[haul.io] Demo login: demo@haul.io / demo1234')
})
