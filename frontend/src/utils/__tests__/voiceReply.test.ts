import { describe, it, expect, vi } from 'vitest'
import {
  isVoiceReplySupported,
  toSpeakableText,
  pickFemaleEnglishVoice,
  VoiceReplySession,
  type SpeechSynthLike,
  type SpeechVoiceLike,
} from '../../services/voiceReply'

function mockSynth() {
  return {
    speak: vi.fn(),
    cancel: vi.fn(),
  }
}

describe('isVoiceReplySupported', () => {
  it('returns a boolean without throwing outside browsers', () => {
    expect(typeof isVoiceReplySupported()).toBe('boolean')
  })
})

describe('toSpeakableText (plain speech, no markup)', () => {
  it('strips markdown emphasis and headers', () => {
    expect(toSpeakableText('**Great** — a #Deal!')).toBe('Great — a Deal!')
  })

  it('drops URLs and collapses whitespace', () => {
    expect(toSpeakableText('See  https://x.test/a  now')).toBe('See now')
  })

  it('returns empty for empty input', () => {
    expect(toSpeakableText('   ')).toBe('')
  })

  it('caps very long replies so audio cannot run away', () => {
    const long = 'word '.repeat(300)
    const out = toSpeakableText(long, 100)
    expect(out.length).toBeLessThanOrEqual(101)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('pickFemaleEnglishVoice (female-sounding English AI voice)', () => {
  const voices: SpeechVoiceLike[] = [
    { name: 'Google Deutsch', lang: 'de-DE' },
    { name: 'Daniel', lang: 'en-GB' },
    { name: 'Samantha', lang: 'en-US' },
  ]

  it('prefers a female English voice', () => {
    expect(pickFemaleEnglishVoice(voices)?.name).toBe('Samantha')
  })

  it('matches voices like Google US English', () => {
    expect(
      pickFemaleEnglishVoice([{ name: 'Google US English', lang: 'en-US' }])?.name
    ).toBe('Google US English')
  })

  it('never picks a non-English voice', () => {
    expect(pickFemaleEnglishVoice([{ name: 'Samantha', lang: 'fr-FR' }])).toBeNull()
    expect(pickFemaleEnglishVoice([])).toBeNull()
  })

  it('attaches the picked voice to the spoken utterance', () => {
    const spoken: unknown[] = []
    const synth = {
      speak: vi.fn((u: unknown) => spoken.push(u)),
      cancel: vi.fn(),
    }
    const session = new VoiceReplySession(
      () => synth as SpeechSynthLike,
      () => voices
    )
    expect(session.speakOnce('agent-7', 'Hello')).toBe(true)
    expect(spoken).toHaveLength(1)
    const used = spoken[0] as { voice?: SpeechVoiceLike }
    expect(used?.voice?.name).toBe('Samantha')
  })

  it('still speaks (browser default) when no female voice exists', () => {
    const synth = { speak: vi.fn(), cancel: vi.fn() }
    const session = new VoiceReplySession(
      () => synth as SpeechSynthLike,
      () => [{ name: 'Daniel', lang: 'en-GB' }]
    )
    expect(session.speakOnce('agent-8', 'Hello')).toBe(true)
    expect(synth.speak).toHaveBeenCalledTimes(1)
  })
})

describe('VoiceReplySession (exactly-once speech, prompt stop)', () => {
  it('speaks a final reply once per message id', () => {
    const synth = mockSynth()
    const session = new VoiceReplySession(() => synth as SpeechSynthLike)
    expect(session.speakOnce('agent-1', 'Hello there')).toBe(true)
    expect(synth.speak).toHaveBeenCalledTimes(1)
    // Same bubble re-committed (re-render, finalize) must NOT re-speak.
    expect(session.speakOnce('agent-1', 'Hello there')).toBe(false)
    expect(synth.speak).toHaveBeenCalledTimes(1)
  })

  it('cancels in-progress audio before speaking the next reply', () => {
    const synth = mockSynth()
    const session = new VoiceReplySession(() => synth as SpeechSynthLike)
    session.speakOnce('agent-1', 'First')
    session.speakOnce('agent-2', 'Second')
    expect(synth.cancel).toHaveBeenCalled()
    expect(synth.speak).toHaveBeenCalledTimes(2)
  })

  it('never speaks empty text', () => {
    const synth = mockSynth()
    const session = new VoiceReplySession(() => synth as SpeechSynthLike)
    expect(session.speakOnce('agent-9', '   ')).toBe(false)
    expect(synth.speak).not.toHaveBeenCalled()
  })

  it('stops speech on demand without throwing', () => {
    const synth = mockSynth()
    const session = new VoiceReplySession(() => synth as SpeechSynthLike)
    session.speakOnce('agent-1', 'Hello')
    session.stop()
    expect(synth.cancel).toHaveBeenCalled()
  })

  it('fails closed when speech synthesis is unavailable', () => {
    const session = new VoiceReplySession(() => null)
    expect(session.speakOnce('agent-1', 'Hello')).toBe(false)
    expect(() => session.stop()).not.toThrow()
  })
})
