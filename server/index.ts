import 'dotenv/config'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT ?? 8787)
const MODEL = 'claude-opus-5'

const app = express()
app.use(express.json({ limit: '1mb' }))

const apiKey = process.env.ANTHROPIC_API_KEY
const client = apiKey ? new Anthropic({ apiKey }) : null

/** Shapes the client-supplied snapshot into the compact block Claude reasons over. */
function renderContext(context: unknown): string {
  return JSON.stringify(context ?? {}, null, 2)
}

const OPERATIONS_BRIEF = `You are the operations copilot for haul.io, a freight and fleet
management platform used by Atlas Haulage. You help fleet managers understand what is
happening across their network right now.

Ground every answer in the network snapshot you are given. Refer to shipments by their
tracking ID, name the customer and the route, and quote the real figures from the snapshot.
If the snapshot does not contain what was asked for, say so plainly rather than inventing
shipments, vehicles or numbers. Be concise and practical: an operator is reading this
between calls, not a report.`

/**
 * Returns the Anthropic client. When no key is configured it sends a JSON error the
 * front end renders as a graceful "not configured" state and returns null so the
 * calling handler can bail out.
 */
function requireClient(res: Response): Anthropic | null {
  if (!client) {
    res.status(503).json({
      error: 'not_configured',
      message: 'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.',
    })
  }
  return client
}

/** Turns an SDK error into a sentence safe to show an operator. */
function describeError(error: unknown, fallback: string): string {
  if (error instanceof Anthropic.AuthenticationError) return 'The Anthropic API key was rejected.'
  if (error instanceof Anthropic.RateLimitError) return 'Rate limited. Try again shortly.'
  if (error instanceof Anthropic.APIError) return error.message
  return fallback
}

function handleError(res: Response, error: unknown) {
  if (error instanceof Anthropic.AuthenticationError) {
    return res.status(401).json({ error: 'auth', message: describeError(error, '') })
  }
  if (error instanceof Anthropic.RateLimitError) {
    return res.status(429).json({ error: 'rate_limit', message: describeError(error, '') })
  }
  if (error instanceof Anthropic.APIError) {
    return res.status(error.status ?? 500).json({ error: 'api', message: error.message })
  }
  console.error(error)
  return res.status(500).json({ error: 'unknown', message: 'Something went wrong.' })
}

/** Pulls the JSON text block out of a structured-output response. */
function parseStructured<T>(response: Anthropic.Message, fallback: T): T {
  if (response.stop_reason === 'refusal') return fallback
  const text = response.content.find((block) => block.type === 'text')
  return text ? (JSON.parse(text.text) as T) : fallback
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, configured: Boolean(client), model: MODEL })
})

/* ------------------------------------------------------------------ copilot */
/** Streams the copilot reply as server-sent events so text lands token by token. */
app.post('/api/chat', async (req: Request, res: Response) => {
  const ai = requireClient(res)
  if (!ai) return
  const { messages, context } = req.body ?? {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'messages[] is required.' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const stream = ai.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [
        { type: 'text', text: OPERATIONS_BRIEF },
        {
          type: 'text',
          text: `Current network snapshot:\n${renderContext(context)}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: messages.map((message: { role: string; content: string }): Anthropic.MessageParam => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: String(message.content ?? ''),
      })),
    })

    // Drop the upstream request if the browser disconnects (navigates away or hits Stop).
    // The response 'close' event fires on client disconnect; the request's fires as soon
    // as the body is consumed, which would cancel every call immediately.
    res.on('close', () => stream.abort())

    stream.on('text', (chunk) => send('delta', { text: chunk }))

    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') {
      send('error', { message: 'That request was declined.' })
    }
    send('done', { stopReason: final.stop_reason })
    res.end()
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) {
      res.end()
      return
    }
    console.error(error)
    send('error', { message: describeError(error, 'The copilot is unavailable.') })
    res.end()
  }
})

/* ----------------------------------------------------------------- briefing */
const BRIEFING_SCHEMA = {
  type: 'object' as const,
  properties: {
    headline: { type: 'string', description: 'One sentence summing up the state of the network.' },
    summary: { type: 'string', description: 'Two or three sentences of context for the fleet manager.' },
    highlights: {
      type: 'array',
      description: 'Three to five things that matter today.',
      items: {
        type: 'object',
        properties: {
          tone: { type: 'string', enum: ['positive', 'warning', 'critical', 'neutral'] },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['tone', 'title', 'detail'],
        additionalProperties: false,
      },
    },
    actions: {
      type: 'array',
      description: 'Two to four concrete next steps, each naming a shipment or vehicle.',
      items: { type: 'string' },
    },
  },
  required: ['headline', 'summary', 'highlights', 'actions'],
  additionalProperties: false,
}

app.post('/api/briefing', async (req: Request, res: Response) => {
  const ai = requireClient(res)
  if (!ai) return
  try {
    const response = await ai.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: BRIEFING_SCHEMA },
      },
      system: OPERATIONS_BRIEF,
      messages: [
        {
          role: 'user',
          content: `Write this morning's operations briefing for the fleet manager from the snapshot below.\n\n${renderContext(req.body?.context)}`,
        },
      ],
    })

    res.json(parseStructured(response, {}))
  } catch (error) {
    handleError(res, error)
  }
})

/* --------------------------------------------------------------- risk score */
const RISK_SCHEMA = {
  type: 'object' as const,
  properties: {
    assessments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The shipment tracking ID from the snapshot.' },
          level: { type: 'string', enum: ['low', 'medium', 'high'] },
          score: { type: 'number', description: 'Delay risk from 0 (none) to 100 (certain).' },
          reason: { type: 'string', description: 'One short clause explaining the score.' },
        },
        required: ['id', 'level', 'score', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['assessments'],
  additionalProperties: false,
}

app.post('/api/risk', async (req: Request, res: Response) => {
  const ai = requireClient(res)
  if (!ai) return
  try {
    const response = await ai.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: RISK_SCHEMA },
      },
      system: OPERATIONS_BRIEF,
      messages: [
        {
          role: 'user',
          content: `Score the delay risk of every shipment in this snapshot. Weigh progress against the promised ETA, hub dwell time, and anything in the activity feed. Return one assessment per shipment, including delivered ones (which should score low).\n\n${renderContext(req.body?.context)}`,
        },
      ],
    })

    res.json(parseStructured(response, { assessments: [] }))
  } catch (error) {
    handleError(res, error)
  }
})

/* ------------------------------------------------------------ smart search */
const SEARCH_SCHEMA = {
  type: 'object' as const,
  properties: {
    status: { type: 'string', enum: ['All', 'In transit', 'At hub', 'Delivered'] },
    matchingIds: {
      type: 'array',
      description: 'Tracking IDs from the snapshot that satisfy the query.',
      items: { type: 'string' },
    },
    interpretation: { type: 'string', description: 'One short sentence describing how the query was read.' },
  },
  required: ['status', 'matchingIds', 'interpretation'],
  additionalProperties: false,
}

app.post('/api/search', async (req: Request, res: Response) => {
  const ai = requireClient(res)
  if (!ai) return
  const query = String(req.body?.query ?? '').trim()
  if (!query) {
    return res.status(400).json({ error: 'bad_request', message: 'query is required.' })
  }
  try {
    const response = await ai.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SEARCH_SCHEMA },
      },
      system: OPERATIONS_BRIEF,
      messages: [
        {
          role: 'user',
          content: `Translate this operator search into a filter over the snapshot. Return the status tab to select and the tracking IDs that match. If the query names no status, return "All".\n\nQuery: ${query}\n\n${renderContext(req.body?.context)}`,
        },
      ],
    })

    res.json(parseStructured(response, { status: 'All', matchingIds: [], interpretation: '' }))
  } catch (error) {
    handleError(res, error)
  }
})

/* --------------------------------------------------- production static site */
// After `npm run build`, this same process serves the compiled dashboard so a
// single `npm start` runs both the UI and the AI endpoints.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('/{*splat}', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`[haul.io] AI service listening on http://localhost:${PORT}`)
  if (!client) {
    console.warn('[haul.io] ANTHROPIC_API_KEY is not set, so AI endpoints will return 503.')
  }
})
