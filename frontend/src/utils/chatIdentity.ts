/**
 * Chat display-name resolution. Firebase Authentication is the ONLY source
 * of identity: signed-in users get their Firebase display name, and guests
 * (signed out) are ALWAYS null — even if a previous user left a cached
 * local profile on this device. A stale device cache must never decide who
 * the chatbot thinks it is talking to.
 */
export function resolveChatDisplayName(
  firebaseName: string | null | undefined
): string | null {
  const t = (firebaseName || '').trim()
  return t ? t : null
}
