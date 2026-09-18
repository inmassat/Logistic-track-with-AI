import type { NetworkContext } from '../data/network'

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

/** Thrown with a human-readable message the UI can show inline. */
export class AiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AiError('offline', 'Cannot reach the AI service. Is `npm run dev:server` running?')
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new AiError(detail?.error ?? 'error', detail?.message ?? 'The AI service returned an error.')
  }
  return response.json() as Promise<T>
}

export function fetchBriefing(context: NetworkContext) {
  return postJson<Briefing>('/api/briefing', { context })
}

export function fetchRisk(context: NetworkContext) {
  return postJson<{ assessments: RiskAssessment[] }>('/api/risk', { context })
}

export function fetchSearch(query: string, context: NetworkContext) {
  return postJson<SearchResult>('/api/search', { query, context })
}

export async function checkHealth(): Promise<{ ok: boolean; configured: boolean }> {
  try {
    const response = await fetch('/api/health')
    if (!response.ok) return { ok: false, configured: false }
    return await response.json()
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
    throw new AiError('offline', 'Cannot reach the AI service. Is `npm run dev:server` running?')
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new AiError(detail?.error ?? 'error', detail?.message ?? 'The copilot is unavailable.')
  }
  if (!response.body) throw new AiError('error', 'The copilot returned an empty response.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

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
}
