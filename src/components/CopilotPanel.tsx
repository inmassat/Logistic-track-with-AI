import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowUp, Sparkles, Square, X } from 'lucide-react'
import { AiError, streamChat } from '../lib/ai'
import type { ChatMessage } from '../lib/ai'
import type { NetworkContext } from '../data/network'

const SUGGESTIONS = [
  'Which shipments are at risk of missing their ETA?',
  'Summarize what happened in the last two hours.',
  'What should I deal with first this morning?',
  'How is the Rotterdam corridor performing?',
]

export default function CopilotPanel({ open, onClose, context }: { open: boolean; onClose: () => void; context: NetworkContext }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Drop any in-flight request if the panel closes or the view unmounts.
  useEffect(() => () => abortRef.current?.abort(), [])

  const ask = async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || streaming) return

    const history: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setError('')
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat(history, context, (text) => {
        setMessages((current) => {
          const next = [...current]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + text }
          return next
        })
      }, controller.signal)
    } catch (caught) {
      setError(caught instanceof AiError ? caught.message : 'The copilot is unavailable.')
      // Remove the empty assistant bubble so the transcript stays clean.
      setMessages((current) => current.filter((message, index) => !(index === current.length - 1 && message.role === 'assistant' && !message.content)))
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void ask(input)
  }

  if (!open) return null

  return <div className="copilot-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="copilot-panel" role="dialog" aria-modal="true" aria-labelledby="copilot-title">
      <header className="copilot-header">
        <div className="copilot-title">
          <span className="copilot-mark"><Sparkles size={15} /></span>
          <div><strong id="copilot-title">Ops copilot</strong><small>Answers grounded in your live network</small></div>
        </div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close copilot"><X size={18} /></button>
      </header>

      <div className="copilot-scroll" ref={scrollRef}>
        {messages.length === 0 && <div className="copilot-empty">
          <span className="copilot-empty-mark"><Sparkles size={22} /></span>
          <strong>Ask about your network</strong>
          <p>The copilot can see every shipment, metric and activity entry on this dashboard.</p>
          <div className="copilot-suggestions">
            {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => void ask(suggestion)}>{suggestion}</button>)}
          </div>
        </div>}

        {messages.map((message, index) => <div key={index} className={`copilot-message ${message.role}`}>
          {message.role === 'assistant' && <span className="copilot-avatar"><Sparkles size={13} /></span>}
          <div className="copilot-bubble">
            {message.content || <span className="copilot-typing"><i /><i /><i /></span>}
          </div>
        </div>)}

        {error && <p className="copilot-error" role="alert">{error}</p>}
      </div>

      <form className="copilot-composer" onSubmit={submit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about shipments, delays, fleet..."
          aria-label="Ask the ops copilot"
          disabled={streaming}
        />
        {streaming
          ? <button type="button" onClick={stop} className="copilot-send" aria-label="Stop generating"><Square size={15} /></button>
          : <button type="submit" className="copilot-send" disabled={!input.trim()} aria-label="Send question"><ArrowUp size={16} /></button>}
      </form>
    </aside>
  </div>
}
