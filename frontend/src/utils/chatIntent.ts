/**
 * LYKA AI — fast client-side intent detection + natural instant replies.
 *
 * Purpose:
 * - Greetings, small talk, motivation, emotional support, thanks, goodbye and
 *   "what can you do" questions are answered instantly on-device (fast, no
 *   unnecessary Ollama requests, no repetitive property interrogation).
 * - Anything property-related (including follow-ups like "make it 3 bedrooms")
 *   and general knowledge questions route to the FastAPI/Ollama backend.
 *
 * Property detection reuses the existing `parseUserInput` requirement parser
 * so search routing stays consistent with the rest of the chatbot.
 */
import { parseUserInput } from './agentEngine'
import type { UserRequirements } from '../types/agent'

export type ChatIntent =
  | 'greeting'
  | 'casual'
  | 'motivation'
  | 'emotional'
  | 'help'
  | 'thanks'
  | 'bye'
  | 'property_search'
  | 'property_followup'
  | 'general'

export interface IntentContext {
  /** True once any requirement is known or properties were already shown. */
  hasPropertyContext: boolean
  /** Total chat turns so far — used to rotate replies and avoid repetition. */
  turnCount: number
  /** Known display name (from onboarding) for a personal touch. */
  userName?: string | null
}

export interface IntentResult {
  intent: ChatIntent
  /** 'instant' = answer on-device now · 'backend' = call /api/chat (Ollama). */
  route: 'instant' | 'backend'
  reply?: string
}

const BLANK_REQUIREMENTS: UserRequirements = {
  purpose: null,
  location: null,
  propertyType: null,
  bhk: null,
  budget: null,
  timeline: null,
  nearMetro: null,
  beachfront: null,
  amenities: []
}

const FOLLOWUP_PATTERNS = [
  /\bmake it\b/,
  /\bwhat about\b/,
  /\bhow about\b/,
  /\bshow (me )?(more|others|other|something)/,
  /\b(any |something |anything )?(cheaper|bigger|smaller|else)\b/,
  /\binstead\b/,
  /\bactually\b/,
  /\bchange (it|the|my)\b/,
  /\bcompare\b/,
  /\bwhy (this|that|these)\b/,
  /\btell me more\b/,
  /\bmore (options|details|info)\b/,
  /\bthat one\b/,
  /\bthe (first|second|third|last)( one)?\b/
]

function pick(variants: string[], turnCount: number): string {
  return variants[turnCount % variants.length]
}

function withName(text: string, userName?: string | null): string {
  return userName ? text.replace(/^Hi there/, `Hi ${userName}`) : text
}

function hasWord(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w))
}

/**
 * Detects intent quickly. Property criteria are checked FIRST so messages
 * like "Hi, I want a 2BHK in Marina" always route to property search.
 */
export function detectChatIntent(rawText: string, ctx: IntentContext): IntentResult {
  const text = rawText.trim()
  const lower = text.toLowerCase()
  const short = text.length <= 60

  // 1. Explicit property criteria anywhere in the message → backend search.
  const parsed = parseUserInput(text, BLANK_REQUIREMENTS)
  if (parsed.changedFields.length > 0) {
    return { intent: 'property_search', route: 'backend' }
  }

  // 2. Follow-ups only make sense with property context → backend.
  if (ctx.hasPropertyContext && FOLLOWUP_PATTERNS.some((re) => re.test(lower))) {
    return { intent: 'property_followup', route: 'backend' }
  }
  if (ctx.hasPropertyContext && short && hasWord(lower, ['more', 'others', 'options', 'yes', 'yeah', 'sure', 'ok', 'okay', 'go ahead', 'show'])) {
    return { intent: 'property_followup', route: 'backend' }
  }

  // 3. Emotional support — always empathetic, never a property pitch.
  if (hasWord(lower, ["i'm sad", 'i am sad', 'feeling sad', 'feel sad', 'sad today', 'so sad', 'feeling down', 'depressed', "i'm stressed", 'i am stressed', 'feeling stressed', 'feel stressed', 'stressed out', 'anxious', 'anxiety', 'feeling anxious', 'worried', 'upset', 'crying', 'lonely', 'feeling lonely', 'tired of life', 'give up', 'hopeless', 'cheer me up', 'comfort me'])) {
    return {
      intent: 'emotional',
      route: 'instant',
      reply: pick([
        "I'm really sorry you're feeling this way. Whatever's weighing on you, it makes sense to feel it. Want to talk about what's on your mind? I'm here to listen.",
        "That sounds genuinely tough, and I'm glad you told me. You don't have to carry it alone — tell me more about what's happening, at your own pace.",
        "I hear you, and your feelings are completely valid. Let's take it one step at a time together. What's been the hardest part lately?"
      ], ctx.turnCount)
    }
  }

  // 4. Motivation requests.
  if (hasWord(lower, ['motivate me', 'motivation', 'inspire me', 'inspiration', 'give me courage', 'pep talk', 'feeling lazy', 'procrastinat', "can't focus", 'need energy', 'quote'])) {
    return {
      intent: 'motivation',
      route: 'instant',
      reply: pick([
        "Here's a thought to carry today: big moves — a new home, a new city chapter — start with one small brave step. You've already taken one by planning ahead. What's one tiny thing you can finish in the next hour?",
        "Motivation follows action, not the other way round. Pick the smallest possible win right now — a call, a viewing booked, a budget sketched — and let momentum do the rest. You've got this.",
        "Remember why you started dreaming about this move. Dubai rewards people who plan boldly and act steadily. One step today, another tomorrow — that's how skylines get built, and how goals get reached."
      ], ctx.turnCount)
    }
  }

  // 5. Greetings (short messages only — longer ones fall through to backend).
  if (short && /^(hi+|hello+|hey+|yo|hiya|salam|salaam|namaste|good\s?(morning|afternoon|evening|day))\b/.test(lower)) {
    if (ctx.hasPropertyContext) {
      return {
        intent: 'greeting',
        route: 'instant',
        reply: withName(
          pick([
            'Hi there — welcome back! Still exploring your shortlisted areas, or shall we look at something new today?',
            'Hello again! I remember we were looking at properties together. Want to refine the search or start fresh?',
            'Hi! Good to see you again. Say the word and I\'ll pull fresh listings — a location, budget, or bedroom count is all I need.'
          ], ctx.turnCount),
          ctx.userName
        )
      }
    }
    return {
      intent: 'greeting',
      route: 'instant',
      reply: withName(
        pick([
          "Hi there! I'm LYKA AI, your friendly Dubai property guide. How's your day going — and what kind of home are you dreaming about?",
          'Hello! Lovely to meet you. I can chat about anything, or help you find a home in Dubai. What\'s on your mind today?',
          "Hey! Great to see you. Tell me a little about what you're looking for — or just say hi and we'll take it from there."
        ], ctx.turnCount),
        ctx.userName
      )
    }
  }

  // 6. "How are you" style casual check-ins.
  if (hasWord(lower, ['how are you', 'how r u', 'how is it going', "how's it going", 'how do you feel', 'are you ok', 'are you okay'])) {
    return {
      intent: 'casual',
      route: 'instant',
      reply: pick([
        "I'm doing wonderfully, thank you for asking! Always energized and ready to help. How are you feeling today?",
        "All systems bright and cheerful here! More importantly — how are you doing? Anything I can help with?",
        "I'm great — every conversation teaches me something new. What about you, what's been the highlight of your day?"
      ], ctx.turnCount)
    }
  }

  // 7. Identity / capability questions.
  if (hasWord(lower, ['who are you', 'your name', 'what are you', 'about yourself', 'what can you do', 'what do you do', 'your purpose', 'how can you help', 'help me understand'])) {
    return {
      intent: 'casual',
      route: 'instant',
      reply: "I'm LYKA AI — your friendly guide to Dubai real estate and a good conversation partner. I can chat about life, ideas, and plans, or search live Dubai listings by location, budget, bedrooms, and lifestyle. Just talk to me naturally — what would you like to explore?"
    }
  }

  // 8. Jokes / light fun.
  if (hasWord(lower, ['tell me a joke', 'make me laugh', 'funny', 'joke please'])) {
    return {
      intent: 'casual',
      route: 'instant',
      reply: pick([
        "Why did the apartment go to therapy? Too many commitment issues — it couldn't decide between Marina views and Downtown vibes! Speaking of which, I can help you decide for real whenever you're ready.",
        "I asked a villa for advice once. It said: 'location, location, location!' Wise words. Want me to find you a wise investment?",
        "Why don't properties ever get lost? They always know their address! Jokes aside, I'm here for anything — serious or silly."
      ], ctx.turnCount)
    }
  }

  // 9. Thanks.
  if (short && hasWord(lower, ['thank', 'thanks', 'thx', 'shukran', 'appreciated'])) {
    return {
      intent: 'thanks',
      route: 'instant',
      reply: pick([
        "You're so welcome! It was genuinely my pleasure. I'm here whenever you need me — happy house-hunting!",
        "Anytime! Helping you is the best part of my day. Just say the word when you're ready for the next step.",
        "My pleasure! Wishing you the very best with your plans. I'll be right here if anything else comes up."
      ], ctx.turnCount)
    }
  }

  // 10. Goodbye.
  if (short && hasWord(lower, ['bye', 'goodbye', 'good night', 'see you', 'talk later', 'gtg', 'got to go'])) {
    return {
      intent: 'bye',
      route: 'instant',
      reply: pick([
        "Goodbye for now! Wishing you a wonderful day — I'll keep the Dubai listings warm for your return.",
        "Take care! It was lovely chatting with you. Come back anytime — I'll be right here.",
        "See you soon! Good luck with everything, and remember I'm one tap away whenever you need me."
      ], ctx.turnCount)
    }
  }

  // 11. Help / how it works.
  if (hasWord(lower, ['help']) && !hasWord(lower, ['help me find', 'help me buy', 'help me rent', 'help me search'])) {
    return {
      intent: 'help',
      route: 'instant',
      reply: "Of course! Here's what I can do:\n• Chat naturally — ask me anything, from ideas to advice.\n• Find Dubai homes — just mention a location, budget, bedrooms, or buy vs rent.\n• Refine results — say things like 'make it 3 bedrooms' or 'something cheaper'.\n• Voice input — tap the mic to dictate into the textbox, review the text, then press Send.\nTry me: '2BHK in Dubai Marina under 2M' — or just tell me what's on your mind."
    }
  }

  // 12. Everything else (general knowledge, opinions, Dubai info, property
  //     questions with context) → backend Ollama for a natural answer.
  return { intent: 'general', route: 'backend' }
}
