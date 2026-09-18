import { format } from 'date-fns'

/** "11 min ago", "1 hr ago", "2 hrs ago", "3 days ago". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** "Sep 18, 2026" for the top bar. */
export function shortDate(date: Date = new Date()): string {
  return format(date, 'MMM d, yyyy')
}

/** "FRIDAY, SEPTEMBER 18, 2026" for the page eyebrow. */
export function longDate(date: Date = new Date()): string {
  return format(date, 'EEEE, MMMM d, yyyy').toUpperCase()
}

/** Time-of-day greeting for the overview heading. */
export function greeting(date: Date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
