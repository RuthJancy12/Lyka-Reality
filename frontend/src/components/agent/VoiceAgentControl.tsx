import type { AgentStatus } from '../../types/agent'

interface VoiceAgentControlProps {
  status?: AgentStatus
  onSendMessage?: (text: string) => void
  onOpenAgent: () => void
}

export function VoiceAgentControl({ status = 'ready', onOpenAgent }: VoiceAgentControlProps) {
  return (
    <>
      <style>{`
        /* ==========================================================
           LYKA AI ORB LAUNCHER BUTTON STYLING & ANIMATIONS
           ========================================================== */
        @keyframes lykaOrbAuraPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.55;
            box-shadow: 0 0 20px rgba(197, 168, 105, 0.4), 0 0 45px rgba(148, 77, 98, 0.25);
          }
          50% {
            transform: scale(1.12);
            opacity: 0.85;
            box-shadow: 0 0 32px rgba(216, 189, 128, 0.7), 0 0 60px rgba(176, 107, 128, 0.45);
          }
        }

        @keyframes lykaOrbRotateHalo {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes lykaSparkleTopFloat {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.9;
          }
          50% {
            transform: translate(1px, -3px) scale(1.15);
            opacity: 1;
            filter: drop-shadow(0 0 6px #FBF8F3);
          }
        }

        @keyframes lykaSparkleBottomFloat {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.75;
          }
          50% {
            transform: translate(-2px, 2px) scale(1.2);
            opacity: 1;
            filter: drop-shadow(0 0 5px #D8BD80);
          }
        }

        @keyframes lykaStatusDotPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.3);
            opacity: 1;
          }
        }

        .lyka-orb-container {
          position: fixed;
          bottom: 28px;
          right: 28px;
          z-index: 990;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          user-select: none;
        }

        /* Luxury Concierge Label Pill */
        .lyka-orb-badge {
          background: rgba(26, 13, 24, 0.94);
          color: #FFFFFF;
          border: 1px solid rgba(197, 168, 105, 0.4);
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.03em;
          box-shadow: 0 8px 24px rgba(26, 13, 24, 0.4);
          display: flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          backdrop-filter: blur(10px);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .lyka-orb-badge:hover {
          background: rgba(38, 18, 35, 0.98);
          border-color: rgba(216, 189, 128, 0.8);
          box-shadow: 0 10px 28px rgba(26, 13, 24, 0.55), 0 0 15px rgba(197, 168, 105, 0.3);
          transform: translateY(-2px);
        }

        .lyka-orb-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10B981;
          display: inline-block;
          box-shadow: 0 0 8px #10B981;
          animation: lykaStatusDotPulse 2s infinite ease-in-out;
        }

        /* The Main Interactive AI ORB Button */
        .lyka-orb-button {
          position: relative;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          border: none;
          background: transparent;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          outline: none;
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .lyka-orb-button:hover {
          transform: translateY(-3px) scale(1.06);
        }

        .lyka-orb-button:active {
          transform: translateY(0) scale(0.96);
        }

        /* Ambient Pulsing Aura Layer behind the orb */
        .lyka-orb-aura {
          position: absolute;
          inset: -3px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(216, 189, 128, 0.35) 0%, rgba(148, 77, 98, 0.2) 65%, transparent 100%);
          animation: lykaOrbAuraPulse 3.2s infinite ease-in-out;
          pointer-events: none;
        }

        /* Rotating Halo Gradient Ring */
        .lyka-orb-halo-ring {
          position: absolute;
          inset: -2px;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            rgba(216, 189, 128, 0.85) 0deg,
            rgba(176, 107, 128, 0.4) 90deg,
            rgba(216, 189, 128, 0.15) 180deg,
            rgba(197, 168, 105, 0.95) 270deg,
            rgba(216, 189, 128, 0.85) 360deg
          );
          animation: lykaOrbRotateHalo 9s linear infinite;
          opacity: 0.75;
          pointer-events: none;
        }

        /* Core Glass Sphere with Luxury Radial Gradient & Specular Gloss */
        .lyka-orb-core {
          position: relative;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 25%, #381A32 0%, #240F21 50%, #150813 100%);
          border: 1.5px solid rgba(216, 189, 128, 0.75);
          box-shadow:
            0 10px 25px rgba(21, 8, 19, 0.6),
            inset 0 1.5px 3px rgba(255, 255, 255, 0.35),
            inset 0 -3px 8px rgba(0, 0, 0, 0.7);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          backdrop-filter: blur(8px);
          transition: border-color 0.25s, box-shadow 0.25s;
        }

        .lyka-orb-button:hover .lyka-orb-core {
          border-color: rgba(245, 222, 160, 0.95);
          box-shadow:
            0 14px 32px rgba(21, 8, 19, 0.7),
            0 0 20px rgba(197, 168, 105, 0.5),
            inset 0 1.5px 4px rgba(255, 255, 255, 0.5),
            inset 0 -3px 8px rgba(0, 0, 0, 0.7);
        }

        /* Top Specular Curved Reflection */
        .lyka-orb-specular {
          position: absolute;
          top: 2px;
          left: 12px;
          right: 12px;
          height: 16px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 100%);
          border-radius: 50% 50% 40% 40%;
          pointer-events: none;
        }

        /* Inner Content */
        .lyka-orb-content {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        /* Minimal Architectural Roofline / Apex Glyph */
        .lyka-orb-house-glyph {
          margin-bottom: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #D8BD80;
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
          transition: transform 0.25s ease;
        }

        .lyka-orb-button:hover .lyka-orb-house-glyph {
          transform: translateY(-1px);
          color: #FAF5EA;
        }

        /* "LYKA" Brand Text */
        .lyka-orb-text-brand {
          font-family: var(--font-sans), 'Plus Jakarta Sans', sans-serif;
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.16em;
          color: #FBF8F3;
          text-transform: uppercase;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
        }

        /* "AI" Pill / Accent Text */
        .lyka-orb-text-ai {
          font-family: var(--font-sans), 'Plus Jakarta Sans', sans-serif;
          font-size: 7.5px;
          font-weight: 800;
          letter-spacing: 0.22em;
          color: #D8BD80;
          text-transform: uppercase;
          margin-top: 1.5px;
          text-shadow: 0 0 6px rgba(216, 189, 128, 0.7);
        }

        /* Satellite Sparkles */
        .lyka-sparkle-top {
          position: absolute;
          top: -4px;
          right: -2px;
          font-size: 13px;
          color: #FAF5EA;
          z-index: 4;
          animation: lykaSparkleTopFloat 2.6s infinite ease-in-out;
          pointer-events: none;
          filter: drop-shadow(0 0 5px rgba(216, 189, 128, 0.8));
        }

        .lyka-sparkle-bottom {
          position: absolute;
          bottom: -4px;
          left: -2px;
          font-size: 11px;
          color: #D8BD80;
          z-index: 4;
          animation: lykaSparkleBottomFloat 3s infinite ease-in-out;
          pointer-events: none;
          filter: drop-shadow(0 0 4px rgba(197, 168, 105, 0.6));
        }

        /* ==========================================================
           RESPONSIVE ADJUSTMENTS (Mobile Viewports)
           ========================================================== */
        @media (max-width: 640px) {
          .lyka-orb-container {
            bottom: 20px;
            right: 20px;
            gap: 6px;
          }

          .lyka-orb-badge {
            font-size: 10px;
            padding: 5px 11px;
          }

          .lyka-orb-button {
            width: 56px;
            height: 56px;
          }

          .lyka-orb-core {
            width: 52px;
            height: 52px;
          }

          .lyka-orb-text-brand {
            font-size: 8.5px;
            letter-spacing: 0.14em;
          }

          .lyka-orb-text-ai {
            font-size: 7px;
            letter-spacing: 0.18em;
          }

          .lyka-orb-house-glyph svg {
            width: 12px;
            height: 8px;
          }
        }
      `}</style>

      {/* Floating LYKA AI ORB Launcher */}
      <div className="lyka-orb-container">
        {/* Elegant Concierge Helper Tooltip */}
        <div
          className="lyka-orb-badge"
          onClick={onOpenAgent}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onOpenAgent()
            }
          }}
          title="Open LYKA AI Property Assistant"
        >
          <span
            className="lyka-orb-status-dot"
            style={{
              background:
                status === 'thinking'
                  ? 'var(--gold-primary, #C5A059)'
                  : status === 'listening'
                  ? '#C6A15B'
                  : '#10B981',
              boxShadow:
                status === 'thinking'
                  ? '0 0 8px rgba(197, 168, 105, 0.8)'
                  : status === 'listening'
                  ? '0 0 8px #C6A15B'
                  : '0 0 8px #10B981',
            }}
          />
          <span>Ask LYKA AI</span>
        </div>

        {/* The Intelligent AI ORB Button */}
        <button
          type="button"
          id="lyka-ai-orb-btn"
          className="lyka-orb-button"
          onClick={onOpenAgent}
          title="LYKA AI • Your Intelligent Dubai Real-Estate Assistant"
          aria-label="Open LYKA AI Real Estate Assistant"
        >
          {/* Top Floating Sparkle */}
          <span className="lyka-sparkle-top" aria-hidden="true">✦</span>

          {/* Ambient Glowing Aura */}
          <div className="lyka-orb-aura" aria-hidden="true" />

          {/* Rotating Celestial Halo Gradient Ring */}
          <div className="lyka-orb-halo-ring" aria-hidden="true" />

          {/* The Glass Orb Core */}
          <div className="lyka-orb-core">
            {/* Top Curved Specular Gloss */}
            <div className="lyka-orb-specular" aria-hidden="true" />

            {/* Visual Identity Inside the ORB */}
            <div className="lyka-orb-content">
              {/* Minimal Architectural Roofline / Apex Glyph */}
              <div className="lyka-orb-house-glyph" aria-hidden="true">
                <svg width="14" height="9" viewBox="0 0 14 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M1.5 7.5L7 2L12.5 7.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="7" cy="2" r="1" fill="#FFFFFF" />
                </svg>
              </div>

              {/* Brand Typography: LYKA */}
              <span className="lyka-orb-text-brand">LYKA</span>

              {/* Intelligent AI Tag */}
              <span className="lyka-orb-text-ai">AI</span>
            </div>
          </div>

          {/* Bottom Floating Sparkle */}
          <span className="lyka-sparkle-bottom" aria-hidden="true">✦</span>
        </button>
      </div>
    </>
  )
}
