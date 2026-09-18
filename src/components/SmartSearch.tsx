import { useState } from 'react'
import type { FormEvent } from 'react'
import { Loader2, Search, Sparkles, X } from 'lucide-react'
import { AiError, fetchSearch } from '../lib/ai'
import type { SearchResult } from '../lib/ai'
import type { NetworkContext } from '../data/network'

const EXAMPLES = ['Anything running late to Germany', 'Shipments still sitting at a hub', 'Everything delivered today']

/**
 * Natural-language search over the shipment table. Claude returns the status tab
 * to select plus the tracking IDs that match, which the page applies as a filter.
 */
export default function SmartSearch({ context, onResult, onClear, active }: {
  context: NetworkContext
  onResult: (result: SearchResult) => void
  onClear: () => void
  active: SearchResult | null
}) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setQuery(trimmed)
    setLoading(true)
    setError('')
    try {
      onResult(await fetchSearch(trimmed, context))
    } catch (caught) {
      setError(caught instanceof AiError ? caught.message : 'Smart search is unavailable.')
    } finally {
      setLoading(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(query)
  }

  const clear = () => {
    setQuery('')
    setError('')
    onClear()
  }

  return <div className="smart-search">
    <form className="smart-search-field" onSubmit={submit}>
      <span className="smart-search-icon">{loading ? <Loader2 size={16} className="spinning" /> : <Sparkles size={16} />}</span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ask in plain English — “late deliveries heading to Germany”"
        aria-label="Search shipments in plain English"
        disabled={loading}
      />
      {(active || query) && <button type="button" className="smart-search-clear" onClick={clear} aria-label="Clear smart search"><X size={15} /></button>}
      <button type="submit" className="secondary-button" disabled={loading || !query.trim()}><Search size={15} /> Search</button>
    </form>

    {!active && !error && <div className="smart-search-examples">
      {EXAMPLES.map((example) => <button key={example} type="button" onClick={() => void run(example)}>{example}</button>)}
    </div>}

    {error && <p className="smart-search-note error" role="alert">{error}</p>}

    {active && !error && <p className="smart-search-note" role="status">
      <Sparkles size={13} /> {active.interpretation} <em>· {active.matchingIds.length} match{active.matchingIds.length === 1 ? '' : 'es'}</em>
    </p>}
  </div>
}
