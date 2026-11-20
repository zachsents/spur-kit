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

Switch installs it from a git URL or package name: `spurs_install`, or Spurs in the desktop.
