// What a spur says about itself before it runs: the `spur` key of its package.json. The host reads
// it when it installs the package; the core decides from it which machine runs the spur.
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { Schema } from "effect"

/** An account a spur needs the user to connect: its provider, the scopes, one or many. */
export interface Need {
  /** Whose account: "google", "github". */
  readonly provider: string
  readonly scopes: readonly string[]
  /** Any number of accounts, not one. */
  readonly multiple: boolean
  /** The Keychain service it kept these accounts in before connections: moved in once, then emptied. */
  readonly legacy?: string
}

export const need: Schema.Codec<Need> = Schema.Struct({
  provider: Schema.String,
  scopes: Schema.Array(Schema.String),
  multiple: Schema.Boolean,
  legacy: Schema.optionalKey(Schema.String),
})
/** What a spur says about itself: the `spur` key of its package.json. */
export interface Manifest {
  /** Its name to Switch: its tools are `<name>_<tool>`, its events `<name>.<event>`. */
  readonly name: string
  /** Its entry, from the package's folder: run with bun, it serves MCP on stdio. */
  readonly main?: string
  /** Or what runs it instead of `main`: an argv, its `./` paths from the package's folder. */
  readonly command?: readonly string[]
  /** A Switchboard appendage (sbmcp), made a spur by the shim. */
  readonly shim?: "switchboard"
  /** What the machine running it must provide: "macos", "lan:printers". */
  readonly needs?: readonly string[]
  /** It runs on every machine with what it needs, one per machine, instead of on one. */
  readonly every?: boolean
  /** Accounts it needs the user to connect. */
  readonly connections?: readonly Need[]
  /** The widgets it publishes, by name. */
  readonly widgets?: readonly string[]
  /** Where its widgets go until they're placed; made, with `name`, if there's none. */
  readonly space?: { readonly id: string; readonly name: string }
}

export const manifest: Schema.Codec<Manifest> = Schema.Struct({
  /** Its name to Switch: its tools are `<name>_<tool>`, its events `<name>.<event>`. */
  name: Schema.String,
  /** Its entry, from the package's folder: run with bun, it serves MCP on stdio. */
  main: Schema.optionalKey(Schema.String),
  command: Schema.optionalKey(Schema.Array(Schema.String)),
  shim: Schema.optionalKey(Schema.Literal("switchboard")),
  /** What the machine running it must provide: "macos", "lan:printers". */
  needs: Schema.optionalKey(Schema.Array(Schema.String)),
  /** It runs on every machine with what it needs, one per machine, instead of on one. */
  every: Schema.optionalKey(Schema.Boolean),
  /** Accounts it needs the user to connect. */
  connections: Schema.optionalKey(Schema.Array(need)),
  /** The widgets it publishes, by name. */
  widgets: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Where its widgets go until they're placed; made, with `name`, if there's none. */
  space: Schema.optionalKey(Schema.Struct({ id: Schema.String, name: Schema.String })),
})

const pkg = Schema.Struct({
  name: Schema.String,
  version: Schema.optionalKey(Schema.String),
  spur: manifest,
})
const decodePkg = Schema.decodeUnknownResult(Schema.fromJsonString(pkg))

/** An installed package's manifest, its package name and version; why not, if it isn't a spur. */
export const readManifest = (
  dir: string,
):
  | { readonly package: string; readonly version: string; readonly manifest: Manifest }
  | { readonly error: string } => {
  const at = path.join(dir, "package.json")
  if (!existsSync(at)) {
    return { error: "No package.json" }
  }
  const read = decodePkg(readFileSync(at, "utf-8"))
  if (read._tag === "Failure") {
    return { error: `Not a spur: ${read.failure.message}` }
  }
  const p = read.success
  if ((p.spur.main === undefined) === (p.spur.command === undefined)) {
    return { error: "A spur has main or command, one of them" }
  }
  return { package: p.name, version: p.version ?? "0.0.0", manifest: p.spur }
}
