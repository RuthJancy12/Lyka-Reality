import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VoiceInputSession } from '../../services/voiceInput'

class MockSpeechRecognition {
  public continuous = false
  public interimResults = false
  public lang = 'en-US'
  public maxAlternatives = 1
  public onstart: (() => void) | null = null
  public onresult: ((event: any) => void) | null = null
  public onerror: ((event: any) => void) | null = null
  public onend: (() => void) | null = null

  public start() {
    setTimeout(() => {
      this.onstart?.()
    }, 10)
  }

  public stop() {
    setTimeout(() => {
      this.onend?.()
    }, 10)
  }

  public abort() {
    this.stop()
  }
}

describe('Voice Assistant Persistence Fix (Phase 3)', () => {
  let originalSR: any
  let originalWebkitSR: any

  beforeEach(() => {
    vi.useFakeTimers()
    if (typeof window !== 'undefined') {
      originalSR = (window as any).SpeechRecognition
      originalWebkitSR = (window as any).webkitSpeechRecognition
      ;(window as any).SpeechRecognition = MockSpeechRecognition
      ;(window as any).webkitSpeechRecognition = MockSpeechRecognition
    }
    originalSR = (globalThis as any).SpeechRecognition
    ;(globalThis as any).SpeechRecognition = MockSpeechRecognition
  })

  afterEach(() => {
    vi.useRealTimers()
    if (typeof window !== 'undefined') {
      ;(window as any).SpeechRecognition = originalSR
      ;(window as any).webkitSpeechRecognition = originalWebkitSR
    }
    ;(globalThis as any).SpeechRecognition = originalSR
  })

  it('voice mode remains ON continuously across 10 consecutive turns', () => {
    const autoSubmits: string[] = []
    let currentState = 'idle'

    const session = new VoiceInputSession({
      onStateChange: (state) => {
        currentState = state
      },
      onInterimText: () => {},
      onFinalText: () => {},
      onAutoSubmit: (text) => {
        autoSubmits.push(text)
      },
    })

    // 1. Customer clicks voice button to turn voice mode ON
    session.start()
    vi.advanceTimersByTime(20)
    expect(session.isVoiceMode()).toBe(true)
    expect(currentState).toBe('listening')

    // Simulate 10 consecutive speaking turns
    for (let turn = 1; turn <= 10; turn++) {
      const utterance = `Turn ${turn}: I am looking for a 2 bedroom apartment in Dubai Marina`

      // Customer speaks
      const mockEvent = {
        results: [
          [{ transcript: utterance }],
        ],
      }
      ;(mockEvent.results[0] as any).isFinal = true

      // Trigger recognition result
      ;(session as any).recognition.onresult(mockEvent)

      // Advance debounce timer (1200ms of pause after utterance)
      vi.advanceTimersByTime(1250)

      // Turn was automatically submitted
      expect(autoSubmits.length).toBe(turn)
      expect(autoSubmits[turn - 1]).toBe(utterance)

      // Voice mode must STILL be ON while AI is thinking/responding
      expect(session.isVoiceMode()).toBe(true)
      expect(currentState).toBe('thinking')

      // AI response completes and triggers resumeAfterAI
      session.resumeAfterAI()
      vi.advanceTimersByTime(250)

      // Microphone is back to listening for the next customer question
      expect(session.isVoiceMode()).toBe(true)
      expect(currentState).toBe('listening')
    }

    expect(autoSubmits.length).toBe(10)
    expect(session.isVoiceMode()).toBe(true)

    // 2. Temporary silence or pause does not disable voice mode
    ;(session as any).recognition.onerror({ error: 'no-speech' })
    vi.advanceTimersByTime(200)
    expect(session.isVoiceMode()).toBe(true)

    // 3. Browser onend event cycles safely without disabling voice mode
    ;(session as any).recognition.onend()
    vi.advanceTimersByTime(200)
    expect(session.isVoiceMode()).toBe(true)

    // 4. Customer explicitly clicks the voice button to turn OFF
    session.stop()
    expect(session.isVoiceMode()).toBe(false)
    expect(currentState).toBe('idle')
  })
})
