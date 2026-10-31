// LYKA Realty Project Progress: honest implementation ledger.
// A procedure is "completed" ONLY when backed by inspected code or passing
// tests in this repo. Anything needing a live browser or the account holder
// stays "pending". Counts below are computed from the data — never invented.

interface ProgressItem {
  area: string
  status: 'completed' | 'pending'
  evidence: string
}

const ITEMS: ProgressItem[] = [
  {
    area: 'Public website & guest browsing',
    status: 'completed',
    evidence: 'Guest-first routing (AUTH_GATE_ENABLED=false); home renders without login; production build passes.',
  },
  {
    area: 'Chatbot conversation & eight-criteria collection',
    status: 'completed',
    evidence: 'test_eight_criteria 43/43, test_chat_clarify 64/64, test_chat_conversation 24/24.',
  },
  {
    area: 'Database-driven location suggestions',
    status: 'completed',
    evidence: 'GET /api/communities returns 20 real communities; chips/dropdowns consume it with tested fallback.',
  },
  {
    area: 'Property search & exact/nearby recommendations',
    status: 'completed',
    evidence: 'test_nearby_fallback 32/32, test_recommendation_scoring 22/22, test_refresh_clears_stale 13/13.',
  },
  {
    area: 'Chatbot performance & streaming',
    status: 'completed',
    evidence: 'test_chat_latency 10/10 (greetings ~0.1ms, gates sub-second, stream meta-first); SSE consumer tests 4/4. Live-browser streaming feel is covered by final verification below.',
  },
  {
    area: 'Speech recognition & message deduplication',
    status: 'completed',
    evidence: 'voiceText.test.ts + chatSubmit.test.ts: combine/dedupe helpers, unique message ids.',
  },
  {
    area: 'Firebase email/password & Google authentication',
    status: 'pending',
    evidence: 'Proven live: Email/Password provider ENABLED, API key valid, Admin SDK initializes, login code + error mapping correct. Still needs the account holder: confirm the account has a password credential (or set one via Account → Sign-in & security), then sign in once with email + password.',
  },
  {
    area: 'Secure role-based CRM access',
    status: 'completed',
    evidence: 'test_crm_roles_api 44/44, test_roles_suite 22/22, test_staff_create 22/22; roles resolve backend-side only.',
  },
  {
    area: 'Public enquiries & duplicate prevention',
    status: 'completed',
    evidence: 'test_public_enquiry 15/15, test_chat_enquiry_workflow 13/13 (same-property 409, different-property 201).',
  },
  {
    area: 'Admin Leads Dashboard & CRM workflows',
    status: 'pending',
    evidence: 'Luxury restyle implemented with identical data hooks; needs eyes-on browser review for spacing, alignment, and responsive grids.',
  },
  {
    area: 'Automated regression tests',
    status: 'completed',
    evidence: 'Backend suites + vitest suites + tsc + vite build all passing (see counts in evidence above).',
  },
  {
    area: 'Final end-to-end browser verification',
    status: 'pending',
    evidence: 'Requires a human pass: guest browse → chat 8 questions → enquiry → admin assignment → sign-out/switch. See manual checklist below.',
  },
]

const PILL: Record<ProgressItem['status'], React.CSSProperties> = {
  completed: { background: '#EAF3EC', color: '#2E7D4F', border: '1px solid #CBE3D2' },
  pending: { background: '#FBF3E3', color: '#8A6E30', border: '1px solid #E5D3AC' },
}

export function ProjectProgress() {
  const done = ITEMS.filter((i) => i.status === 'completed').length
  const pending = ITEMS.length - done
  return (
    <div style={{ maxWidth: '980px', margin: '0 auto' }}>
      <h1 className="luxury-serif" style={{ fontSize: '22px', color: 'var(--plum-main)', margin: '0 0 4px' }}>
        Project Progress
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 6px' }}>
        {done} of {ITEMS.length} procedures completed · {pending} pending verification. A procedure is marked
        completed only when supported by inspected code or passing tests — never by estimate.
      </p>

      <div style={{ background: '#fff', border: '1px solid var(--champagne-border)', borderRadius: '14px', boxShadow: '0 2px 10px rgba(26, 13, 24, 0.05)', overflow: 'hidden' }}>
        {ITEMS.map((item, idx) => (
          <div
            key={item.area}
            style={{
              display: 'flex', gap: '14px', alignItems: 'flex-start',
              padding: '14px 18px',
              borderBottom: idx < ITEMS.length - 1 ? '1px solid var(--champagne-border)' : 'none',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--gold-dark)', minWidth: '26px', paddingTop: '2px' }}>
              {String(idx + 1).padStart(2, '0')}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '14px', color: 'var(--plum-main)' }}>{item.area}</strong>
                <span style={{ ...PILL[item.status], fontSize: '11px', fontWeight: 800, borderRadius: '999px', padding: '2px 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {item.status}
                </span>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.55 }}>
                {item.evidence}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--champagne-border)', borderRadius: '14px', boxShadow: '0 2px 10px rgba(26, 13, 24, 0.05)', padding: '18px', marginTop: '14px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--plum-main)', margin: '0 0 10px' }}>
          Manual verification checklist (pending items above)
        </h2>
        <ol style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
          <li>Sign in with email + password as admin; on failure, note the exact message, then set a password via Account → Sign-in &amp; security and retry.</li>
          <li>Review this dashboard on desktop and mobile widths: spacing, alignment, no horizontal overflow.</li>
          <li>Guest browse → chat all 8 questions → Confirm → property cards → sign in → submit enquiry → confirm it appears in Admin Leads → assign → sign out and switch accounts.</li>
        </ol>
      </div>
    </div>
  )
}
