export const SUPPORT_CONFIG = {
  feedbackEmail: '',
} as const

export const SUPPORT_ISSUES_URL = 'https://github.com/volfmath/tabstash/issues/'
export const SUPPORT_COMMITS_URL = 'https://github.com/volfmath/tabstash/commits/main'

export function isValidSupportEmail(email: string): boolean {
  return /^[^\s@:/?#]+@[^\s@:/?#]+\.[^\s@:/?#]+$/.test(email)
}

export function getSupportEmailHref(email = SUPPORT_CONFIG.feedbackEmail): string | null {
  return isValidSupportEmail(email) ? `mailto:${email}` : null
}
