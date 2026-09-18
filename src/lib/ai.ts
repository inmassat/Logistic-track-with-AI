import type { ActivityEntry, Briefing, Conversation, Dispatch, Driver, NetworkContext, NewDispatch, NewDriver, NewReport, NewShipment, NewSupportRequest, Report, RiskAssessment, SearchResult, SettingsInput, Shipment, StoredMessage, SupportRequest, User, UserSettings } from '../data/network'

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
    response = await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    throw new AiError('offline', OFFLINE_MESSAGE)
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as ErrorPayload
    throw new AiError(detail?.error ?? (response.status === 401 ? 'unauthorized' : 'error'), detail?.message ?? 'The server returned an error.')
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

/* --------------------------------------------------------------- auth API */

export function login(email: string, password: string, remember: boolean) {
  return postJson<User>('/api/auth/login', { email, password, remember })
}

export function logout() {
  return request<void>('/api/auth/logout', { method: 'POST' })
}

/** Resolves to the signed-in user, or null when there is no valid session. */
export async function fetchCurrentUser(): Promise<User | null> {
  try {
    return await request<User>('/api/auth/me')
  } catch (error) {
    if (error instanceof AiError && error.code === 'unauthorized') return null
    throw error
  }
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

export function createDriver(input: NewDriver) {
  return postJson<Driver>('/api/drivers', input)
}

export function dispatchVehicle(input: NewDispatch) {
  return postJson<Dispatch>('/api/dispatches', input)
}

export function fetchSupportRequests() {
  return request<{ requests: SupportRequest[] }>('/api/support')
}

export function createSupportRequest(input: NewSupportRequest) {
  return postJson<SupportRequest>('/api/support', input)
}

export function fetchReports() {
  return request<{ reports: Report[] }>('/api/reports')
}

export function createReport(input: NewReport) {
  return postJson<{ report: Report; csv: string }>('/api/reports', input)
}

/** Where a saved report can be downloaded again (same-origin, so the session cookie applies). */
export function reportDownloadUrl(id: number) {
  return `/api/reports/${id}/download`
}

export function fetchSettings() {
  return request<UserSettings>('/api/settings')
}

export function saveSettings(input: SettingsInput) {
  return request<{ user: User; settings: UserSettings }>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
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

export function fetchConversations() {
  return request<{ conversations: Conversation[] }>('/api/conversations')
}

export function fetchConversationMessages(id: number) {
  return request<{ conversation: Conversation; messages: StoredMessage[] }>(`/api/conversations/${id}/messages`)
}

export function deleteConversation(id: number) {
  return request<void>(`/api/conversations/${id}`, { method: 'DELETE' })
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

export type ChatStreamHandlers = {
  /** Fires once, before any text, with the conversation the reply belongs to. */
  onMeta: (meta: { conversationId: number; title: string }) => void
  onDelta: (text: string) => void
}

/**
 * Sends one message and streams the assistant's reply. Pass `conversationId`
 * null to start a new conversation; the server creates it and reports its id
 * through `onMeta`. The promise resolves once the stream closes.
 */
export async function streamChat(
  conversationId: number | null,
  message: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, message }),
      signal,
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return
    throw new AiError('offline', OFFLINE_MESSAGE)
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as ErrorPayload
    throw new AiError(detail?.error ?? (response.status === 401 ? 'unauthorized' : 'error'), detail?.message ?? 'The assistant is unavailable.')
  }
  if (!response.body) throw new AiError('error', 'The assistant returned an empty response.')

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

        if (event === 'meta') handlers.onMeta(payload)
        if (event === 'delta') handlers.onDelta(payload.text)
        if (event === 'error') throw new AiError('stream', payload.message)
        if (event === 'done') return
      }
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return
    throw error
  }
}
