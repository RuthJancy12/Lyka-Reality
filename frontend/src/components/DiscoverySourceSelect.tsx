import { Globe } from 'lucide-react'
import { DISCOVERY_SOURCES } from '../utils/leadSource'

interface DiscoverySourceSelectProps {
  /** Unique id for the label/select pair. */
  id: string
  /** Controlled value: '' (unanswered) or one of DISCOVERY_SOURCES. */
  value: string
  onChange: (value: string) => void
  /** 'chat' matches the City/Community field in the chatbot auth panel
   * (.lyka-chat-field); 'form' matches the public-form inputs
   * (PropertyModal / ContactConsultation / Account profile editor). */
  variant?: 'chat' | 'form'
  required?: boolean
  label?: string
  labelStyle?: React.CSSProperties
  selectStyle?: React.CSSProperties
}

const FORM_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-main)',
  marginBottom: '5px',
}

/** Same box as the neighbouring text inputs so the row keeps its
 * layout, spacing, and border. Native <select>: options open only when
 * the user clicks the dropdown (browser default arrow, same as the
 * existing Location/Community and Property Requirement selects). */
const FORM_SELECT: React.CSSProperties = {
  width: '100%',
  background: '#FFFFFF',
  border: '1px solid var(--champagne-border)',
  borderRadius: '4px',
  padding: '10px 12px',
  fontSize: '13px',
  color: 'var(--text-main)',
  outlineColor: 'var(--gold-primary)',
  cursor: 'pointer',
  boxSizing: 'border-box',
}

/**
 * "How did you hear about LYKA Realty?" dropdown (optional everywhere).
 * Self-reported source only — never mixed with automatic UTM/referrer
 * data. Empty string means unanswered (stays NULL server-side).
 */
export function DiscoverySourceSelect({
  id,
  value,
  onChange,
  variant = 'form',
  required = false,
  label = 'How did you hear about LYKA Realty?',
  labelStyle,
  selectStyle,
}: DiscoverySourceSelectProps) {
  if (variant === 'chat') {
    return (
      <label className="lyka-chat-field" htmlFor={id}>
        <span>{label}{required ? '' : ' (optional)'}</span>
        <div className="lyka-chat-field-input">
          <Globe size={14} />
          <select
            id={id}
            value={value}
            required={required}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            className="lyka-chat-discovery-select"
          >
            <option value="">Prefer not to say</option>
            {DISCOVERY_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </label>
    )
  }
  return (
    <div>
      <label htmlFor={id} style={{ ...FORM_LABEL, ...labelStyle }}>
        {label}{required ? ' *' : ''}
      </label>
      <select
        id={id}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...FORM_SELECT, ...selectStyle }}
      >
        <option value="">Select an option (optional)</option>
        {DISCOVERY_SOURCES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  )
}
