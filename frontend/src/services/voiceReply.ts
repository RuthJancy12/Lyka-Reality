/**
 * LYKA Realty — optional AI voice replies via the browser's built-in
 * SpeechSynthesis API. No paid APIs, no external voice services, no TTS
 * vendor: everything runs on-device in the browser.
 *
 * Contract (mirrors the dictation side):
 * - OFF by default; the user opts in with the Voice Reply toggle.
 * - Only FINAL assistant replies are spoken, exactly once each (tracked
 *   by message id — streamed token appends never retrigger speech).
 * - Enabling never replays history; only replies created while ON speak.
 * - Disabling, closing the chat, or sending a new message stops speech
 *   immediately (no overlap, no orphaned audio).
 */

export interface SpeechVoiceLike {
  name: string
  lang: string
  localService?: boolean
}

export interface SpeechSynthLike {
  speak(utterance: unknown): void
  cancel(): void
  getVoices?(): SpeechVoiceLike[]
}

/** Name fragments identifying commonly shipped female English voices. */
const FEMALE_VOICE_HINTS = [
  'samantha', 'zira', 'susan', 'female', 'woman', 'girl',
  'google us english', 'google uk english female', 'jenny', 'aria',
  'emma', 'olivia', 'ava', 'sophia', 'isabella', 'mia', 'victoria',
  'karen', 'moira', 'tessa', 'veena', 'fiona', 'kathy',
]

/**
 * Picks a female-sounding English voice from the browser's voice list.
 * Prefers exact female+English matches, then any English voice, else null
 * (caller falls back to the browser default — never invents a voice).
 * Pure and unit-testable.
 */
export function pickFemaleEnglishVoice(voices: SpeechVoiceLike[]): SpeechVoiceLike | null {
  const list = (voices || []).filter((v) => v && v.name)
  const english = list.filter((v) => (v.lang || '').toLowerCase().startsWith('en'))
  const pool = english.length > 0 ? english : []
  for (const v of pool) {
    const name = v.name.toLowerCase()
    if (FEMALE_VOICE_HINTS.some((hint) => name.includes(hint))) return v
  }
  return null
}

export function isVoiceReplySupported(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    )
  } catch {
    return false
  }
}

/**
 * Converts an assistant reply into speakable plain text: strips markdown
 * emphasis/code, collapses whitespace, and caps length so very long
 * listing dumps cannot trap the user in minutes of audio.
 */
export function toSpeakableText(text: string, maxChars = 800): string {
  let s = (text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_`#>|~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length > maxChars) {
    s = s.slice(0, maxChars).trimEnd() + '…'
  }
  return s
}

interface SpeakableUtterance {
  lang: string;
  rate?: number;
  text?: string;
  voice?: SpeechVoiceLike | null;
}

/** Builds a speech utterance, falling back to a plain object outside
 * browsers (tests, SSR) so speakOnce() stays testable anywhere. */
function makeUtterance(spoken: string, voice: SpeechVoiceLike | null): SpeakableUtterance {
  try {
    const u = new SpeechSynthesisUtterance(spoken)
    u.lang = 'en-US'
    u.rate = 1.0
    if (voice) {
      try {
        (u as unknown as { voice?: unknown }).voice = voice
      } catch {
        // Voice assignment unsupported — default voice still speaks.
      }
    }
    return u as unknown as SpeakableUtterance
  } catch {
    return { text: spoken, lang: 'en-US', rate: 1.0, voice }
  }
}

export class VoiceReplySession {
  private getSynth: () => SpeechSynthLike | null
  private getVoices: () => SpeechVoiceLike[]
  private lastSpokenId: string | null = null

  constructor(
    getSynth?: () => SpeechSynthLike | null,
    getVoices?: () => SpeechVoiceLike[],
  ) {
    this.getSynth = getSynth ?? (() => {
      try {
        return typeof window !== 'undefined' && 'speechSynthesis' in window
          ? (window.speechSynthesis as unknown as SpeechSynthLike)
          : null
      } catch {
        return null
      }
    })
    // Voice list is read lazily at speak time: browsers populate voices
    // asynchronously, so caching them at construction would often miss.
    this.getVoices = getVoices ?? (() => {
      try {
        const synth = this.getSynth() as unknown as {
          getVoices?: () => SpeechVoiceLike[]
        } | null
        const voices = synth?.getVoices?.() ?? []
        return Array.isArray(voices) ? voices : []
      } catch {
        return []
      }
    })
  }

  /**
   * Speaks `text` once for message `id`, in a female-sounding English
   * voice when the browser offers one (else the browser default).
   * Cancels any in-progress reply first; ignores empty text and repeat
   * calls for the same id. Returns true when speech started.
   */
  speakOnce(id: string, text: string, onEnd?: () => void): boolean {
    if (!id || id === this.lastSpokenId) return false
    const spoken = toSpeakableText(text)
    if (!spoken) return false
    const synth = this.getSynth()
    if (!synth) return false
    try {
      synth.cancel()
      const utt = makeUtterance(spoken, pickFemaleEnglishVoice(this.getVoices()))
      if (onEnd) {
        let fired = false
        const finish = () => {
          if (!fired) {
            fired = true
            onEnd()
          }
        }
        ;(utt as any).onend = finish
        ;(utt as any).onerror = finish
      }
      synth.speak(utt)
    } catch {
      return false
    }
    this.lastSpokenId = id
    return true
  }

  /** Stops any in-progress reply immediately. Keeps id memory so a
   *  re-enabled toggle does not replay what was just stopped. */
  stop(): void {
    try {
      this.getSynth()?.cancel()
    } catch {
      // Ignore — stopping must never throw.
    }
  }
}
