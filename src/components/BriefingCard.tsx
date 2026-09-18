import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Info, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { AiError, fetchBriefing } from '../lib/ai'
import type { Briefing } from '../lib/ai'
import type { NetworkContext } from '../data/network'

const TONE_ICON = {
  positive: <Check size={14} />,
  warning: <TriangleAlert size={14} />,
  critical: <AlertTriangle size={14} />,
  neutral: <Info size={14} />,
}

export default function BriefingCard({ context }: { context: NetworkContext }) {
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    fetchBriefing(context)
      .then(setBriefing)
      .catch((caught) => setError(caught instanceof AiError ? caught.message : 'Could not generate the briefing.'))
      .finally(() => setLoading(false))
  }

  // Generate once on mount; refreshing is an explicit operator action. The
  // effect starts in the `loading` state, so it never sets state synchronously.
  useEffect(() => {
    let cancelled = false
    fetchBriefing(context)
      .then((result) => { if (!cancelled) setBriefing(result) })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof AiError ? caught.message : 'Could not generate the briefing.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [context])

  return <article className="panel briefing-panel">
    <div className="briefing-head">
      <div className="briefing-title">
        <span className="briefing-mark"><Sparkles size={15} /></span>
        <div>
          <p className="section-kicker">AI DAILY BRIEFING</p>
          <h2>{loading ? 'Reading your network...' : briefing?.headline ?? 'Briefing unavailable'}</h2>
        </div>
      </div>
      <button className="briefing-refresh" onClick={load} disabled={loading} aria-label="Regenerate briefing">
        <RefreshCw size={15} className={loading ? 'spinning' : ''} />
      </button>
    </div>

    {loading && <div className="briefing-skeleton"><span /><span /><span /></div>}

    {!loading && error && <p className="briefing-error" role="alert">{error}</p>}

    {!loading && briefing && <>
      <p className="briefing-summary">{briefing.summary}</p>
      <div className="briefing-highlights">
        {briefing.highlights.map((highlight, index) => <div key={index} className={`briefing-highlight tone-${highlight.tone}`}>
          <span className="highlight-icon">{TONE_ICON[highlight.tone] ?? TONE_ICON.neutral}</span>
          <div><strong>{highlight.title}</strong><small>{highlight.detail}</small></div>
        </div>)}
      </div>
      {briefing.actions.length > 0 && <div className="briefing-actions">
        <small className="nav-label">SUGGESTED NEXT STEPS</small>
        <ol>{briefing.actions.map((action, index) => <li key={index}>{action}</li>)}</ol>
      </div>}
    </>}
  </article>
}
