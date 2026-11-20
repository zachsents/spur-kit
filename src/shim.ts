// Filters on a spur's MCP messages, as its host relays them. `switchboard` turns a Switchboard
// appendage (sbmcp: events with `_meta["switchboard/record"]`) into a Switch spur, so its tools
// carry over as they are; `readOnly` keeps only the tools that only look.
import { VERSION } from "./app.ts"

export type Json = Record<string, unknown>

export interface Filter {
  /** A message on its way to the spur: forwarded (maybe changed), or answered here instead. */
  readonly inbound: (m: Json) => { readonly forward: Json | null; readonly answer: Json | null }
  /** A message from the spur: passed on (maybe changed), or dropped. */
  readonly outbound: (m: Json) => Json | null
}

export const isJson = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const field = (m: Json, key: string): Json => {
  const v = m[key]
  return isJson(v) ? v : {}
}

const list = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : [])

const pass = (m: Json) => ({ forward: m, answer: null })

/** Remembers the ids of requests by method, to know what a response answers. */
const asked = () => {
  const ids = new Map<unknown, string>()
  return {
    note: (m: Json) => {
      if (m.id !== undefined && typeof m.method === "string") {
        ids.set(m.id, m.method)
      }
    },
    /** The method a response answers, once; "" for anything else. */
    take: (m: Json) => {
      if (m.method !== undefined) {
        return ""
      }
      const method = ids.get(m.id) ?? ""
      ids.delete(m.id)
      return method
    },
  }
}

const RECORD = "switchboard/record"

/** What a shimmed event carries: its Switchboard record, envelope and body. */
const RECORD_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string" },
    stream: { type: "string" },
    data: {},
    about: { type: "array", items: { type: "string" } },
    refs: { type: "array", items: { type: "string" } },
    importance: { type: "number" },
  },
  required: ["kind", "stream", "data"],
}

const ENVELOPE = ["about", "refs", "importance"] as const

/**
 * A Switchboard appendage as a spur. Its event types gain the spur's prefix (`pr` becomes
 * `github-prs.pr`); each occurrence's payload is its record: `kind` and `stream` (where the type, or
 * the occurrence, says it lands; else `event` in `events/<spur>`), the record's `about`, `refs` and
 * `importance`, and its body as `data`. A fixed record id is the event id, so a resend is one event.
 */
export const switchboard = (spur: string): Filter => {
  const prefix = `${spur}.`
  const requests = asked()
  const placed = new Map<string, Json>()

  const renamed = (e: Json): Json => {
    const name = String(e.name)
    placed.set(name, field(field(e, "_meta"), RECORD))
    return {
      ...e,
      name: `${prefix}${name}`,
      delivery: ["push"],
      payloadSchema: RECORD_SCHEMA,
      _meta: { [VERSION]: 1 },
    }
  }

  const occurrence = (params: Json): Json => {
    const name = String(params.name)
    const where = placed.get(name) ?? {}
    const meta = field(params, "_meta")
    const envelope = field(meta, RECORD)
    const stream = [envelope.stream, where.stream].find((x) => typeof x === "string")
    const payload: Json = {
      kind: typeof where.kind === "string" ? where.kind : "event",
      stream: typeof stream === "string" ? stream : `events/${spur}`,
      data: params.data ?? null,
    }
    for (const key of ENVELOPE) {
      if (envelope[key] !== undefined) {
        payload[key] = envelope[key]
      }
    }
    const { [RECORD]: _, ...rest } = meta
    return {
      ...params,
      name: `${prefix}${name}`,
      eventId: typeof envelope.id === "string" ? envelope.id : params.eventId,
      data: payload,
      _meta: rest,
    }
  }

  return {
    inbound: (m) => {
      requests.note(m)
      const params = field(m, "params")
      const { name } = params
      if (
        (m.method === "events/stream" || m.method === "events/poll") &&
        typeof name === "string" &&
        name.startsWith(prefix)
      ) {
        return pass({ ...m, params: { ...params, name: name.slice(prefix.length) } })
      }
      return pass(m)
    },
    outbound: (m) => {
      if (requests.take(m) === "events/list" && isJson(m.result)) {
        const events = list(m.result.events).filter(isJson).map(renamed)
        return { ...m, result: { ...m.result, events } }
      }
      if (m.method === "notifications/events/event") {
        return { ...m, params: occurrence(field(m, "params")) }
      }
      return m
    },
  }
}

const refused = (id: unknown, name: string): Json => ({
  jsonrpc: "2.0",
  id,
  result: { content: [{ type: "text", text: `${name} isn't read-only` }], isError: true },
})

/** Lists and calls only the tools marked `readOnlyHint`; the rest are refused without reaching it. */
export const readOnly = (): Filter => {
  const requests = asked()
  const looks = new Set<string>()
  return {
    inbound: (m) => {
      if (m.method === "tools/call") {
        const name = String(field(m, "params").name)
        return looks.has(name) ? pass(m) : { forward: null, answer: refused(m.id, name) }
      }
      requests.note(m)
      return pass(m)
    },
    outbound: (m) => {
      if (requests.take(m) === "tools/list" && isJson(m.result)) {
        const tools = list(m.result.tools)
          .filter(isJson)
          .filter((t) => field(t, "annotations").readOnlyHint === true)
        for (const t of tools) {
          looks.add(String(t.name))
        }
        return { ...m, result: { ...m.result, tools } }
      }
      return m
    },
  }
}

/** Filters in order on the way in, reversed on the way out. */
export const chain = (filters: readonly Filter[]): Filter => ({
  inbound: (m) => {
    let current = m
    for (const f of filters) {
      const step = f.inbound(current)
      if (step.forward === null) {
        return step
      }
      current = step.forward
    }
    return pass(current)
  },
  outbound: (m) => {
    let current: Json | null = m
    for (const f of filters.toReversed()) {
      if (current === null) {
        return null
      }
      current = f.outbound(current)
    }
    return current
  },
})
