import { describe, it, expect } from 'vitest'
import { combineVoiceText, isRepeatFinalTranscript } from '../../services/voiceInput'

/**
 * Voice dictation contract: transcripts land in the editable input only,
 * never auto-send. These helpers are the exactly-once machinery behind it.
 */
describe('combineVoiceText', () => {
  it('appends dictated words after typed text with one space', () => {
    expect(combineVoiceText('2BHK in Marina', 'under 2 million')).toBe(
      '2BHK in Marina under 2 million'
    )
  })

  it('returns the addition when the input is empty', () => {
    expect(combineVoiceText('', 'hello lyka')).toBe('hello lyka')
  })

  it('keeps existing text when the addition is empty', () => {
    expect(combineVoiceText('typed text', '   ')).toBe('typed text')
  })

  it('does not stack extra spaces on repeated interim updates', () => {
    const once = combineVoiceText('show me', 'villas')
    // A second interim event carries the FULL live transcript, not a delta;
    // combining must be idempotent for identical content, never "villas villas".
    expect(combineVoiceText('show me', 'villas')).toBe(once)
    expect(once).toBe('show me villas')
  })
})

describe('isRepeatFinalTranscript', () => {
  it('ignores the same final result re-fired within the window', () => {
    expect(isRepeatFinalTranscript('rent a villa', 'rent a villa', 1000, 1500)).toBe(true)
  })

  it('accepts the same words dictated again after the window', () => {
    expect(isRepeatFinalTranscript('rent a villa', 'rent a villa', 1000, 5000)).toBe(false)
  })

  it('accepts genuinely new utterances immediately', () => {
    expect(isRepeatFinalTranscript('near the metro', 'rent a villa', 1000, 1100)).toBe(false)
  })
})
