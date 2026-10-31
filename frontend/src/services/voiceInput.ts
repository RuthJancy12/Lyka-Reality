/**
 * LYKA Realty — Persistent Continuous Voice Input Service.
 *
 * Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 * Supports continuous, multi-turn hands-free customer voice conversations:
 * - Persistent voice mode remains ON across pauses, sentences, and turns.
 * - Auto-submits completed utterances after silence debounce.
 * - Pauses recognition while AI is thinking/responding/speaking TTS.
 * - Resumes listening automatically after AI response completes.
 * - Reconnects on browser onend/no-speech without dropping voice mode.
 * - Customer explicitly turns voice mode OFF by clicking the mic button.
 */

export type VoiceInputState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'denied' | 'unsupported' | 'error'

export interface VoiceInputCallbacks {
  onStateChange: (state: VoiceInputState) => void
  /** Live interim words while speaking — shown in the input for review. */
  onInterimText: (text: string) => void
  /** Completed utterance text. */
  onFinalText: (text: string) => void
  /** Automatically submitted turn when customer finishes speaking. */
  onAutoSubmit?: (text: string) => void
  onError?: (message: string) => void
}

function getSpeechRecognitionCtor(): any | null {
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, any>
    if (w.SpeechRecognition || w.webkitSpeechRecognition) {
      return w.SpeechRecognition || w.webkitSpeechRecognition
    }
  }
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as unknown as Record<string, any>
    if (g.SpeechRecognition || g.webkitSpeechRecognition) {
      return g.SpeechRecognition || g.webkitSpeechRecognition
    }
  }
  return null
}

export function isVoiceInputSupported(): boolean {
  return getSpeechRecognitionCtor() !== null
}

/**
 * Pure helper: appends dictated words after existing text with exactly one space.
 * Tested in `src/utils/__tests__/voiceText.test.ts`.
 */
export function combineVoiceText(base: string, addition: string): string {
  const b = (base || '').trimEnd()
  const a = (addition || '').trim()
  if (!a) return base
  if (!b) return a
  return `${b} ${a}`
}

/**
 * Pure helper: ignores duplicate final transcripts within the dedupe window.
 * Tested in `src/utils/__tests__/voiceText.test.ts`.
 */
export function isRepeatFinalTranscript(
  finalText: string,
  lastFinal: string,
  lastFinalAt: number,
  now: number,
  windowMs = 1500
): boolean {
  return finalText === lastFinal && now - lastFinalAt < windowMs
}

export class VoiceInputSession {
  private callbacks: VoiceInputCallbacks
  private state: VoiceInputState = 'idle'
  private recognition: any = null
  private baseText = ''
  private lastFinal = ''
  private lastFinalAt = 0
  private currentLang = 'en-US'

  // Persistent continuous voice mode state
  private isVoiceModeActive = false
  private intentionalStop = false
  private isPausedForAI = false
  private silenceTimer: any = null
  private restartTimer: any = null
  private latestUtterance = ''
  private consecutiveEmptyRestarts = 0

  private ctorOverride: any = null

  constructor(callbacks: VoiceInputCallbacks, ctorOverride?: any) {
    this.callbacks = callbacks
    this.ctorOverride = ctorOverride || null
  }

  public setLanguage(code: string) {
    const LANG_MAP: Record<string, string> = {
      en: 'en-US',
      ar: 'ar-AE',
      hi: 'hi-IN',
      ta: 'ta-IN',
    }
    this.currentLang = LANG_MAP[code.toLowerCase()] || code || 'en-US'
    if (this.recognition) {
      try {
        this.recognition.lang = this.currentLang
      } catch {}
    }
  }

  public getState(): VoiceInputState {
    return this.state
  }

  public isListening(): boolean {
    return this.state === 'listening'
  }

  public isVoiceMode(): boolean {
    return this.isVoiceModeActive
  }

  public getLatestUtterance(): string {
    return this.latestUtterance
  }

  private setState(next: VoiceInputState) {
    if (this.state === next) return
    this.state = next
    try {
      this.callbacks.onStateChange(next)
    } catch (e) {
      console.error('[VoiceInput] onStateChange failed:', e)
    }
  }

  public setBaseText(text: string) {
    this.baseText = text || ''
  }

  private combine(base: string, addition: string): string {
    return combineVoiceText(base, addition)
  }

  /**
   * Starts persistent continuous voice mode.
   * Stays active across turns until stop() is explicitly called by the user.
   */
  public start(preferredLang?: string) {
    if (preferredLang) {
      this.setLanguage(preferredLang)
    }
    const SR = this.ctorOverride || getSpeechRecognitionCtor()
    if (!SR) {
      this.setState('unsupported')
      try {
        this.callbacks.onError?.(
          'Voice input is not supported in this browser. Please use Chrome or Edge, or continue typing.'
        )
      } catch {}
      return
    }

    this.isVoiceModeActive = true
    this.intentionalStop = false
    this.isPausedForAI = false
    this.consecutiveEmptyRestarts = 0

    this.startRecognition(SR)
  }

  private startRecognition(SR: any) {
    if (!this.isVoiceModeActive || this.intentionalStop || this.isPausedForAI) return

    try {
      if (this.recognition) {
        this.teardownRecognition()
      }

      const rec = new SR()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = this.currentLang || 'en-US'
      rec.maxAlternatives = 1

      rec.onstart = () => {
        if (!this.isVoiceModeActive || this.intentionalStop || this.isPausedForAI) return
        this.consecutiveEmptyRestarts = 0
        this.setState('listening')
      }

      rec.onresult = (event: any) => {
        if (!this.isVoiceModeActive || this.intentionalStop || this.isPausedForAI) return

        try {
          let interim = ''
          let finalChunk = ''
          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i]
            if (!res || !res[0]) continue
            const transcript = String(res[0].transcript || '').trim()
            if (!transcript) continue
            if (res.isFinal) finalChunk += ` ${transcript}`
            else interim += ` ${transcript}`
          }

          const live = (finalChunk + ' ' + interim).trim()
          if (live) {
            this.consecutiveEmptyRestarts = 0
            this.latestUtterance = live
            try {
              this.callbacks.onInterimText(this.combine(this.baseText, live))
            } catch {}
          }

          const finalText = finalChunk.trim()
          if (finalText) {
            const now = Date.now()
            if (!isRepeatFinalTranscript(finalText, this.lastFinal, this.lastFinalAt, now)) {
              this.lastFinal = finalText
              this.lastFinalAt = now
              const merged = this.combine(this.baseText, finalText)
              this.baseText = merged
              try {
                this.callbacks.onFinalText(merged)
              } catch {}
            }
          }

          // Debounce submit: after completed sentence + short pause (~1200ms), auto-submit turn
          if (this.silenceTimer) clearTimeout(this.silenceTimer)
          if (finalText && this.callbacks.onAutoSubmit) {
            const utteranceToSubmit = (this.baseText || finalText).trim()
            this.silenceTimer = setTimeout(() => {
              if (
                this.isVoiceModeActive &&
                !this.intentionalStop &&
                !this.isPausedForAI &&
                utteranceToSubmit.length > 0
              ) {
                this.submitCurrentTurn(utteranceToSubmit)
              }
            }, 1200)
          }
        } catch {
          // Ignore malformed recognition events
        }
      }

      rec.onerror = (event: any) => {
        const code = event?.error
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          this.setState('denied')
          this.isVoiceModeActive = false
          try {
            this.callbacks.onError?.(
              'Microphone permission denied. Please allow microphone access in your browser to speak.'
            )
          } catch {}
          this.stop()
        } else if (code === 'audio-capture') {
          this.setState('error')
          this.isVoiceModeActive = false
          try {
            this.callbacks.onError?.('No microphone was found. Please check your audio settings.')
          } catch {}
          this.stop()
        } else if (code === 'aborted' || code === 'no-speech') {
          // Normal pause or silence: stay in continuous voice mode, do NOT disconnect
          if (this.isVoiceModeActive && !this.intentionalStop && !this.isPausedForAI) {
            this.scheduleRestart()
          }
        } else {
          console.warn('[VoiceInput] speech recognition notice:', code)
          if (this.isVoiceModeActive && !this.intentionalStop && !this.isPausedForAI) {
            this.scheduleRestart()
          }
        }
      }

      rec.onend = () => {
        // Recognition cycle ended (browser speech timeout or speech pause)
        if (!this.isVoiceModeActive || this.intentionalStop) {
          this.setState('idle')
          return
        }

        if (this.isPausedForAI) {
          // Intentionally paused while AI responds
          return
        }

        // Auto-restart continuous listening
        this.scheduleRestart()
      }

      this.recognition = rec
      rec.start()
    } catch (e: any) {
      console.warn('[VoiceInput] start failed:', e)
      if (this.isVoiceModeActive && !this.intentionalStop) {
        this.scheduleRestart()
      }
    }
  }

  private submitCurrentTurn(text: string) {
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    this.silenceTimer = null
    this.baseText = ''

    // Pause mic capture so mic never records the AI's answer or TTS output
    this.pauseForAI()

    try {
      this.callbacks.onAutoSubmit?.(text)
    } catch (err) {
      console.error('[VoiceInput] onAutoSubmit failed:', err)
      this.resumeAfterAI()
    }
  }

  /**
   * Pauses microphone recognition while the AI model is thinking, streaming, or speaking TTS.
   * Voice mode remains ON (isVoiceModeActive = true).
   */
  public pauseForAI() {
    this.isPausedForAI = true
    this.setState('thinking')
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch {}
    }
  }

  /**
   * Automatically called after the assistant finishes speaking/responding.
   * Returns immediately to LISTENING without requiring the user to tap the mic button.
   */
  public resumeAfterAI() {
    this.isPausedForAI = false
    if (!this.isVoiceModeActive || this.intentionalStop) {
      // AI phase finished and the customer never had voice mode armed:
      // restore a clean idle state instead of staying paused/thinking.
      this.setState('idle')
      return
    }

    const SR = this.ctorOverride || getSpeechRecognitionCtor()
    if (!SR) return

    // Small delay ensures previous audio tracks are fully silent
    setTimeout(() => {
      if (this.isVoiceModeActive && !this.intentionalStop && !this.isPausedForAI) {
        this.startRecognition(SR)
      }
    }, 200)
  }

  private scheduleRestart() {
    if (this.restartTimer) clearTimeout(this.restartTimer)
    if (!this.isVoiceModeActive || this.intentionalStop || this.isPausedForAI) return

    const delay = Math.min(1000, 150 * (this.consecutiveEmptyRestarts + 1))
    this.consecutiveEmptyRestarts += 1

    this.restartTimer = setTimeout(() => {
      if (this.isVoiceModeActive && !this.intentionalStop && !this.isPausedForAI) {
        const SR = this.ctorOverride || getSpeechRecognitionCtor()
        if (SR) this.startRecognition(SR)
      }
    }, delay)
  }

  /**
   * Customer explicitly clicked the voice button to turn voice mode OFF.
   */
  public stop() {
    this.intentionalStop = true
    this.isVoiceModeActive = false
    this.isPausedForAI = false
    this.consecutiveEmptyRestarts = 0

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    this.teardownRecognition()
    this.setState('idle')
  }

  private teardownRecognition() {
    if (this.recognition) {
      try {
        this.recognition.onstart = null
        this.recognition.onresult = null
        this.recognition.onerror = null
        this.recognition.onend = null
        this.recognition.abort()
      } catch {}
      this.recognition = null
    }
  }
}
