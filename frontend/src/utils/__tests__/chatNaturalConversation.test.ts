import { describe, it, expect } from 'vitest'
import { detectChatIntent } from '../chatIntent'
import { stripUndefined } from '../../services/rtdb'
import { saveLocalUser, getLocalUser } from '../../services/chatStore'

describe('Natural AI Conversation & Casual Queries', () => {
  const baseCtx = {
    hasPropertyContext: false,
    turnCount: 0,
    userName: null,
  }

  it('handles "hi" with a friendly, natural greeting instead of pushing properties', () => {
    const res = detectChatIntent('hi', baseCtx)
    expect(res.route).toBe('instant')
    expect(res.intent).toBe('greeting')
    expect(res.reply).toBe('Hey! How are you doing today?')
    expect(res.reply).not.toMatch(/property|buy|rent|invest/i)
  })

  it('handles "i love you" warmly without robotic real estate pitch', () => {
    const res = detectChatIntent('i love you', baseCtx)
    expect(res.route).toBe('instant')
    expect(res.intent).toBe('casual')
    expect(res.reply).toContain('That is so kind of you to say!')
    expect(res.reply).not.toMatch(/only true love is Dubai real estate/i)
  })

  it('handles playful acknowledgments like "oo" naturally', () => {
    const res = detectChatIntent('oo', baseCtx)
    expect(res.route).toBe('instant')
    expect(res.intent).toBe('casual')
    expect(res.reply).toBe("Haha 😊 What's on your mind?")
  })

  it('handles "are you eat" naturally', () => {
    const res = detectChatIntent('are you eat', baseCtx)
    expect(res.route).toBe('instant')
    expect(res.intent).toBe('casual')
    expect(res.reply).toBe("I don't eat because I'm an AI, but thanks for asking! Have you eaten?")
  })

  it('handles "hey iam ask simply" with understanding', () => {
    const res = detectChatIntent('hey iam ask simply', baseCtx)
    expect(res.route).toBe('instant')
    expect(res.intent).toBe('casual')
    expect(res.reply).toBe("Sorry, I misunderstood you! I don't eat, but thank you for asking!")
  })

  it('handles "why you not speak correctly" with humility', () => {
    const res = detectChatIntent('why you not speak correctly', baseCtx)
    expect(res.route).toBe('instant')
    expect(res.intent).toBe('casual')
    expect(res.reply).toBe("You're right. My replies were too complicated. I'll keep things simple and natural.")
  })

  it('handles "how can i trust you" with transparency', () => {
    const res = detectChatIntent('how can i trust you', baseCtx)
    expect(res.route).toBe('instant')
    expect(res.intent).toBe('casual')
    expect(res.reply).toContain("That's a fair question. I'll be transparent about property details")
  })
})

describe('Firebase RTDB undefined stripper (prevents RTDB set/update errors)', () => {
  it('strips undefined properties from objects', () => {
    const input = {
      name: 'John Doe',
      phone: undefined,
      city: undefined,
      meta: {
        role: 'customer',
        notes: undefined,
      },
      tags: ['a', undefined, 'b'],
    }
    const cleaned = stripUndefined(input) as any
    expect(cleaned).toEqual({
      name: 'John Doe',
      meta: {
        role: 'customer',
      },
      tags: ['a', undefined, 'b'],
    })
    expect('phone' in cleaned).toBe(false)
    expect('city' in cleaned).toBe(false)
    expect('notes' in cleaned.meta).toBe(false)
  })

  it('safely passes null, primitives, and clean objects through', () => {
    expect(stripUndefined(null)).toBe(null)
    expect(stripUndefined('text')).toBe('text')
    expect(stripUndefined(123)).toBe(123)
    expect(stripUndefined({ a: 1, b: 'valid' })).toEqual({ a: 1, b: 'valid' })
  })

  it('cleans undefined fields when saving user profile in chatStore', () => {
    const doc = saveLocalUser(
      {
        name: 'Jane Customer',
        email: 'jane@example.com',
        phone: '',
        city: '   ',
      },
      'owner_test_123'
    )
    expect('phone' in doc).toBe(false)
    expect('city' in doc).toBe(false)
    expect(doc.phone).toBeUndefined()
    expect(doc.city).toBeUndefined()

    const readBack = getLocalUser('owner_test_123')
    expect(readBack).not.toBeNull()
    expect('phone' in (readBack || {})).toBe(false)
  })
})
