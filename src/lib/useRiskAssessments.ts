import { useEffect, useState } from 'react'
import { fetchRisk } from './ai'
import type { RiskAssessment } from './ai'
import type { NetworkContext } from '../data/network'

/**
 * Scores every shipment for delay risk once, keyed by tracking ID. Failures are
 * swallowed on purpose: risk badges are an enhancement, so the table must keep
 * working when the AI service is offline or unconfigured.
 */
export function useRiskAssessments(context: NetworkContext) {
  const [byId, setById] = useState<Record<string, RiskAssessment>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchRisk(context)
      .then((result) => {
        if (cancelled) return
        setById(Object.fromEntries(result.assessments.map((assessment) => [assessment.id, assessment])))
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [context])

  return { byId, loading }
}
