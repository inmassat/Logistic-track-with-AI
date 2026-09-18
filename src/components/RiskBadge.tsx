import type { RiskAssessment } from '../lib/ai'

/**
 * Renders the AI delay-risk verdict for one shipment. Returns nothing until the
 * scoring call comes back, so rows stay unchanged when the service is offline.
 */
export default function RiskBadge({ assessment, onClick }: { assessment?: RiskAssessment; onClick?: () => void }) {
  if (!assessment) return null
  const content = <><i />{assessment.level === 'low' ? 'Low risk' : assessment.level === 'medium' ? 'Watch' : 'At risk'}<em>{Math.round(assessment.score)}</em></>
  if (onClick) return <button type="button" className={`risk-badge risk-${assessment.level}`} aria-label={`${assessment.level === 'medium' ? 'Watch' : assessment.level} risk`} onClick={onClick}>{content}</button>
  return <span className={`risk-badge risk-${assessment.level}`} title={assessment.reason}>
    {content}
  </span>
}
