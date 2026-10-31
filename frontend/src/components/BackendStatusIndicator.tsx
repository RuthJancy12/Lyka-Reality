import { useState, useEffect, useCallback } from 'react'
import { getBackendHealth, type HealthResponse } from '../services/api'
import { RefreshCw, X } from 'lucide-react'

export function BackendStatusIndicator() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [response, setResponse] = useState<HealthResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const verifyConnection = useCallback(async () => {
    setStatus('checking')
    setErrorMessage(null)
    try {
      const data = await getBackendHealth()
      setStatus('connected')
      setResponse(data)
    } catch (err) {
      setStatus('disconnected')
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setErrorMessage(msg)
      console.warn('Backend Disconnected', err)
    }
  }, [])

  useEffect(() => {
    verifyConnection()
  }, [verifyConnection])

  if (dismissed) {
    return null
  }

  const isConnected = status === 'connected'
  const isChecking = status === 'checking'
  const isDbConnected = response?.database?.status === 'connected'
  const isOllamaOnline = response?.ollama?.status === 'online'

  let dotColor = '#EF4444'
  let statusText = 'Backend Disconnected'
  if (isChecking) {
    dotColor = '#EAB308'
    statusText = 'Checking Services...'
  } else if (isConnected) {
    if (isDbConnected && isOllamaOnline) {
      dotColor = '#10B981'
      statusText = 'All Systems Operational'
    } else if (isDbConnected) {
      dotColor = '#10B981'
      statusText = 'Backend & DB Online'
    } else {
      dotColor = '#F59E0B'
      statusText = 'Backend Online (DB Degraded)'
    }
  }

  return (
    <aside
      aria-label="Backend Connection Status"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '24px',
        zIndex: 890,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        borderRadius: '9999px',
        background: 'rgba(26, 13, 24, 0.90)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--plum-border, #4A2844)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
        fontSize: '12px',
        fontWeight: 500,
        color: '#FFFFFF',
        pointerEvents: 'auto',
        userSelect: 'none',
        transition: 'all 0.2s ease'
      }}
      title={
        isConnected
          ? isOllamaOnline
            ? `Backend: Online • Ollama (${response?.model || 'llama3.2:3b'}): Active`
            : `Backend: Online • Ollama: Offline (${response?.ollama?.detail || 'Run ollama serve'})`
          : errorMessage || 'FastAPI backend is unreachable on port 8000'
      }
    >
      {/* Status dot */}
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          boxShadow: `0 0 8px ${dotColor}`,
          display: 'inline-block'
        }}
      />

      <span style={{ letterSpacing: '0.01em' }}>{statusText}</span>

      {/* Retry button */}
      <button
        type="button"
        onClick={verifyConnection}
        disabled={isChecking}
        title="Re-test backend connection"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--gold-primary, #C5A869)',
          cursor: isChecking ? 'default' : 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isChecking ? 0.5 : 0.85
        }}
      >
        <RefreshCw size={12} />
      </button>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        title="Hide status indicator"
        style={{
          background: 'none',
          border: 'none',
          color: '#A89CA6',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <X size={12} />
      </button>
    </aside>
  )
}
