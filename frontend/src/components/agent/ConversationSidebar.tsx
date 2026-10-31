/**
 * WhatsApp-style conversation history rail.
 *
 * Lists the signed-in customer's own conversations (server-owned, newest
 * first) grouped by Today / Yesterday / Previous 7 days / Previous 30 days
 * / Older. Selecting a row reopens that exact session id; the rename
 * control calls the owner-scoped PATCH endpoint.
 */
import { useState } from 'react'
import { Check, Loader2, MessageSquare, Pencil, Plus, X } from 'lucide-react'
import type { CustomerChatSessionSummary } from '../../services/api'
import {
  conversationPreview,
  conversationTimeLabel,
  conversationTitle,
  groupConversationsByDate,
} from '../../utils/conversationHistory'
import './ConversationSidebar.css'

export interface ConversationSidebarProps {
  open: boolean
  sessions: CustomerChatSessionSummary[]
  activeSessionId: string | null
  loading: boolean
  error: string | null
  hasMore: boolean
  total: number
  onNewChat: () => void
  onSelect: (sessionId: string) => void
  onRename: (sessionId: string, title: string) => void
  onLoadMore: () => void
  onClose: () => void
}

interface ConversationRowProps {
  session: CustomerChatSessionSummary
  active: boolean
  onSelect: (sessionId: string) => void
  onRename: (sessionId: string, title: string) => void
}

function ConversationRow({ session, active, onSelect, onRename }: ConversationRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(conversationTitle(session))
  const label = conversationTitle(session)

  const commit = () => {
    const next = draft.trim().slice(0, 120)
    setEditing(false)
    if (next && next !== label) onRename(session.session_id, next)
    else setDraft(label)
  }

  const cancel = () => {
    setDraft(label)
    setEditing(false)
  }

  return (
    <div
      className={`lyka-history-row${active ? ' active' : ''}`}
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      onClick={() => {
        if (!editing) onSelect(session.session_id)
      }}
      onKeyDown={(event) => {
        if (editing) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(session.session_id)
        }
      }}
    >
      <div className="lyka-history-avatar" aria-hidden="true">
        <MessageSquare size={14} />
      </div>
      <div className="lyka-history-row-body">
        {editing ? (
          <div className="lyka-history-edit" onClick={(event) => event.stopPropagation()}>
            <input
              autoFocus
              value={draft}
              maxLength={120}
              aria-label="Conversation title"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit()
                if (event.key === 'Escape') cancel()
              }}
            />
            <button type="button" className="lyka-history-icon-btn" onMouseDown={(e) => e.preventDefault()} onClick={commit} title="Save title">
              <Check size={13} />
            </button>
            <button type="button" className="lyka-history-icon-btn" onMouseDown={(e) => e.preventDefault()} onClick={cancel} title="Cancel rename">
              <X size={13} />
            </button>
          </div>
        ) : (
          <>
            <div className="lyka-history-row-top">
              <span className="lyka-history-title">{label}</span>
              <span className="lyka-history-time">{conversationTimeLabel(session.last_message_at || session.updated_at)}</span>
            </div>
            <div className="lyka-history-preview">{conversationPreview(session)}</div>
            <div className="lyka-history-meta">
              <span>{session.turn_count} {session.turn_count === 1 ? 'message' : 'messages'}</span>
              {session.has_recommendations && (
                <span className="lyka-history-pill">Listings shared</span>
              )}
            </div>
          </>
        )}
      </div>
      {!editing && (
        <button
          type="button"
          className="lyka-history-rename"
          title="Rename conversation"
          aria-label={`Rename ${label}`}
          onClick={(event) => {
            event.stopPropagation()
            setDraft(label)
            setEditing(true)
          }}
        >
          <Pencil size={12} />
        </button>
      )}
    </div>
  )
}

export function ConversationSidebar({
  open,
  sessions,
  activeSessionId,
  loading,
  error,
  hasMore,
  total,
  onNewChat,
  onSelect,
  onRename,
  onLoadMore,
  onClose,
}: ConversationSidebarProps) {
  if (!open) return null
  const groups = groupConversationsByDate(sessions)

  return (
    <>
      <div className="lyka-history-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="lyka-history" aria-label="Conversation history">
        <div className="lyka-history-head">
          <div className="lyka-history-heading">
            <h4>Conversations</h4>
            <span>{total > 0 ? `${total} saved` : 'Your chat history'}</span>
          </div>
          <div className="lyka-history-head-actions">
            <button type="button" className="lyka-history-new" onClick={onNewChat} title="Start a new conversation">
              <Plus size={13} /> New
            </button>
            <button type="button" className="lyka-history-close" onClick={onClose} title="Hide conversation history" aria-label="Hide conversation history">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="lyka-history-list">
          {error && <div className="lyka-history-error">{error}</div>}

          {sessions.length === 0 && loading && (
            <div className="lyka-history-loading">
              <Loader2 size={16} className="lyka-history-spin" /> Loading conversations…
            </div>
          )}

          {sessions.length === 0 && !loading && !error && (
            <div className="lyka-history-empty">
              <MessageSquare size={20} />
              <p>No saved conversations yet.</p>
              <span>Your chats will appear here automatically.</span>
            </div>
          )}

          {groups.map((group) => (
            <div className="lyka-history-group" key={group.key}>
              <div className="lyka-history-group-label">{group.label}</div>
              {group.sessions.map((session) => (
                <ConversationRow
                  key={session.session_id}
                  session={session}
                  active={session.session_id === activeSessionId}
                  onSelect={onSelect}
                  onRename={onRename}
                />
              ))}
            </div>
          ))}

          {hasMore && (
            <button
              type="button"
              className="lyka-history-more"
              onClick={onLoadMore}
              disabled={loading}
            >
              {loading ? <><Loader2 size={13} className="lyka-history-spin" /> Loading…</> : 'Load older conversations'}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
