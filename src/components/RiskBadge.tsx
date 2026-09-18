import type { RiskAssessment } from '../lib/ai'

/**
 * Renders the AI delay-risk verdict for one shipment. Returns nothing until the
 * scoring call comes back, so rows stay unchanged when the service is offline.
 */
export default function RiskBadge({ assessment }: { assessment?: RiskAssessment }) {
  if (!assessment) return null
  return <span className={`risk-badge risk-${assessment.level}`} title={assessment.reason}>
    <i />{assessment.level === 'low' ? 'Low risk' : assessment.level === 'medium' ? 'Watch' : 'At risk'}
    <em>{Math.round(assessment.score)}</em>
  </span>
}
