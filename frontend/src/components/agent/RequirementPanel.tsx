import { Check, Circle, Sparkles, Edit3 } from 'lucide-react'
import type { UserRequirements, TrackedFieldKey } from '../../types/agent'

interface RequirementPanelProps {
  requirements: UserRequirements
  activeField: TrackedFieldKey | null
  onEditField?: (field: TrackedFieldKey) => void
}

interface RequirementItem {
  key: TrackedFieldKey
  label: string
  getValue: (req: UserRequirements) => string | null
}

function cleanText(val: unknown): string | null {
  if (typeof val !== 'string') return null
  const t = val.trim()
  if (!t || ['null', 'none', 'undefined', 'n/a'].includes(t.toLowerCase())) return null
  return t
}

const ITEMS: RequirementItem[] = [
  {
    key: 'purpose',
    label: 'Purpose',
    getValue: (r) => (r.purpose ? (r.purpose.toLowerCase() === 'buy' || r.purpose.toLowerCase() === 'sale' ? 'Buy / Invest' : 'Rent (Annual)') : null)
  },
  {
    key: 'location',
    label: 'Location',
    getValue: (r) => cleanText(r.location)
  },
  {
    key: 'propertyType',
    label: 'Property Type',
    getValue: (r) => cleanText(r.propertyType)
  },
  {
    key: 'bhk',
    label: 'Bedrooms',
    getValue: (r) => (r.bhk !== null && r.bhk !== undefined ? (r.bhk === 0 ? 'Studio' : `${r.bhk} BHK`) : null)
  },
  {
    key: 'budget',
    label: 'Budget Ceiling',
    getValue: (r) => (r.budget ? `AED ${r.budget.toLocaleString('en-US')}` : r.budgetFlexible ? 'Flexible' : null)
  },
  {
    key: 'timeline',
    label: 'Timeline',
    getValue: (r) => cleanText(r.timeline)
  },
  {
    key: 'nearMetro',
    label: 'Metro Proximity',
    getValue: (r) => (r.nearMetro === true ? 'Walkable (< 1 km)' : null)
  },
  {
    key: 'beachfront',
    label: 'Coastline / View',
    getValue: (r) => (r.beachfront === true ? 'Beachfront & Sea View' : null)
  }
]

export function RequirementPanel({ requirements, activeField, onEditField }: RequirementPanelProps) {
  const completedCount = ITEMS.filter((item) => item.getValue(requirements) !== null).length
  const totalTracked = ITEMS.length

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: '16px',
      border: '1px solid #EDE3D5',
      boxShadow: '0 6px 20px rgba(42, 20, 38, 0.08)',
      padding: '18px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <div style={{
            width: '30px',
            height: '30px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #944D62, #B06B80)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(148, 77, 98, 0.3)',
            flexShrink: 0
          }}>
            <Sparkles size={14} color="#ffffff" />
          </div>
          <div>
            <h4 style={{
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: '#2A1426',
              margin: 0
            }}>
              Search Criteria
            </h4>
            <span style={{ fontSize: '11px', color: '#8A7B85' }}>
              Live requirement tracking
            </span>
          </div>
        </div>

        <div style={{
          background: '#F9EFF3',
          color: '#944D62',
          fontSize: '11px',
          fontWeight: 700,
          padding: '4px 9px',
          borderRadius: '999px',
          border: '1px solid #E8CFD7',
          whiteSpace: 'nowrap'
        }}>
          {completedCount} of {totalTracked}
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{
        width: '100%',
        height: '5px',
        background: '#F5EFE6',
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${(completedCount / totalTracked) * 100}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #B06B80, #C5A869)',
          transition: 'width 0.3s ease'
        }} />
      </div>

      {/* Tracked Fields List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {ITEMS.map((item) => {
          const val = item.getValue(requirements)
          const isCompleted = val !== null
          const isDiscussing = activeField === item.key

          return (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                borderRadius: '12px',
                transition: 'all 0.2s ease',
                background: isDiscussing
                  ? '#F9EFF3'
                  : isCompleted
                  ? '#FFFDF8'
                  : '#FBF8F3',
                border: isDiscussing
                  ? '1.5px solid #B06B80'
                  : isCompleted
                  ? '1px solid #EDE3D5'
                  : '1px dashed #E5DACB'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                {isCompleted ? (
                  <div style={{
                    width: '19px',
                    height: '19px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #944D62, #C5A869)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Check size={11} color="#FFFFFF" strokeWidth={3} />
                  </div>
                ) : isDiscussing ? (
                  <div style={{
                    width: '19px',
                    height: '19px',
                    borderRadius: '50%',
                    border: '2px solid #B06B80',
                    background: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#B06B80' }} />
                  </div>
                ) : (
                  <Circle size={16} color="#D4C3AC" strokeWidth={1.5} style={{ flexShrink: 0 }} />
                )}

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: '10.5px',
                    fontWeight: isDiscussing ? 800 : 700,
                    color: isDiscussing ? '#944D62' : '#8A7B85',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {item.label}
                    {isDiscussing && (
                      <span style={{
                        marginLeft: '6px',
                        fontSize: '9px',
                        background: '#F9EFF3',
                        border: '1px solid #E8CFD7',
                        color: '#944D62',
                        padding: '1px 6px',
                        borderRadius: '999px',
                        textTransform: 'uppercase'
                      }}>
                        Current
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: isCompleted ? 700 : 400,
                    color: isCompleted ? '#2A1426' : '#A79BA2',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {isCompleted ? val : 'Not specified'}
                  </div>
                </div>
              </div>

              {isCompleted && onEditField && (
                <button
                  type="button"
                  onClick={() => onEditField(item.key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#B06B80',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title={`Edit ${item.label}`}
                >
                  <Edit3 size={13} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
