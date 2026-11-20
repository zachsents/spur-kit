# spur-kit

The convention for Switch spurs: a spur's tools (MCP tools), events (MCP Events, with an Effect
Schema and a version), widgets (A2UI, with `McpApp` for custom drawing), its manifest, and serving
it as MCP on stdio. Also the shim that makes a Switchboard appendage a spur.

## Install

```sh
bun add github:zachsents/spur-kit effect
```

## A spur

```ts
import { defineApp, serveStdio, tool } from "spur-kit"
import { Effect, Layer } from "effect"

const app = defineApp({
  name: "hello",
  version: "1",
  tools: [tool("hi", { description: "Says hi.", readOnly: true }, () => Effect.succeed("hi"))],
})

await serveStdio(app, Layer.empty)
```

Its `package.json` carries the manifest:

```json
"spur": {
  "name": "hello",
  "main": "src/main.ts",
  "needs": ["macos"],
  "connections": [{ "provider": "google", "scopes": ["…"], "multiple": true }],
  "widgets": ["face"],
  "space": { "id": "home", "name": "Home" }
}
```

A spur that isn't TypeScript gives `command` instead of `main` (its `./` paths from the package's
folder), and `"shim": "switchboard"` if it's a Switchboard appendage.

## Widgets

A widget's `size` says how it sits in a space's grid, in units (one square cell): its `aspect`
(`square`, `wide`, `tall` or `auto`), a `ratio` a wide or tall one keeps (`16 / 9`), its `min`,
`preferred` and `max` `{ cols, rows }`, whether it `grows` past preferred, and what it is with
nothing to show (`empty`: a single `line`, the default, or `hide`).

## Its own log

`Log.layer({ path, events, projections, commands })` keeps a spur's events on its own SQLite file,
with read models over them (`defineCommand`, `on`, `Projection`): `dispatch` a command, `read` the
projections, follow `changes`.

## Models

A spur holds no model keys. `Models.layer` asks the host that runs it, over MCP, which answers
with the user's profile: `decide(input, questions, role?)` picks among choices with
probabilities, `complete(role, system, prompt)` writes text. The host declares the
`ax.switch/models` client extension and answers `models/decide` and `models/complete`; without
one, each call fails with `ModelError`.

## Action items

`Asks` (provided by `Models.layer`) puts an item in the user's queue through the host:
`open({ title, body, kind?, options?, drafts?, attachments?, space?, answerTo? })` and
`close(id, status)`. The host declares `ax.switch/asks` and answers `asks/open` and
`asks/close`. `answerTo` names one of the spur's tools (make it `appOnly`), called once the item
closes with `{ item, status, answer }`.

A sealed ask takes a secret without it entering the brain, a chat or a model's context: make a
one-time key with `sealedKey()` (`spur-kit/sealed`), open the ask with `kind: "sealed"`,
`sealed: { key, use }` and `answerTo`, and keep `secretKey`. The user's client seals what they type
to `key` (HPKE, RFC 9180: X25519, HKDF-SHA256, AES-256-GCM, bound to the item's id and `use`); the
core hands the sealed bytes only to `answerTo`, as `{ item, use, enc, ct }`, and records only that
it was answered. `openSealed(secretKey, item, use, { enc, ct })` gives the secret back.

Switch installs it from a git URL or package name: `spurs_install`, or Spurs in the desktop.
