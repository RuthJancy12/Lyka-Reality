import { useState } from 'react'
import {
  RotateCcw, Play,
  Calendar, Compass, Image
} from 'lucide-react'
import type { Property } from '../types/property'

interface VirtualPropertyTourProps {
  property: Property
  onRequestViewing: () => void
}

type TourTab = '360' | 'video' | 'rooms'

export function VirtualPropertyTour({ property, onRequestViewing }: VirtualPropertyTourProps) {
  const [activeTab, setActiveTab] = useState<TourTab>('360')
  const [activeRoom, setActiveRoom] = useState<number>(0)
  const [panDegrees, setPanDegrees] = useState(0)

  // Curated room-by-room media categories using genuine luxury photography
  const roomViews = [
    {
      name: 'Main Living Salon',
      desc: 'Double-height ceilings with floor-to-ceiling glass and panoramic skyline vistas.',
      img: property.image_url,
    },
    {
      name: 'Master Suite Retreat',
      desc: 'En-suite dressing lounge with custom Italian cabinetry and luxury finishes.',
      img: property.image_gallery?.[1] || property.image_url,
    },
    {
      name: 'Gourmet Chef Kitchen',
      desc: 'Integrated German appliances, marble island bar, and hidden pantry.',
      img: property.image_gallery?.[2] || property.image_url,
    },
    {
      name: 'Skyline Terrace',
      desc: 'Expansive private outdoor terrace with direct horizon sunset views.',
      img: property.image_gallery?.[3] || property.image_url,
    },
  ]

  const handlePan = (direction: 'left' | 'right') => {
    setPanDegrees((prev) => (direction === 'left' ? prev - 45 : prev + 45))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Tour Mode Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          borderBottom: '1px solid var(--theme-border, #E8DCC8)',
          paddingBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('360')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: activeTab === '360' ? '1px solid var(--theme-primary, #3B2348)' : '1px solid var(--theme-border, #E8DCC8)',
              background: activeTab === '360' ? 'var(--theme-primary, #3B2348)' : 'var(--theme-surface, #FFFFFF)',
              color: activeTab === '360' ? '#FFFFFF' : 'var(--theme-text, #26232B)',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={14} color={activeTab === '360' ? 'var(--theme-accent, #C6A15B)' : undefined} />
            360° Virtual Tour
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('video')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: activeTab === 'video' ? '1px solid var(--theme-primary, #3B2348)' : '1px solid var(--theme-border, #E8DCC8)',
              background: activeTab === 'video' ? 'var(--theme-primary, #3B2348)' : 'var(--theme-surface, #FFFFFF)',
              color: activeTab === 'video' ? '#FFFFFF' : 'var(--theme-text, #26232B)',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Play size={14} color={activeTab === 'video' ? 'var(--theme-accent, #C6A15B)' : undefined} />
            Video Walkthrough
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rooms')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: activeTab === 'rooms' ? '1px solid var(--theme-primary, #3B2348)' : '1px solid var(--theme-border, #E8DCC8)',
              background: activeTab === 'rooms' ? 'var(--theme-primary, #3B2348)' : 'var(--theme-surface, #FFFFFF)',
              color: activeTab === 'rooms' ? '#FFFFFF' : 'var(--theme-text, #26232B)',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Image size={14} color={activeTab === 'rooms' ? 'var(--theme-accent, #C6A15B)' : undefined} />
            Room-by-Room Tour
          </button>
        </div>

        {/* Action Button: Book in-person viewing */}
        <button
          type="button"
          onClick={onRequestViewing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
            color: '#FFFFFF',
            border: 'none',
            fontSize: '12.5px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(59, 35, 72, 0.25)',
          }}
        >
          <Calendar size={14} color="var(--theme-accent, #C6A15B)" /> Request In-Person Private Tour
        </button>
      </div>

      {/* 360 Virtual Tour Simulator Tab */}
      {activeTab === '360' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              position: 'relative',
              height: '380px',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#0F0914',
              border: '1px solid var(--theme-border, #E8DCC8)',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6)',
            }}
          >
            <img
              src={roomViews[activeRoom].img}
              alt="360 Panoramic View"
              style={{
                width: '120%',
                height: '100%',
                objectFit: 'cover',
                transform: `translateX(${panDegrees}px) scale(1.05)`,
                transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
                filter: 'brightness(0.95)',
              }}
            />

            {/* Overlay Compass Badge */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                padding: '6px 12px',
                borderRadius: '20px',
                background: 'rgba(38, 35, 43, 0.75)',
                backdropFilter: 'blur(4px)',
                color: '#FAF7F0',
                fontSize: '11.5px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <Compass size={14} color="var(--theme-accent, #C6A15B)" /> 360° Sphere Viewer • {roomViews[activeRoom].name}
            </div>

            {/* Interactive Pan Controls */}
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '8px',
                background: 'rgba(38, 35, 43, 0.8)',
                backdropFilter: 'blur(6px)',
                padding: '6px 14px',
                borderRadius: '30px',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              <button
                type="button"
                onClick={() => handlePan('left')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                ⟵ Rotate Left
              </button>
              <div style={{ width: '1px', background: 'rgba(255,255,255,0.3)', margin: '4px 0' }} />
              <button
                type="button"
                onClick={() => handlePan('right')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                Rotate Right ⟶
              </button>
            </div>
          </div>

          {/* Room Selector Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {roomViews.map((room, idx) => (
              <button
                key={room.name}
                type="button"
                onClick={() => {
                  setActiveRoom(idx)
                  setPanDegrees(0)
                }}
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: activeRoom === idx ? '2px solid var(--theme-accent, #C6A15B)' : '1px solid var(--theme-border, #E8DCC8)',
                  background: activeRoom === idx ? 'var(--theme-surface-elevated, #FAF7F0)' : 'var(--theme-surface, #FFFFFF)',
                  color: 'var(--theme-text, #26232B)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 800, color: activeRoom === idx ? 'var(--theme-accent, #C6A15B)' : 'var(--theme-muted, #746875)' }}>
                  Room {idx + 1}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {room.name}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video Walkthrough Tab */}
      {activeTab === 'video' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              position: 'relative',
              height: '380px',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#0F0914',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--theme-border, #E8DCC8)',
            }}
          >
            <img
              src={property.image_gallery?.[1] || property.image_url}
              alt="Video Preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
            />
            <div
              style={{
                position: 'absolute',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                textAlign: 'center',
                padding: '20px',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #E2C98D 0%, #C6A15B 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(198, 161, 91, 0.4)',
                }}
              >
                <Play size={26} color="#3B2348" fill="#3B2348" style={{ marginLeft: '4px' }} />
              </div>
              <div style={{ color: '#FFFFFF', fontWeight: 700, fontSize: '16px' }}>
                Ultra HD Cinema Property Walkthrough
              </div>
              <div style={{ color: '#D4C3AC', fontSize: '12px', maxWidth: '420px' }}>
                4K Architectural footage, drone aerial shoreline survey, and master bedroom suite tour.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Room-by-Room Gallery Tab */}
      {activeTab === 'rooms' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          {roomViews.map((room, idx) => (
            <div
              key={room.name}
              style={{
                background: 'var(--theme-surface, #FFFFFF)',
                border: '1px solid var(--theme-border, #E8DCC8)',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              <img
                src={room.img}
                alt={room.name}
                style={{ width: '100%', height: '170px', objectFit: 'cover' }}
              />
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--theme-accent, #C6A15B)' }}>
                  Space {idx + 1}
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--theme-primary, #3B2348)', margin: '2px 0 4px' }}>
                  {room.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--theme-muted, #746875)', lineHeight: 1.5 }}>
                  {room.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
