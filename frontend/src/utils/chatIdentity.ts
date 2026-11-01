/**
 * Chat display-name resolution. Firebase Authentication is the ONLY source
 * of identity: signed-in users get their Firebase display name, and guests
 * (signed out) are ALWAYS null — even if a previous user left a cached
 * local profile on this device. A stale device cache must never decide who
 * the chatbot thinks it is talking to.
 *
 * Safety requirement:
 * Never display phone numbers, Firebase UIDs, employee IDs, or raw identifiers
 * as display names in greetings.
 */
export function resolveChatDisplayName(
  firebaseName: string | null | undefined
): string | null {
  const t = (firebaseName || '').trim()
  if (!t) return null

  // Guard against raw phone numbers (+971..., 050..., etc.)
  if (/^\+?[0-9\s\-()]{7,}$/.test(t) || /^[0-9]{6,}$/.test(t)) {
    return null
  }
  // Guard against Firebase UIDs or long alphanumeric hashes (typically 20+ alphanumeric chars without spaces)
  if (/^[a-zA-Z0-9_\-]{20,}$/.test(t) || /^[a-f0-9\-]{32,}$/i.test(t)) {
    return null
  }
  // Guard against Employee IDs (e.g. EMP-101, staff_202)
  if (/^(?:emp|staff|user|uid)[-_0-9]/i.test(t)) {
    return null
  }

  return t
}
