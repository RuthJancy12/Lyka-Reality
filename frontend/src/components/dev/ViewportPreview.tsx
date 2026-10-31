import { useState } from 'react'
import { Ruler, X, Monitor, Laptop, Tablet, Smartphone } from 'lucide-react'

interface ViewportPreset {
  label: string
  width: number
  height: number
  icon: typeof Monitor
}

/**
 * Development-only responsive preview. Renders each preset in a REAL
 * same-origin <iframe> at exact CSS-pixel dimensions, so media queries,
 * grids, and touch layouts behave exactly as on the device — nothing is
 * scaled or faked. The component returns null outside `vite dev`
 * (`import.meta.env.DEV`), and App only mounts it behind the same flag,
 * so production customers never see this control.
 */
const PRESETS: ViewportPreset[] = [
  { label: 'Desktop', width: 1280, height: 800, icon: Monitor },
  { label: 'Laptop', width: 1024, height: 700, icon: Laptop },
  { label: 'Tablet', width: 768, height: 900, icon: Tablet },
  { label: 'Mobile', width: 390, height: 844, icon: Smartphone },
]

export function ViewportPreview() {
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<ViewportPreset>(PRESETS[3])
  const [nonce, setNonce] = useState(0)
  if (!import.meta.env.DEV) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Dev responsive preview (hidden in production)"
        aria-label="Toggle responsive preview"
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          zIndex: 1250,
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: 'var(--plum-deep)',
          border: '1px solid var(--gold-border)',
          color: 'var(--gold-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(26, 13, 24, 0.4)',
        }}
      >
        {open ? <X size={18} /> : <Ruler size={18} />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Responsive preview"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1249,
            background: 'rgba(26, 13, 24, 0.82)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            padding: '20px 12px',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPreset(p)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: preset.label === p.label ? 'var(--gold-gradient)' : 'rgba(255,255,255,0.08)',
                  color: preset.label === p.label ? 'var(--plum-deep)' : '#FFFFFF',
                  border: '1px solid var(--gold-border)',
                }}
              >
                <p.icon size={14} /> {p.label} · {p.width}px
              </button>
            ))}
            <button
              type="button"
              onClick={() => setNonce((n) => n + 1)}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                background: 'transparent',
                color: 'var(--gold-hover)',
                border: '1px solid var(--gold-border)',
              }}
            >
              Reload frame
            </button>
          </div>
          <p style={{ color: 'var(--champagne-dark)', fontSize: '11.5px', margin: 0 }}>
            Dev only — real {preset.width}×{preset.height} viewport in a live frame (scroll inside to inspect). Hidden in production builds.
          </p>
          <div style={{ maxWidth: '96vw', overflow: 'auto', borderRadius: '8px' }}>
            <iframe
              key={`${preset.label}-${nonce}`}
              title={`Responsive preview (${preset.label})`}
              src="/"
              style={{
                display: 'block',
                width: `${preset.width}px`,
                height: `${Math.min(preset.height, 900)}px`,
                maxHeight: '76vh',
                background: '#FFFFFF',
                border: '1px solid var(--gold-border)',
                borderRadius: '8px',
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
