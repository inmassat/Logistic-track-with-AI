import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Loader2, MessageSquarePlus, Sparkles, Square, Trash2 } from 'lucide-react'
import { AiError, fetchConversationMessages, streamChat } from '../lib/ai'
import type { ChatMessage } from '../lib/ai'
import type { NetworkContext, User } from '../data/network'
import { timeAgo } from '../lib/format'
import { CONVERSATIONS_KEY, useConversations, useDeleteConversation } from '../lib/useNetwork'

const SUGGESTIONS = [
  'Which shipments are at risk of missing their ETA?',
  'Summarize what happened in the last two hours.',
  'What should I deal with first this morning?',
  'How is the Rotterdam corridor performing?',
  'What is happening with TRK-8479?',
  'Show me everything for Kovak Industries.',
]

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase()
}

/**
 * Full-page assistant: a list of saved conversations on the left, the active
 * thread in the middle and a composer at the bottom. Every reply is grounded
 * in the live SQLite snapshot and streamed word by word.
 */
export default function AssistantPage({ network, user }: { network: NetworkContext; user: User }) {
  const queryClient = useQueryClient()
  const conversations = useConversations()
  const removeConversation = useDeleteConversation()

  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  // Drop any in-flight request when the page unmounts.
  useEffect(() => () => abortRef.current?.abort(), [])

  const resizeComposer = () => {
    const box = textareaRef.current
    if (!box) return
    box.style.height = 'auto'
    box.style.height = `${Math.min(box.scrollHeight, 180)}px`
  }

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  const startNewChat = () => {
    stop()
    setActiveId(null)
    setMessages([])
    setError('')
    textareaRef.current?.focus()
  }

  const openConversation = async (id: number) => {
    if (id === activeId) return
    stop()
    setActiveId(id)
    setMessages([])
    setError('')
    setLoadingThread(true)
    try {
      const result = await fetchConversationMessages(id)
      setMessages(result.messages.map(({ role, content }) => ({ role, content })))
    } catch (caught) {
      setError(caught instanceof AiError ? caught.message : 'Could not load that conversation.')
    } finally {
      setLoadingThread(false)
    }
  }

  const deleteThread = (id: number) => {
    removeConversation.mutate(id, {
      onSuccess: () => { if (id === activeId) startNewChat() },
      onError: (caught) => setError(caught.message),
    })
  }

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || streaming) return

    setMessages((current) => [...current, { role: 'user', content: trimmed }, { role: 'assistant', content: '' }])
    setInput('')
    setError('')
    setStreaming(true)
    requestAnimationFrame(resizeComposer)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat(activeId, trimmed, {
        onMeta: ({ conversationId }) => {
          setActiveId(conversationId)
          void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
        },
        onDelta: (chunk) => {
          setMessages((current) => {
            const next = [...current]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + chunk }
            return next
          })
        },
      }, controller.signal)
    } catch (caught) {
      setError(caught instanceof AiError ? caught.message : 'The assistant is unavailable.')
      setMessages((current) => current.filter((message, index) => !(index === current.length - 1 && message.role === 'assistant' && !message.content)))
    } finally {
      setStreaming(false)
      abortRef.current = null
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void send(input)
  }

  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send(input)
    }
  }

  const threads = conversations.data ?? []
  const activeTitle = threads.find((thread) => thread.id === activeId)?.title

  return <div className="assistant-page">
    <aside className="assistant-sidebar">
      <div className="assistant-sidebar-head">
        <button type="button" className="assistant-new" onClick={startNewChat}><MessageSquarePlus size={16} /> New chat</button>
      </div>
      <div className="assistant-threads">
        <small className="nav-label">RECENT</small>
        {conversations.isLoading && <p className="assistant-threads-note">Loading...</p>}
        {!conversations.isLoading && threads.length === 0 && <p className="assistant-threads-note">Your conversations will be saved here.</p>}
        {threads.map((thread) => <div key={thread.id} className={thread.id === activeId ? 'assistant-thread active' : 'assistant-thread'} role="button" tabIndex={0} onClick={() => void openConversation(thread.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openConversation(thread.id) } }}>
          <span title={thread.title}>{thread.title}</span>
          <time>{timeAgo(thread.updatedAt)}</time>
          <button type="button" className="assistant-thread-delete" aria-label={`Delete conversation ${thread.title}`} onClick={(event) => { event.stopPropagation(); deleteThread(thread.id) }}><Trash2 size={13} /></button>
        </div>)}
      </div>
    </aside>

    <section className="assistant-main">
      <header className="assistant-topline">
        <div>
          <strong>{activeTitle ?? 'New conversation'}</strong>
          <small>Grounded in {network.shipments.length} shipments and {network.activity.length} activity entries from the database</small>
        </div>
        <span className="assistant-engine"><Sparkles size={12} /> Demo AI</span>
      </header>

      <div className="assistant-messages" ref={scrollRef}>
        {messages.length === 0 && !loadingThread && <div className="assistant-empty">
          <span className="assistant-empty-mark"><Sparkles size={26} /></span>
          <h2>How can I help with your network today, {user.name.split(' ')[0]}?</h2>
          <p>Ask about delays, risk, customers, corridors or a single tracking ID. Answers come from the shipments and activity stored in SQLite, so they always match what the dashboard shows.</p>
          <div className="assistant-suggestions">
            {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)}><Sparkles size={14} />{suggestion}</button>)}
          </div>
        </div>}

        {loadingThread && <div className="assistant-loading"><Loader2 size={18} className="spinning" /> Loading conversation</div>}

        <div className="assistant-thread-body">
          {messages.map((message, index) => <div key={index} className={`assistant-message ${message.role}`}>
            <span className="assistant-avatar">{message.role === 'assistant' ? <Sparkles size={14} /> : initials(user.name)}</span>
            <div className="assistant-bubble">{message.content || <span className="copilot-typing"><i /><i /><i /></span>}</div>
          </div>)}
          {error && <p className="assistant-error" role="alert">{error}</p>}
        </div>
      </div>

      <form className="assistant-composer" onSubmit={submit}>
        <div className="assistant-composer-box">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(event) => { setInput(event.target.value); resizeComposer() }}
            onKeyDown={onComposerKey}
            placeholder="Message the assistant..."
            aria-label="Message the assistant"
            disabled={streaming}
          />
          {streaming
            ? <button type="button" onClick={stop} className="assistant-send" aria-label="Stop generating"><Square size={15} /></button>
            : <button type="submit" className="assistant-send" disabled={!input.trim()} aria-label="Send message"><ArrowUp size={17} /></button>}
        </div>
        <p className="assistant-hint">Enter to send, Shift+Enter for a new line. Conversations are saved to your account.</p>
      </form>
    </section>
  </div>
}
