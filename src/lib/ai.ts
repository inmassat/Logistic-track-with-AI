import type { ActivityEntry, Briefing, ChatMessage, NetworkContext, NewShipment, RiskAssessment, SearchResult, Shipment } from '../data/network'

export type { Briefing, ChatMessage, RiskAssessment, RiskLevel, SearchResult } from '../data/network'

type ErrorPayload = { error?: string; message?: string } | null

/** Thrown with a human-readable message the UI can show inline. */
export class AiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const OFFLINE_MESSAGE = 'Cannot reach the server. Is `npm run dev` (or `npm run dev:server`) running?'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new AiError('offline', OFFLINE_MESSAGE)
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as ErrorPayload
    throw new AiError(detail?.error ?? 'error', detail?.message ?? 'The server returned an error.')
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/* --------------------------------------------------------------- data API */

export function fetchSnapshot() {
  return request<NetworkContext>('/api/snapshot')
}

export function createShipment(input: NewShipment) {
  return postJson<Shipment>('/api/shipments', input)
}

export function markShipmentForReview(id: string) {
  return postJson<ActivityEntry>(`/api/shipments/${encodeURIComponent(id)}/review`, {})
}

/* ----------------------------------------------------------------- AI API */

export function fetchBriefing(context: NetworkContext) {
  return postJson<Briefing>('/api/briefing', { context })
}

export function fetchRisk(context: NetworkContext) {
  return postJson<{ assessments: RiskAssessment[] }>('/api/risk', { context })
}

export function fetchSearch(query: string, context: NetworkContext) {
  return postJson<SearchResult>('/api/search', { query, context })
}

export function fetchChatHistory() {
  return request<{ messages: (ChatMessage & { id: number; createdAt: string })[] }>('/api/chat/history')
}

export function clearChatHistory() {
  return request<void>('/api/chat/history', { method: 'DELETE' })
}

export async function checkHealth(): Promise<{ ok: boolean; configured: boolean; engine?: string }> {
  try {
    const response = await fetch('/api/health')
    if (!response.ok) return { ok: false, configured: false }
    return (await response.json()) as { ok: boolean; configured: boolean; engine?: string }
  } catch {
    return { ok: false, configured: false }
  }
}

/**
 * Streams a copilot reply. `onDelta` fires for each chunk of text; the promise
 * resolves once the stream closes so callers can clear their pending state.
 */
export async function streamChat(
  messages: ChatMessage[],
  context: NetworkContext,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
      signal,
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return
    throw new AiError('offline', OFFLINE_MESSAGE)
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as ErrorPayload
    throw new AiError(detail?.error ?? 'error', detail?.message ?? 'The copilot is unavailable.')
  }
  if (!response.body) throw new AiError('error', 'The copilot returned an empty response.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line; keep the trailing partial frame.
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        const eventLine = frame.split('\n').find((line) => line.startsWith('event: '))
        const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
        if (!eventLine || !dataLine) continue

        const event = eventLine.slice(7).trim()
        const payload = JSON.parse(dataLine.slice(6))

        if (event === 'delta') onDelta(payload.text)
        if (event === 'error') throw new AiError('stream', payload.message)
        if (event === 'done') return
      }
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return
    throw error
  }
}
