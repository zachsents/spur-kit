// The spur as a stdio MCP server.
import { serveStdio } from "spur-kit"

import { helloApp, Notes } from "./app.ts"

await serveStdio(helloApp, Notes.layer)
