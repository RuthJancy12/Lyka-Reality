import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendChatMessageStream } from '../../services/api'

function sseResponse(chunks: string[], ok = true): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
  return new Response(stream, { status: ok ? 200 : 500 })
}

const META = {
  type: 'meta',
  matched_properties: [
    { property_id: 'LYK-1', title: 'T', location: 'Dubai Marina' },
  ],
  requirements: { purpose: 'Sale', location: 'Dubai Marina' },
  session_id: 's1',
  need: null,
  options: [],
}

const DONE = {
  type: 'done',
  reply: 'Hello world',
  matched_properties: META.matched_properties,
  requirements: META.requirements,
  session_id: 's1',
  need: null,
  options: [],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendChatMessageStream', () => {
  it('assembles meta, split tokens, and done across fragmented frames', async () => {
    const full = `data: ${JSON.stringify(META)}\n\ndata: {"type":"token","token":"Hello "}\n\ndata: {"type":"token","token":"world"}\n\ndata: ${JSON.stringify(DONE)}\n\n`
    // Split mid-frame to prove the parser handles TCP fragmentation.
    const chunks = [full.slice(0, 60), full.slice(60, 150), full.slice(150)]
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(chunks)))

    const seen: Array<{ kind: string; text: string }> = []
    const result = await sendChatMessageStream('hi', 's1', {
      onMeta: (m) => seen.push({ kind: 'meta', text: String(m.matched_properties.length) }),
      onToken: (t) => seen.push({ kind: 'token', text: t }),
    })

    expect(result.reply).toBe('Hello world')
    expect(result.matched_properties).toHaveLength(1)
    expect(seen.filter((s) => s.kind === 'token').map((s) => s.text).join('')).toBe(
      'Hello world'
    )
    expect(seen[0]).toEqual({ kind: 'meta', text: '1' })
    // Meta arrives before any token: first useful content is immediate.
    expect(seen.findIndex((s) => s.kind === 'token')).toBeGreaterThan(0)
  })

  it('ignores malformed frames and still resolves', async () => {
    const body =
      `data: not-json\n\ndata: {"type":"token","token":"Hi"}\n\ndata: ${JSON.stringify({ ...DONE, reply: 'Hi' })}\n\n`
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([body])))
    const tokens: string[] = []
    const result = await sendChatMessageStream('hi', 's1', {
      onToken: (t) => tokens.push(t),
    })
    expect(result.reply).toBe('Hi')
    expect(tokens.join('')).toBe('Hi')
  })

  it('throws a readable error when the stream never completes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([`data: {"type":"token","token":"x"}\n\n`])))
    await expect(sendChatMessageStream('hi', 's1')).rejects.toThrow(
      /without a response/
    )
  })

  it('throws on HTTP errors and sends no client history payload', async () => {
    const spy = vi.fn(async (_url: unknown, init: any) => {
      const body = JSON.parse(init.body)
      expect(body.history).toBeUndefined()
      return sseResponse([], false)
    })
    vi.stubGlobal('fetch', spy)
    await expect(sendChatMessageStream('hi', 's1')).rejects.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
