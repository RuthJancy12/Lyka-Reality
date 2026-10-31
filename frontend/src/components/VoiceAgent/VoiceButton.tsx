import React from 'react'
import { Mic, Loader2, Volume2, AlertCircle } from 'lucide-react'
import type { VoiceState } from '../../services/geminiLive'

interface VoiceButtonProps {
  state: VoiceState
  onClick: () => void
  disabled?: boolean
  volume?: number
  className?: string
  style?: React.CSSProperties
  showLabel?: boolean
}

export function VoiceButton({
  state,
  onClick,
  disabled = false,
  volume = 0,
  showLabel = true,
  style
}: VoiceButtonProps) {
  // Map exact requested text for each state
  const getButtonLabel = (s: VoiceState): string => {
    switch (s) {
      case 'IDLE':
        return 'Start Voice'
      case 'CONNECTING':
        return 'Connecting…'
      case 'LISTENING':
        return 'Listening…'
      case 'THINKING':
        return 'Thinking…'
      case 'SPEAKING':
        return 'Speaking…'
      case 'ERROR':
        return 'Voice connection failed'
      case 'ENDED':
        return 'Start Voice'
      default:
        return 'Start Voice'
    }
  }

  const getStatusColor = (s: VoiceState): string => {
    switch (s) {
      case 'LISTENING':
        return '#10B981' // Vibrant green
      case 'THINKING':
        return 'var(--gold-primary, #C5A059)' // Warm gold
      case 'SPEAKING':
        return '#C6A15B' // Luxury Gold voice wave
      case 'ERROR':
        return '#EF4444' // Error red
      case 'CONNECTING':
        return 'var(--gold-primary, #C5A059)'
      default:
        return 'var(--gold-primary, #C5A059)'
    }
  }

  const label = getButtonLabel(state)
  const isPulse = state === 'LISTENING' || state === 'SPEAKING'
  const isThinking = state === 'THINKING' || state === 'CONNECTING'

  // Dynamic scale based on volume when listening
  const pulseScale = isPulse && volume > 0.05 ? 1 + Math.min(0.2, volume * 0.25) : 1

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', ...style }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={label}
        aria-label={label}
        style={{
          width: '54px',
          height: '54px',
          borderRadius: '50%',
          background: 'var(--plum-deep, #1A0D18)',
          border: `2px solid ${getStatusColor(state)}`,
          color: getStatusColor(state),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: isPulse
            ? `0 0 0 ${4 + Math.round(volume * 12)}px rgba(197, 168, 105, 0.25), 0 10px 25px rgba(26, 13, 24, 0.45)`
            : '0 10px 25px rgba(26, 13, 24, 0.45)',
          position: 'relative',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: `scale(${pulseScale})`,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {isThinking ? (
          <Loader2 size={24} className="animate-spin" />
        ) : state === 'SPEAKING' ? (
          <Volume2 size={24} />
        ) : state === 'ERROR' ? (
          <AlertCircle size={24} />
        ) : state === 'ENDED' || state === 'IDLE' ? (
          <Mic size={24} />
        ) : (
          <Mic size={24} />
        )}

        {/* Live status badge dot */}
        <span
          style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            width: '11px',
            height: '11px',
            borderRadius: '50%',
            background: getStatusColor(state),
            border: '2px solid var(--plum-deep, #1A0D18)',
            boxShadow: isPulse ? `0 0 6px ${getStatusColor(state)}` : 'none',
          }}
        />
      </button>

      {showLabel && (
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.02em',
            color: state === 'ERROR' ? '#EF4444' : 'var(--plum-deep, #1A0D18)',
            fontFamily: 'inherit',
          }}
        >
          {label}
        </span>
      )}
    </div>
  )
}
