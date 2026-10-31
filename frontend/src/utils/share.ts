/**
 * Property sharing: browser-native share sheet where available, clipboard
 * copy-link fallback otherwise. Shared links carry ONLY the public listing
 * reference (`?property=ID`) — never profile, chat, or account data.
 */
import type { Property } from '../types/property'

export type ShareMethod = 'native' | 'clipboard' | 'unavailable'

/** Public deep link for a listing (opened by App into the detail modal). */
export function propertyShareUrl(propertyId: string, origin?: string): string {
  const base = (origin || '').replace(/\/+$/, '')
  return `${base}/?property=${encodeURIComponent(propertyId)}`
}

export function propertyShareText(property: Pick<Property, 'title' | 'location'>): string {
  return `${property.title} (${property.location}) — on LYKA Realty Dubai`
}

export interface ShareDeps {
  nativeShare?: (data: { title: string; text: string; url: string }) => Promise<void>
  copyText?: (text: string) => Promise<void>
  origin?: string
}

/**
 * Shares a listing. Returns how it was shared. Throws only when neither
 * native sharing nor clipboard copy is available.
 */
export async function shareProperty(
  property: Pick<Property, 'property_id' | 'title' | 'location'>,
  deps: ShareDeps = {}
): Promise<ShareMethod> {
  const url = propertyShareUrl(property.property_id, deps.origin)
  const text = propertyShareText(property)
  if (deps.nativeShare) {
    await deps.nativeShare({ title: property.title, text, url })
    return 'native'
  }
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    const nav = navigator as Navigator & {
      share: (data: { title: string; text: string; url: string }) => Promise<void>
    }
    await nav.share({ title: property.title, text, url })
    return 'native'
  }
  const copy = deps.copyText ?? browserClipboardCopy()
  if (copy) {
    await copy(url)
    return 'clipboard'
  }
  throw new Error('Sharing is not available in this browser.')
}

/** Clipboard writer when the browser offers one, else null. */
function browserClipboardCopy(): ((text: string) => Promise<void>) | null {
  try {
    const nav = (typeof navigator !== 'undefined' ? navigator : null) as unknown as {
      clipboard?: { writeText: (text: string) => Promise<void> };
    } | null
    if (nav?.clipboard) {
      return (text: string) => nav.clipboard!.writeText(text)
    }
    return null
  } catch {
    return null
  }
}

/** Default browser-backed deps for component call sites. */
export function browserShareDeps(origin?: string): ShareDeps {
  return { origin };
}
