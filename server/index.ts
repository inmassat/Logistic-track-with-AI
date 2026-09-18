import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ChatMessage, NetworkContext, NewShipment } from '../src/data/network'
import { DB_PATH, addChatMessage, clearChatMessages, createShipment, getSnapshot, listActivity, listChatMessages, listShipments, markShipmentForReview } from './db'
import { ENGINE, answerQuestion, assessRisk, buildBriefing, searchShipments } from './demoAi'

const PORT = Number(process.env.PORT ?? 8787)

const app = express()
app.use(express.json({ limit: '1mb' }))

/**
 * The AI endpoints accept a `context` from the browser (the snapshot it is
 * displaying) for API compatibility, but always answer from a fresh SQLite
 * read so responses reflect what is actually stored.
 */
function currentContext(): NetworkContext {
  return getSnapshot()
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, configured: true, engine: ENGINE, database: DB_PATH })
})

/* ------------------------------------------------------------------- data */

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

/* ---------------------------------------------------------------- copilot */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Streams the copilot reply as server-sent events. The answer is computed
 * instantly by the demo engine and then released word by word so the panel
 * behaves the way a streaming model would.
 */
app.post('/api/chat', async (req: Request, res: Response) => {
  const { messages } = req.body ?? {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'messages[] is required.' })
  }

  const history: ChatMessage[] = messages.map((message: { role?: string; content?: unknown }) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: String(message.content ?? ''),
  }))
  const latest = [...history].reverse().find((message) => message.role === 'user')
  if (latest) addChatMessage('user', latest.content)

  const answer = answerQuestion(history, currentContext())

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  let aborted = false
  res.on('close', () => { aborted = true })

  const chunks = answer.match(/\S+\s*/g) ?? [answer]
  for (const chunk of chunks) {
    if (aborted) break
    send('delta', { text: chunk })
    await sleep(18)
  }

  // Persist the full reply even if the operator hit Stop, so history stays coherent.
  addChatMessage('assistant', answer)
  if (!aborted) {
    send('done', { stopReason: 'end_turn' })
    res.end()
  }
})

app.get('/api/chat/history', (_req: Request, res: Response) => {
  res.json({ messages: listChatMessages() })
})

app.delete('/api/chat/history', (_req: Request, res: Response) => {
  clearChatMessages()
  res.status(204).end()
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
})
