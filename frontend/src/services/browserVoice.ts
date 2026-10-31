/**
 * Lyka Realty – Browser-Native Continuous Voice Agent Service
 *
 * 100% Free, zero-API-key two-way voice conversation powered by:
 * 1. Web Speech API (SpeechRecognition / webkitSpeechRecognition) for microphone speech-to-text
 * 2. Browser Speech Synthesis (speechSynthesis / SpeechSynthesisUtterance) for text-to-speech
 *
 * CONTINUOUS VOICE MODE: once started (explicit mic click), the session stays
 * active across many turns until the user presses Stop or the session ends:
 * LISTENING -> (utterance) -> THINKING -> SPEAKING -> LISTENING -> ...
 *
 * Key behaviors:
 * - Browser `onend` events (pauses, interruptions) restart listening instead
 *   of killing the session; only an intentional stop ends Voice Mode.
 * - Recognition is paused while LYKA speaks so the mic never hears itself;
 *   listening resumes automatically when speech synthesis ends.
 * - Each utterance is submitted EXACTLY once (finalizing guard + silence
 *   debounce on final results); partial/interim text is never submitted.
 * - No infinite restart loops: consecutive empty restarts and total session
 *   time are capped; permission denial stops immediately without retry.
 */

import type { VoiceState } from './openaiRealtime'

declare global {
  interface Window {
    SpeechRecognition?: any
    webkitSpeechRecognition?: any
    __lykaUtterance?: any
  }
}

export interface BrowserVoiceCallbacks {
  onStateChange: (state: VoiceState) => void
  onInterimTranscript?: (text: string) => void
  onFinalTranscript: (text: string) => void
  onError?: (error: string) => void
  onVolumeChange?: (volume: number) => void
}

/** Pause after a final result before the turn is submitted (ms). */
const FINAL_SILENCE_MS = 1100
/** Longest a single listening stretch runs before the turn is forced (ms). */
const MAX_TURN_MS = 30000
/** Base delay before restarting recognition after an unintentional end (ms). */
const RESTART_BASE_MS = 250
/** Max consecutive empty restarts before giving up (silence guard). */
const MAX_EMPTY_RESTARTS = 12
/** Hard cap for a whole Voice Mode session (ms). */
const MAX_SESSION_MS = 10 * 60 * 1000

export class BrowserVoiceSession {
  private callbacks: BrowserVoiceCallbacks
  private state: VoiceState = 'IDLE'
  private recognition: any = null
  private synth: SpeechSynthesis | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private animFrameId: number | null = null
  private isSessionActive = false
  private silenceTimer: any = null
  private maxTurnTimer: any = null
  private sessionTimer: any = null
  private latestTranscript: string = ''

  /** True while recognition is actually capturing audio. */
  private listening = false
  /** Set when WE paused/stopped recognition on purpose (finalize/speak/stop). */
  private expectingEnd = false
  /** Set only by explicit user stop — blocks every auto-restart path. */
  private intentionalStop = false
  /** Permission denied or no mic: never auto-restart. */
  private fatalError = false
  /** Guards exactly-once submission per utterance. */
  private finalizing = false
  /** Consecutive onend restarts with no speech (infinite-loop guard). */
  private emptyEndStreak = 0
  /** Backoff attempts for restart-after-error. */
  private restartAttempts = 0

  constructor(callbacks: BrowserVoiceCallbacks) {
    this.callbacks = callbacks
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis
    }
  }

  public getState(): VoiceState {
    return this.state
  }

  public isActive(): boolean {
    return this.isSessionActive
  }

  /** True only while the microphone is genuinely capturing right now. */
  public isListening(): boolean {
    return this.isSessionActive && this.listening
  }

  private setState(newState: VoiceState) {
    if (this.state === newState) return
    this.state = newState
    try {
      this.callbacks.onStateChange(newState)
    } catch (e) {
      console.error('[BrowserVoice] Error in onStateChange callback:', e)
    }
  }

  private fail(message: string): void {
    this.fatalError = true
    this.setState('ERROR')
    try {
      this.callbacks.onError?.(message)
    } catch {}
    this.stop()
  }

  /**
   * Enters continuous Voice Mode. Stays active across turns until stop().
   * Safe to call once; extra clicks while active are ignored (no duplicates).
   */
  public async start(): Promise<void> {
    if (this.isSessionActive) {
      return
    }

    this.isSessionActive = true
    this.intentionalStop = false
    this.fatalError = false
    this.finalizing = false
    this.expectingEnd = false
    this.listening = false
    this.emptyEndStreak = 0
    this.restartAttempts = 0
    this.latestTranscript = ''
    this.setState('CONNECTING')

    // 1. Check Web Speech API support
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRec) {
      this.fail('Speech Recognition is not supported in this browser. Please use Chrome or Edge, or continue with text chat.')
      return
    }

    // 2. Microphone stream for the volume visualizer (acquired once per session)
    try {
      if (!this.mediaStream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtx) {
          this.audioContext = new AudioCtx()
          const source = this.audioContext.createMediaStreamSource(this.mediaStream)
          this.analyser = this.audioContext.createAnalyser()
          this.analyser.fftSize = 256
          source.connect(this.analyser)
          this.startVolumeLoop()
        }
      }
    } catch (micErr: any) {
      console.warn('[BrowserVoice] Microphone stream setup warning:', micErr)
      if (micErr && (micErr.name === 'NotAllowedError' || micErr.name === 'SecurityError')) {
        this.fail('Microphone permission denied. Please allow microphone access in the browser address bar, then try again.')
        return
      }
      // Otherwise continue: SpeechRecognition may still work without the analyser.
    }

    // 3. Hard session cap (prevents runaway sessions)
    if (this.sessionTimer) clearTimeout(this.sessionTimer)
    this.sessionTimer = setTimeout(() => {
      if (this.isSessionActive) {
        try {
          this.callbacks.onError?.('Voice Mode ended after 10 minutes. Tap the microphone to start again.')
        } catch {}
        this.stop()
      }
    }, MAX_SESSION_MS)

    // 4. Build the single recognition instance and start listening
    try {
      this.buildRecognition(SpeechRec)
    } catch (e: any) {
      console.error('[BrowserVoice] Failed to create speech recognition:', e)
      this.fail(e?.message || 'Failed to start speech recognition.')
      return
    }
    this.beginListening()
  }

  /** Creates the ONE recognition instance for the session (no duplicate listeners). */
  private buildRecognition(SpeechRec: any): void {
    // Tear down any previous instance first so handlers are never doubled.
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

    const rec = new SpeechRec()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1

    rec.onstart = () => {
      if (!this.isSessionActive || this.intentionalStop) return
      this.listening = true
      this.restartAttempts = 0
      this.setState('LISTENING')
      this.armMaxTurnTimer()
    }

    rec.onresult = (event: any) => {
      if (!this.isSessionActive || this.intentionalStop || this.finalizing) return

      let fullTranscript = ''
      let sawFinal = false
      try {
        for (let i = 0; i < event.results.length; ++i) {
          const res = event.results[i]
          if (res && res[0]) {
            fullTranscript += ' ' + res[0].transcript
            if (res.isFinal) sawFinal = true
          }
        }
      } catch {
        return
      }

      const cleanText = fullTranscript.trim()
      if (!cleanText) return

      // Any speech resets the empty-restart streak.
      this.emptyEndStreak = 0
      this.latestTranscript = cleanText

      // Live interim feedback only — never submitted from here.
      try {
        this.callbacks.onInterimTranscript?.(cleanText)
      } catch {}

      // Submit ONLY after a final result + short pause (complete sentence).
      // Interim-only speech keeps listening; nothing partial is ever sent.
      if (this.silenceTimer) clearTimeout(this.silenceTimer)
      if (sawFinal) {
        this.silenceTimer = setTimeout(() => {
          if (this.isSessionActive && !this.intentionalStop && !this.finalizing && this.latestTranscript) {
            this.finalizeVoiceTurn(this.latestTranscript)
          }
        }, FINAL_SILENCE_MS)
      }
    }

    rec.onerror = (event: any) => {
      const code = event?.error
      console.warn('[BrowserVoice] Speech event:', code)
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        this.fail('Microphone permission denied. Please allow microphone access in the browser address bar, then try again.')
      } else if (code === 'audio-capture') {
        this.fail('No microphone was found. Please connect a microphone and try again.')
      } else if (code === 'network') {
        this.fail('Speech recognition lost its network connection. Please check your connection or continue with text chat.')
      } else if (code === 'aborted') {
        // Expected after our own pause/stop calls — onend below decides.
      } else if (code === 'no-speech') {
        // Silence so far — stay in Voice Mode, keep listening.
      } else {
        console.warn('[BrowserVoice] Unhandled recognition error, awaiting onend:', code)
      }
    }

    rec.onend = () => {
      this.listening = false
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer)
        this.silenceTimer = null
      }
      this.disarmMaxTurnTimer()

      // Session over, or WE ended it deliberately (finalize / speak / stop):
      // never auto-restart from here; the driving step continues the flow.
      if (!this.isSessionActive || this.intentionalStop || this.expectingEnd) {
        return
      }
      if (this.finalizing) return

      if (this.latestTranscript) {
        // Utterance ended naturally (pause/interruption) — submit the turn.
        this.finalizeVoiceTurn(this.latestTranscript)
      } else {
        // Browser cut listening with no speech — resume quietly, with a cap.
        this.emptyEndStreak += 1
        if (this.emptyEndStreak > MAX_EMPTY_RESTARTS) {
          try {
            this.callbacks.onError?.('Stopped listening after a long silence. Tap the microphone to talk again.')
          } catch {}
          this.stop()
          return
        }
        this.scheduleRestart()
      }
    }

    this.recognition = rec
  }

  /** Starts (or restarts) capture on the single session instance. */
  private beginListening(): void {
    if (!this.isSessionActive || this.intentionalStop || this.fatalError) return
    if (this.listening || !this.recognition) return
    this.expectingEnd = false
    try {
      this.recognition.start()
    } catch (e: any) {
      // Chrome throws if start races a pending end; retry once shortly.
      const msg = String(e?.message || e)
      if (/already started|invalidstate/i.test(msg) && this.restartAttempts < 3) {
        this.restartAttempts += 1
        setTimeout(() => {
          if (this.isSessionActive && !this.intentionalStop && !this.listening) {
            this.beginListening()
          }
        }, 500)
      } else {
        console.warn('[BrowserVoice] recognition.start failed:', e)
      }
    }
  }

  /** Schedules a quiet restart after an unintentional end (backoff, capped). */
  private scheduleRestart(): void {
    if (!this.isSessionActive || this.intentionalStop || this.fatalError) return
    const delay = Math.min(2000, RESTART_BASE_MS * Math.max(1, this.restartAttempts + 1))
    this.restartAttempts += 1
    setTimeout(() => {
      if (this.isSessionActive && !this.intentionalStop && !this.fatalError && !this.listening && !this.finalizing) {
        this.beginListening()
      }
    }, delay)
  }

  private armMaxTurnTimer(): void {
    this.disarmMaxTurnTimer()
    this.maxTurnTimer = setTimeout(() => {
      if (!this.isSessionActive || this.intentionalStop || this.finalizing || !this.listening) return
      if (this.latestTranscript) {
        this.finalizeVoiceTurn(this.latestTranscript)
      } else {
        // Long silent stretch: cycle listening to avoid a stuck recognizer.
        this.pauseCapture()
        this.scheduleRestart()
      }
    }, MAX_TURN_MS)
  }

  private disarmMaxTurnTimer(): void {
    if (this.maxTurnTimer) {
      clearTimeout(this.maxTurnTimer)
      this.maxTurnTimer = null
    }
  }

  /** Briefly pauses capture for finalize/speak handoffs (session stays ON). */
  private pauseCapture(): void {
    this.expectingEnd = true
    this.disarmMaxTurnTimer()
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    try {
      this.recognition?.stop()
    } catch {}
  }

  /**
   * Submits one complete utterance EXACTLY once, then waits for the AI.
   * Recognition stays paused (not dead); speak() resumes it afterwards.
   */
  private finalizeVoiceTurn(transcript: string) {
    if (this.finalizing) return
    this.finalizing = true

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    this.disarmMaxTurnTimer()

    const cleanText = (transcript || '').trim()
    this.latestTranscript = ''
    this.emptyEndStreak = 0

    // Pause capture so the mic never hears itself or double-captures.
    this.pauseCapture()
    this.setState('THINKING')

    try {
      if (cleanText) {
        this.callbacks.onFinalTranscript(cleanText)
      } else {
        // Nothing to send — go straight back to listening.
        this.finalizing = false
        this.resumeListening()
        return
      }
    } catch (e) {
      console.error('[BrowserVoice] onFinalTranscript failed:', e)
      this.finalizing = false
      this.resumeListening();
    }
  }

  /**
   * Public resume hook for the UI: returns to LISTENING when Voice Mode is
   * still active. Used when a turn completes WITHOUT speech synthesis (typed
   * messages, backend errors) so the mic is never stranded in THINKING.
   * Voice turns that speak resume automatically via speak(); calling this
   * extra is harmless (idempotent).
   */
  public resumeListening(): void {
    this.finalizing = false
    if (!this.isSessionActive || this.intentionalStop || this.fatalError) return
    this.beginListening()
  }

  /**
   * Speaks the AI reply aloud, then automatically resumes listening so the
   * user can continue hands-free. Recognition is paused first (no feedback).
   */
  public speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.synth || !text.trim() || !this.isSessionActive || this.intentionalStop) {
        resolve()
        return
      }

      const cleanSpeech = text
        .replace(/[*#_`~]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim()

      if (!cleanSpeech) {
        this.resumeListening()
        resolve()
        return
      }

      // Stop capturing BEFORE speaking: the mic must not hear LYKA's voice.
      this.pauseCapture()
      try {
        this.synth.cancel()
      } catch {}

      const utterance = new SpeechSynthesisUtterance(cleanSpeech)
      if (typeof window !== 'undefined') {
        window.__lykaUtterance = utterance
      }

      utterance.lang = 'en-US'
      utterance.rate = 1.0
      utterance.pitch = 1.0

      try {
        const voices = this.synth.getVoices()
        const preferredVoice = voices.find(
          (v) => (v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('David')))
        ) || voices.find((v) => v.lang.startsWith('en'))
        if (preferredVoice) {
          utterance.voice = preferredVoice
        }
      } catch {}

      let resolved = false
      const finish = (resume: boolean) => {
        if (!resolved) {
          resolved = true
          clearTimeout(safetyTimer)
          if (resume) {
            this.resumeListening()
          }
          resolve()
        }
      }

      const maxSpeechMs = Math.min(30000, Math.max(3000, cleanSpeech.length * 100))
      const safetyTimer = setTimeout(() => finish(true), maxSpeechMs)

      utterance.onstart = () => {
        if (this.isSessionActive && !this.intentionalStop) {
          this.setState('SPEAKING')
        }
      }

      utterance.onend = () => finish(true)
      utterance.onerror = (e) => {
        console.warn('[BrowserVoice] Speech synthesis ended/error:', e)
        finish(true)
      }

      try {
        this.synth.speak(utterance)
      } catch (speakErr) {
        console.warn('[BrowserVoice] Failed to invoke synth.speak:', speakErr)
        finish(true)
      }
    })
  }

  /**
   * Loops over AudioAnalyser to provide volume level (0.0 to 1.0) to callbacks.
   */
  private startVolumeLoop() {
    if (!this.analyser) return

    const buffer = new Uint8Array(this.analyser.frequencyBinCount)
    const update = () => {
      if (!this.isSessionActive) return

      if (this.state === 'LISTENING' && this.analyser) {
        this.analyser.getByteFrequencyData(buffer)
        let sum = 0
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i]
        }
        const avg = sum / buffer.length
        const norm = Math.min(1.0, avg / 128.0)
        this.callbacks.onVolumeChange?.(norm)
      } else if (this.state === 'SPEAKING') {
        const wave = 0.3 + 0.2 * Math.sin(Date.now() / 150)
        this.callbacks.onVolumeChange?.(wave)
      } else {
        this.callbacks.onVolumeChange?.(0)
      }

      this.animFrameId = requestAnimationFrame(update)
    }

    this.animFrameId = requestAnimationFrame(update)
  }

  /**
   * Explicit user Stop: ends Voice Mode completely. Any unsent partial
   * transcript is handed to the composer (preserved, not submitted).
   */
  public stop(): void {
    const leftover = this.latestTranscript.trim()
    this.intentionalStop = true
    this.isSessionActive = false
    this.listening = false
    this.finalizing = false
    this.expectingEnd = false

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    this.disarmMaxTurnTimer()
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer)
      this.sessionTimer = null
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

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

    if (this.synth) {
      try {
        this.synth.cancel()
      } catch {}
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((t) => t.stop())
      } catch {}
      this.mediaStream = null
    }

    if (this.audioContext) {
      try {
        this.audioContext.close()
      } catch {}
      this.audioContext = null
    }

    this.analyser = null
    this.latestTranscript = ''

    // Preserve unsent speech as editable text instead of discarding it.
    if (leftover) {
      try {
        this.callbacks.onInterimTranscript?.(leftover)
      } catch {}
    }
    try {
      this.callbacks.onVolumeChange?.(0)
    } catch {}

    // Fresh slate for the next Voice Mode entry.
    this.emptyEndStreak = 0
    this.restartAttempts = 0
    this.fatalError = false

    this.setState('IDLE')
  }
}
