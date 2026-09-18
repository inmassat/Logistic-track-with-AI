import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Password hashing and cookie helpers. Kept free of database imports so the
 * seed step in db.ts can hash the demo passwords without a circular import.
 */

export const SESSION_COOKIE = 'haulio_session'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const KEY_LENGTH = 64

/** scrypt with a random per-user salt, stored as `salt:hash` in hex. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, KEY_LENGTH)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (name) cookies[name] = decodeURIComponent(value)
  }
  return cookies
}

export function sessionCookie(token: string, maxAgeMs: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}`
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
