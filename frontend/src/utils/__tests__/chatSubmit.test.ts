import { describe, it, expect } from 'vitest'
import { detectChatIntent } from '../chatIntent'
import { nextChatMsgId } from '../chatIds'

const NO_CTX = { hasPropertyContext: false, turnCount: 0, userName: null }

describe('chat submission routing (exactly-once send path)', () => {
  it('routes a natural requirement to the backend once, not an instant reply', () => {
    const r = detectChatIntent(
      'I want a 2 BHK apartment in Dubai Marina under AED 2 million',
      NO_CTX
    )
    expect(r.route).toBe('backend')
  })

  it('routes a bedroom follow-up with session context to the backend', () => {
    const r = detectChatIntent('make it 3 bedrooms', {
      hasPropertyContext: true,
      turnCount: 4,
      userName: null,
    })
    expect(r.route).toBe('backend')
  })

  it('answers a plain greeting instantly without a model call', () => {
    const r = detectChatIntent('Hi', NO_CTX)
    expect(r.route).toBe('instant')
    expect(r.reply).toBeTruthy()
  })

  it('rotates instant replies so the assistant never repeats canned text', () => {
    const a = detectChatIntent('Hi', { ...NO_CTX, turnCount: 0 })
    const b = detectChatIntent('Hi', { ...NO_CTX, turnCount: 1 })
    expect(a.reply).toBeTruthy()
    expect(b.reply).toBeTruthy()
    expect(a.reply).not.toBe(b.reply)
  })
})

describe('message identity (no dropped or duplicated bubbles)', () => {
  it('generates unique ids even within the same millisecond', () => {
    const ids = new Set(Array.from({ length: 1000 }, (_, i) =>
      nextChatMsgId(i % 2 === 0 ? 'user' : 'agent')
    ))
    expect(ids.size).toBe(1000)
  })

  it('prefixes ids by sender', () => {
    expect(nextChatMsgId('user').startsWith('user-')).toBe(true)
    expect(nextChatMsgId('agent').startsWith('agent-')).toBe(true)
  })
})
