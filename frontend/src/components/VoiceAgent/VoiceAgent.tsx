import { useState, useEffect, useRef } from 'react'
import { X, Sparkles, Volume2, Mic, AlertCircle, PhoneOff } from 'lucide-react'
import {
  GeminiLiveSession,
  type VoiceState,
  type TranscriptItem
} from '../../services/geminiLive'
import { VoiceButton } from './VoiceButton'

interface VoiceAgentProps {
  isOpen: boolean
  onClose: () => void
  onVoiceTranscript?: (text: string) => void
}

export function VoiceAgent({ isOpen, onClose, onVoiceTranscript }: VoiceAgentProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE')
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [volume, setVolume] = useState(0)
  const sessionRef = useRef<GeminiLiveSession | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  // Initialize session handlers
  useEffect(() => {
    const session = new GeminiLiveSession({
      onStateChange: (newState) => {
        setVoiceState(newState)
        if (newState !== 'ERROR') {
          setErrorMessage(null)
        }
      },
      onTranscript: (item) => {
        setTranscripts((prev) => [...prev, item])
        if (item.role === 'user' && onVoiceTranscript) {
          onVoiceTranscript(item.text)
        }
      },
      onError: (err) => {
        setErrorMessage(err)
      },
      onVolumeChange: (vol) => {
        setVolume(vol)
      },
    })

    sessionRef.current = session

    return () => {
      session.stop()
      sessionRef.current = null
    }
  }, [onVoiceTranscript])

  // Automatically start voice session when modal is opened if not already started
  useEffect(() => {
    if (isOpen) {
      if (sessionRef.current && (voiceState === 'IDLE' || voiceState === 'ENDED')) {
        sessionRef.current.start()
      }
    } else {
      // If modal is closed, stop voice session
      if (sessionRef.current && voiceState !== 'IDLE' && voiceState !== 'ENDED') {
        sessionRef.current.stop()
      }
    }
  }, [isOpen])

  // Scroll transcript to bottom
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [transcripts])

  const handleToggleVoice = () => {
    if (!sessionRef.current) return

    if (voiceState === 'IDLE' || voiceState === 'ENDED' || voiceState === 'ERROR') {
      setErrorMessage(null)
      sessionRef.current.start()
    } else {
      sessionRef.current.stop()
    }
  }

  const handleStopSession = () => {
    if (sessionRef.current) {
      sessionRef.current.stop()
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(26, 13, 24, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid var(--champagne-border, #E8DFD0)',
          boxShadow: '0 25px 60px rgba(26, 13, 24, 0.55)',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Header Ribbon */}
        <div
          style={{
            padding: '20px 24px',
            background: 'var(--plum-deep, #1A0D18)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--gold-border, rgba(197, 168, 105, 0.4))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(197, 168, 105, 0.2)',
                border: '1px solid var(--gold-primary, #C5A059)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={16} color="var(--gold-primary, #C5A059)" />
            </div>
            <div>
              <h2
                className="luxury-serif"
                style={{
                  fontSize: '17px',
                  fontWeight: 600,
                  margin: 0,
                  letterSpacing: '0.02em',
                }}
              >
                Lyka Live Voice Assistant
              </h2>
              <span style={{ fontSize: '11px', color: 'var(--gold-light, #E8D5B0)' }}>
                Powered by Gemini Live &bull; Real-time Conversational Voice
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#FFFFFF',
              transition: 'background 0.2s ease',
            }}
            title="Close voice session"
          >
            <X size={18} />
          </button>
        </div>

        {/* Live Interaction Body */}
        <div
          style={{
            padding: '28px 24px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'linear-gradient(180deg, #FAF8F5 0%, #FFFFFF 100%)',
            borderBottom: '1px solid var(--champagne-border, #E8DFD0)',
          }}
        >
          {/* Main Interactive Button with live state */}
          <VoiceButton
            state={voiceState}
            onClick={handleToggleVoice}
            volume={volume}
            showLabel={false}
            style={{ marginBottom: '14px' }}
          />

          <h3
            className="luxury-serif"
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--plum-deep, #1A0D18)',
              margin: '0 0 6px',
            }}
          >
            {voiceState === 'LISTENING' && 'Listening… speak naturally'}
            {voiceState === 'THINKING' && 'Thinking… processing your request'}
            {voiceState === 'SPEAKING' && 'Lyka Assistant is speaking…'}
            {voiceState === 'CONNECTING' && 'Connecting to Gemini Live…'}
            {voiceState === 'ERROR' && 'Voice connection failed'}
            {(voiceState === 'IDLE' || voiceState === 'ENDED') && 'Voice session paused'}
          </h3>

          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary, #665D65)',
              margin: 0,
              textAlign: 'center',
              maxWidth: '380px',
              lineHeight: 1.4,
            }}
          >
            {voiceState === 'LISTENING'
              ? 'Tell us your preferred location, budget, bedrooms, or amenities.'
              : voiceState === 'SPEAKING'
              ? 'You can interrupt or speak at any time.'
              : 'Tap the button to start real-time two-way voice conversation.'}
          </p>

          {/* Audio Visualizer Waves */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '24px',
              marginTop: '16px',
            }}
          >
            {[0.3, 0.6, 1.0, 0.7, 0.4, 0.8, 0.5, 0.2].map((factor, idx) => {
              const active = voiceState === 'LISTENING' || voiceState === 'SPEAKING'
              const barHeight = active
                ? Math.max(6, Math.min(24, Math.round(volume * 36 * factor) + (active ? 6 : 0)))
                : 4
              const barColor =
                voiceState === 'SPEAKING'
                  ? '#C6A15B'
                  : voiceState === 'LISTENING'
                  ? 'var(--gold-primary, #C5A059)'
                  : '#D1D5DB'

              return (
                <div
                  key={idx}
                  style={{
                    width: '3px',
                    height: `${barHeight}px`,
                    borderRadius: '2px',
                    background: barColor,
                    transition: 'height 0.1s ease',
                  }}
                />
              )
            })}
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div
              style={{
                marginTop: '16px',
                width: '100%',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#B91C1C',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                textAlign: 'left',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Live Conversation Transcript */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            maxHeight: '220px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: '#FFFFFF',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted, #9CA3AF)',
              marginBottom: '4px',
            }}
          >
            Live Conversation Transcript
          </div>

          {transcripts.length === 0 ? (
            <div
              style={{
                fontSize: '12px',
                color: '#9CA3AF',
                fontStyle: 'italic',
                textAlign: 'center',
                padding: '20px 0',
              }}
            >
              Say &ldquo;Hello&rdquo; or &ldquo;I am looking for a 2 BHK apartment in Downtown Dubai&rdquo; to begin.
            </div>
          ) : (
            transcripts.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: t.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: t.role === 'user' ? 'var(--gold-dark, #8A6E30)' : 'var(--plum-deep, #1A0D18)',
                    marginBottom: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {t.role === 'user' ? <Mic size={10} /> : <Volume2 size={10} />}
                  <span>{t.role === 'user' ? 'You' : 'Lyka Assistant'}</span>
                </div>
                <div
                  style={{
                    background:
                      t.role === 'user'
                        ? 'var(--plum-deep, #1A0D18)'
                        : 'var(--champagne-surface, #F5F1E8)',
                    color: t.role === 'user' ? '#FFFFFF' : 'var(--plum-deep, #1A0D18)',
                    padding: '8px 12px',
                    borderRadius:
                      t.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    fontSize: '13px',
                    lineHeight: 1.4,
                    maxWidth: '85%',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  {t.text}
                </div>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 20px',
            background: 'var(--champagne-surface, #FAF8F5)',
            borderTop: '1px solid var(--champagne-border, #E8DFD0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background:
                  voiceState === 'LISTENING'
                    ? '#10B981'
                    : voiceState === 'SPEAKING'
                    ? '#C6A15B'
                    : voiceState === 'THINKING'
                    ? 'var(--gold-primary, #C5A059)'
                    : voiceState === 'ERROR'
                    ? '#EF4444'
                    : '#9CA3AF',
              }}
            />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--plum-deep, #1A0D18)' }}>
              {voiceState === 'IDLE' && 'Start Voice'}
              {voiceState === 'CONNECTING' && 'Connecting…'}
              {voiceState === 'LISTENING' && 'Listening…'}
              {voiceState === 'THINKING' && 'Thinking…'}
              {voiceState === 'SPEAKING' && 'Speaking…'}
              {voiceState === 'ERROR' && 'Voice connection failed'}
              {voiceState === 'ENDED' && 'Start Voice'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {(voiceState === 'LISTENING' ||
              voiceState === 'SPEAKING' ||
              voiceState === 'THINKING') && (
              <button
                type="button"
                onClick={handleStopSession}
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#DC2626',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <PhoneOff size={14} />
                <span>End Session</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'var(--plum-deep, #1A0D18)',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 16px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
