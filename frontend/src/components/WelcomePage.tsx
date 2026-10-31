import { Sparkles, Building2, Mic, ArrowRight } from 'lucide-react'
import './WelcomePage.css'

interface WelcomePageProps {
  /** Primary entry: dismiss welcome and open the LYKA AI chatbot. */
  onGetStarted: () => void
  /** Secondary entry: dismiss welcome and stay on the dashboard. */
  onExplore: () => void
  /** When false, starting the chat requires signing in first. */
  signedIn?: boolean
}

/**
 * First-visit welcome / home screen. Rendered by App only when the visitor
 * hasn't been welcomed yet (localStorage `lyka_welcomed`). Styled exclusively
 * with the dashboard design tokens from index.css — no new theme.
 */
export function WelcomePage({ onGetStarted, onExplore, signedIn = false }: WelcomePageProps) {
  return (
    <div className="lyka-welcome-overlay" role="dialog" aria-modal="true" aria-label="Welcome to LYKA Realty">
      <div className="lyka-welcome-card">
        <div className="lyka-welcome-logo">
          <img src="/logo.png" alt="Lyka Realty" />
        </div>

        <span className="lyka-welcome-eyebrow">Premier Dubai Real Estate Consultancy</span>

        <h1>
          Find Your Place <em>in Dubai</em>
        </h1>

        <p>
          Chat with <strong>LYKA AI</strong> to search 3,000 verified Dubai listings
          by location, budget, and lifestyle — or browse the collection yourself.
          Real prices, real communities, zero guesswork.
        </p>

        <div className="lyka-welcome-features">
          <span className="lyka-welcome-feature">
            <Sparkles size={14} /> AI property search
          </span>
          <span className="lyka-welcome-feature">
            <Building2 size={14} /> Verified listings
          </span>
          <span className="lyka-welcome-feature">
            <Mic size={14} /> Voice assistant
          </span>
        </div>

        <div className="lyka-welcome-actions">
          <button type="button" className="gold-btn" onClick={onGetStarted}>
            Get Started <ArrowRight size={16} />
          </button>
          <button type="button" className="outline-navy-btn" onClick={onExplore}>
            Explore properties
          </button>
        </div>

        <div className="lyka-welcome-note">
          {signedIn
            ? 'Signed in — your chats and picks sync across devices'
            : 'Browse freely as a guest · Sign in to sync across devices'}
        </div>
      </div>
    </div>
  )
}
