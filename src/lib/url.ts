const RESTORABLE_PROTOCOLS = new Set(['http:', 'https:'])

function parseUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.trim() === '') return null

  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function isRestorableUrl(value: unknown): value is string {
  const parsed = parseUrl(value)
  return parsed !== null && RESTORABLE_PROTOCOLS.has(parsed.protocol) && parsed.hostname !== ''
}

export function getHostname(value: unknown, fallback = '未知主机'): string {
  const parsed = parseUrl(value)
  return parsed?.hostname.toLowerCase() || fallback
}
