// A spur's events: a type, a version and an Effect Schema for the payload. The brain checks each one
// against its schema on the way in; a spur checks it before it's sent.
import { Result, Schema } from "effect"

/** A payload schema that needs no services, so it can be checked synchronously. */
export type Payload<T> = Schema.Codec<T, unknown>

/** An event before it's in the log: its type and payload. */
export interface Draft {
  readonly type: string
  readonly payload: unknown
}

/** Checks a payload against its schema and returns its encoded form, or why it failed. */
export type Check = (payload: unknown) => Result.Result<unknown, string>

export const checker = <P>(schema: Payload<P>): Check => {
  const decode = Schema.decodeUnknownResult(schema)
  const encode = Schema.encodeSync(schema)
  return (payload) =>
    Result.mapBoth(decode(payload), { onSuccess: encode, onFailure: (e) => e.message })
}

/** An event type with its payload type erased. */
export interface EventDef {
  readonly type: string
  readonly version: number
  readonly check: Check
}

export const defineEvent = <const T extends string, P>(
  type: T,
  version: number,
  payload: Payload<P>,
) => ({
  type,
  version,
  payload,
  check: checker(payload),
  decode: Schema.decodeUnknownSync(payload),
  make: (p: P): Draft => ({ type, payload: p }),
})

/** Something refused: a bad payload, an unknown type, or a decision that said no. */
const TaggedRefusal = Schema.TaggedError

export class Rejected extends TaggedRefusal<Rejected>()("Rejected", {
  reason: Schema.String,
}) {}
