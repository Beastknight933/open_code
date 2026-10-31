import { describe, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { Tool } from "@opencode/core/tool"
import { Environment } from "@opencode/core/environment/index"
import { Ripgrep } from "@opencode/core/ripgrep"
import { Location } from "@opencode/core/location"
import { FileAccess } from "@opencode/core/file-access"
import { FileMutation } from "@opencode/core/file-mutation"
import { Formatter } from "@opencode/core/formatter"
import { Permission } from "@opencode/core/permission"
import { ReadToolFileSystem } from "@opencode/core/tool/read-filesystem"
import { SessionInstructions } from "@opencode/core/session/instructions"
import { FSUtil } from "@opencode/util/fs-util"
import { AbsolutePath } from "@opencode/core/schema"
import type { ProjectWorkspace } from "@opencode/schema/project-workspace"
import { Session } from "@opencode/core/session"
import { MultiFolderWorkspace } from "@opencode/core/workspace-manager/multi-folder"
import { GlobTool } from "@opencode/core/tool/plugin/glob"
import { GrepTool } from "@opencode/core/tool/plugin/grep"
import { ReadTool } from "@opencode/core/tool/plugin/read"
import { WriteTool } from "@opencode/core/tool/plugin/write"
import { EditTool } from "@opencode/core/tool/plugin/edit"
import { PatchTool } from "@opencode/core/tool/plugin/patch"
import { it } from "../lib/effect"
import { permissionLayer } from "../lib/permission"
import { executeTool, registerToolPlugin, toolIdentity } from "../lib/tool"
import { location } from "../fixture/location"

const globToolNode = makeLocationNode({
  name: "test/glob-tool-plugin",
  layer: Layer.effectDiscard(registerToolPlugin(GlobTool.Plugin)),
  deps: [Tool.node, Environment.node, Ripgrep.node, Location.node, FileAccess.node, Permission.node],
})

const grepToolNode = makeLocationNode({
  name: "test/grep-tool-plugin",
  layer: Layer.effectDiscard(registerToolPlugin(GrepTool.Plugin)),
  deps: [Tool.node, Environment.node, Ripgrep.node, Location.node, FileAccess.node, Permission.node],
})

const readToolNode = makeLocationNode({
  name: "test/read-tool-plugin",
  layer: Layer.effectDiscard(registerToolPlugin(ReadTool.Plugin)),
  deps: [
    Tool.node,
    ReadToolFileSystem.node,
    SessionInstructions.node,
    Environment.node,
    FSUtil.node,
    Location.node,
    FileAccess.node,
    Permission.node,
  ],
})

const writeToolNode = makeLocationNode({
  name: "test/write-tool-plugin",
  layer: Layer.effectDiscard(registerToolPlugin(WriteTool.Plugin)),
  deps: [Tool.node, FileAccess.node, FileMutation.node, Environment.node, Formatter.node, Permission.node],
})

const editToolNode = makeLocationNode({
  name: "test/edit-tool-plugin",
  layer: Layer.effectDiscard(registerToolPlugin(EditTool.Plugin)),
  deps: [
    Tool.node,
    FileAccess.node,
    FileMutation.node,
    Environment.node,
    Formatter.node,
    Location.node,
    Permission.node,
  ],
})

const patchToolNode = makeLocationNode({
  name: "test/patch-tool-plugin",
  layer: Layer.effectDiscard(registerToolPlugin(PatchTool.Plugin)),
  deps: [
    Tool.node,
    Environment.node,
    FileAccess.node,
    FileMutation.node,
    Formatter.node,
    Location.node,
    Permission.node,
  ],
})

const allToolNodes = LayerNode.group([
  Tool.node,
  MultiFolderWorkspace.node,
  globToolNode,
  grepToolNode,
  readToolNode,
  writeToolNode,
  editToolNode,
  patchToolNode,
])

const sessionID = Session.ID.make("ses_multi_root_vfs_test")

const call = (name: string, input: unknown) => ({
  sessionID,
  ...toolIdentity,
  call: { type: "tool-call" as const, id: `call-${name}`, name, input },
})

function withMultiRoot(
  folders: ProjectWorkspace.WorkspaceFolder[],
  body: (exec: (tool: string, input: unknown) => Effect.Effect<any>) => Effect.Effect<void>,
) {
  const primary = folders.find((f) => f.isPrimary) ?? folders[0]
  const directory = primary.path

  const mfwMock = MultiFolderWorkspace.Service.of({
    listFolders: () => Effect.succeed(folders),
    addFolder: () => Effect.die("not implemented"),
    addFolders: () => Effect.die("not implemented"),
    removeFolder: () => Effect.die("not implemented"),
    setPrimary: () => Effect.die("not implemented"),
    relinkFolder: () => Effect.die("not implemented"),
    getUnifiedTree: () => Effect.die("not implemented"),
  })

  return Effect.gen(function* () {
    const registry = yield* Tool.Service
    const exec = (tool: string, input: unknown) => executeTool(registry, call(tool, input))
    yield* body(exec)
  }).pipe(
    Effect.provide(
      AppNodeBuilder.build(allToolNodes, [
        Location.node.replace(
          Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(directory) }))),
        ),
        MultiFolderWorkspace.node.replace(Layer.succeed(MultiFolderWorkspace.Service, mfwMock)),
        Permission.node.replace(
          permissionLayer({
            allows: () => Effect.succeed(true),
            assert: () => Effect.void,
          }),
        ),
      ]),
    ),
  )
}

describe("Stage 2 — Task 2.1: Multi-Root Virtual Filesystem Integration", () => {
  it.live("Scenario 1: Read from primary root", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc1-p-"))
      const secondaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc1-s-"))

      fs.writeFileSync(path.join(primaryDir, "primary.txt"), "hello from primary root")

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_secondary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(secondaryDir),
          name: "backend",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          const res = yield* exec("read", { path: "primary.txt" })
          expect(res.status).toBe("completed")
          expect(res.content?.[0]?.text).toContain("hello from primary root")
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
      fs.rmSync(secondaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 2: Read from secondary root (unqualified when unique)", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc2-p-"))
      const secondaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc2-s-"))

      fs.writeFileSync(path.join(secondaryDir, "unique-secondary.txt"), "data from unique secondary")

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_secondary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(secondaryDir),
          name: "backend",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          const res = yield* exec("read", { path: "unique-secondary.txt" })
          expect(res.status).toBe("completed")
          expect(res.content?.[0]?.text).toContain("data from unique secondary")
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
      fs.rmSync(secondaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 3: Write to secondary root (root-qualified)", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc3-p-"))
      const secondaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc3-s-"))

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_secondary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(secondaryDir),
          name: "backend",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          const res = yield* exec("write", {
            path: "backend/src/api.ts",
            content: "export const endpoint = '/api/v1'",
          })
          expect(res.status).toBe("completed")

          // Verify physically written to secondaryDir, NOT primaryDir
          const targetFile = path.join(secondaryDir, "src", "api.ts")
          expect(fs.existsSync(targetFile)).toBe(true)
          expect(fs.readFileSync(targetFile, "utf8")).toBe("export const endpoint = '/api/v1'")
          expect(fs.existsSync(path.join(primaryDir, "backend", "src", "api.ts"))).toBe(false)
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
      fs.rmSync(secondaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 4: Edit file in secondary root", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc4-p-"))
      const secondaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc4-s-"))

      fs.writeFileSync(path.join(secondaryDir, "config.json"), '{\n  "port": 3000\n}\n')

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_secondary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(secondaryDir),
          name: "backend",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          const res = yield* exec("edit", {
            path: "backend/config.json",
            oldString: '"port": 3000',
            newString: '"port": 8080',
          })
          expect(res.status).toBe("completed")

          const edited = fs.readFileSync(path.join(secondaryDir, "config.json"), "utf8")
          expect(edited).toContain('"port": 8080')
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
      fs.rmSync(secondaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 5: Apply patch to file in secondary root", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc5-p-"))
      const secondaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc5-s-"))

      fs.writeFileSync(path.join(secondaryDir, "service.ts"), "const version = 1\n")

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_secondary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(secondaryDir),
          name: "backend",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          const patchText =
            "*** Begin Patch\n*** Update File: backend/service.ts\n@@\n-const version = 1\n+const version = 2\n*** End Patch"
          const res = yield* exec("patch", { patchText })
          expect(res.status).toBe("completed")

          const patched = fs.readFileSync(path.join(secondaryDir, "service.ts"), "utf8")
          expect(patched).toBe("const version = 2\n")
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
      fs.rmSync(secondaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 6: Glob across multiple roots (results grouped/prefixed)", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc6-p-"))
      const secondaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc6-s-"))

      fs.mkdirSync(path.join(primaryDir, "src"), { recursive: true })
      fs.writeFileSync(path.join(primaryDir, "src", "client.ts"), "export const client = true\n")

      fs.mkdirSync(path.join(secondaryDir, "src"), { recursive: true })
      fs.writeFileSync(path.join(secondaryDir, "src", "server.ts"), "export const server = true\n")

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_secondary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(secondaryDir),
          name: "backend",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          const res = yield* exec("glob", { pattern: "**/*.ts" })
          expect(res.status).toBe("completed")

          const paths = (res.output as any[]).map((e: any) => e.path.replaceAll("\\", "/"))
          expect(paths).toContain("src/client.ts")
          expect(paths).toContain("backend/src/server.ts")
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
      fs.rmSync(secondaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 7: Grep across multiple roots", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc7-p-"))
      const secondaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc7-s-"))

      fs.writeFileSync(path.join(primaryDir, "app.ts"), "const queryKey = 'TARGET_NEEDLE'\n")
      fs.writeFileSync(path.join(secondaryDir, "api.ts"), "const secretKey = 'TARGET_NEEDLE'\n")

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_secondary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(secondaryDir),
          name: "backend",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          const res = yield* exec("grep", { pattern: "TARGET_NEEDLE" })
          expect(res.status).toBe("completed")

          const matches = res.output as any[]
          expect(matches.length).toBe(2)

          const paths = matches.map((m) => m.entry.path.replaceAll("\\", "/"))
          expect(paths).toContain("app.ts")
          expect(paths).toContain("backend/api.ts")
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
      fs.rmSync(secondaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 8: Duplicate relative paths (ambiguity detection returning error with options)", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc8-p-"))
      const secondaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc8-s-"))

      fs.writeFileSync(path.join(primaryDir, "shared.ts"), "primary version")
      fs.writeFileSync(path.join(secondaryDir, "shared.ts"), "secondary version")

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_secondary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(secondaryDir),
          name: "backend",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          const res = yield* exec("read", { path: "shared.ts" })
          expect(res.status).toBe("error")
          const msg = res.error?.message || ""
          expect(msg).toContain("Ambiguous path")
          expect(msg).toContain("frontend")
          expect(msg).toContain("backend")
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
      fs.rmSync(secondaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 9: Explicit root-qualified paths (<rootName>/<path>)", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc9-p-"))
      const secondaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc9-s-"))

      fs.writeFileSync(path.join(primaryDir, "shared.ts"), "primary content")
      fs.writeFileSync(path.join(secondaryDir, "shared.ts"), "secondary content")

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_secondary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(secondaryDir),
          name: "backend",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          const primaryRes = yield* exec("read", { path: "frontend/shared.ts" })
          expect(primaryRes.status).toBe("completed")
          expect(primaryRes.content?.[0]?.text).toContain("primary content")

          const secondaryRes = yield* exec("read", { path: "backend/shared.ts" })
          expect(secondaryRes.status).toBe("completed")
          expect(secondaryRes.content?.[0]?.text).toContain("secondary content")
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
      fs.rmSync(secondaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 10: Path traversal attempts (../ outside roots rejected)", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc10-p-"))
      const secondaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc10-s-"))

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_secondary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(secondaryDir),
          name: "backend",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          const res = yield* exec("read", { path: "backend/../../outside-escape.txt" })
          expect(res.status).toBe("error")
          const msg = res.error?.message || ""
          expect(msg.toLowerCase()).toContain("traversal")
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
      fs.rmSync(secondaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 11: Symlink escape attempts rejected", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc11-p-"))
      const secondaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc11-s-"))
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc11-out-"))

      const outsideFile = path.join(outsideDir, "secret.txt")
      fs.writeFileSync(outsideFile, "top secret outside data")

      const symlinkPath = path.join(secondaryDir, "escape-link.txt")
      let symlinkCreated = false
      try {
        fs.symlinkSync(outsideFile, symlinkPath)
        symlinkCreated = true
      } catch {
        // Windows without Developer Mode permissions
      }

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_secondary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(secondaryDir),
          name: "backend",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      if (symlinkCreated) {
        yield* withMultiRoot(folders, (exec) =>
          Effect.gen(function* () {
            const res = yield* exec("read", { path: "backend/escape-link.txt" })
            expect(res.status).toBe("error")
            const msg = res.error?.message || ""
            expect(msg.toLowerCase()).toContain("outside")
          }),
        )
      }

      fs.rmSync(primaryDir, { recursive: true, force: true })
      fs.rmSync(secondaryDir, { recursive: true, force: true })
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 12: Detached / missing folder handled gracefully without crashing search", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc12-p-"))
      const missingDir = path.join(os.tmpdir(), "mr-sc12-nonexistent-folder-xyz")

      fs.writeFileSync(path.join(primaryDir, "main.ts"), "console.log('main')\n")

      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_missing",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(missingDir),
          name: "missing-folder",
          isPrimary: false,
          status: "missing",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          // Glob should skip missing folder without crashing
          const globRes = yield* exec("glob", { pattern: "**/*.ts" })
          expect(globRes.status).toBe("completed")
          expect((globRes.output as any[]).length).toBe(1)

          // Grep should skip missing folder without crashing
          const grepRes = yield* exec("grep", { pattern: "console" })
          expect(grepRes.status).toBe("completed")
          expect((grepRes.output as any[]).length).toBe(1)
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 13: Duplicate physical directory detection", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc13-p-"))

      fs.writeFileSync(path.join(primaryDir, "unique.ts"), "const x = 42\n")

      // Two workspace folders pointing to the exact same physical path
      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
        {
          id: "f_duplicate",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend-alias",
          isPrimary: false,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          const globRes = yield* exec("glob", { pattern: "**/*.ts" })
          expect(globRes.status).toBe("completed")
          // Must NOT return duplicate results
          expect((globRes.output as any[]).length).toBe(1)

          const grepRes = yield* exec("grep", { pattern: "const x" })
          expect(grepRes.status).toBe("completed")
          expect((grepRes.output as any[]).length).toBe(1)
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
    }),
  )

  it.live("Scenario 14: Single-root project regression check (100% backwards compatible)", () =>
    Effect.gen(function* () {
      const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-sc14-p-"))

      fs.writeFileSync(path.join(primaryDir, "index.ts"), "export const hello = 'world'\n")

      // Only 1 folder (single-root)
      const folders: ProjectWorkspace.WorkspaceFolder[] = [
        {
          id: "f_primary",
          projectID: "proj_test" as any,
          path: AbsolutePath.make(primaryDir),
          name: "frontend",
          isPrimary: true,
          status: "active",
          addedAt: Date.now(),
        },
      ]

      yield* withMultiRoot(folders, (exec) =>
        Effect.gen(function* () {
          // Read
          const readRes = yield* exec("read", { path: "index.ts" })
          expect(readRes.status).toBe("completed")
          expect(readRes.content?.[0]?.text).toContain("export const hello = 'world'")

          // Write
          const writeRes = yield* exec("write", { path: "new.ts", content: "export const created = true" })
          expect(writeRes.status).toBe("completed")
          expect(fs.readFileSync(path.join(primaryDir, "new.ts"), "utf8")).toBe("export const created = true")

          // Edit
          const editRes = yield* exec("edit", {
            path: "index.ts",
            oldString: "'world'",
            newString: "'universe'",
          })
          expect(editRes.status).toBe("completed")
          expect(fs.readFileSync(path.join(primaryDir, "index.ts"), "utf8")).toContain("'universe'")

          // Patch
          const patchRes = yield* exec("patch", {
            patchText:
              "*** Begin Patch\n*** Update File: index.ts\n@@\n-export const hello = 'universe'\n+export const hello = 'cosmos'\n*** End Patch",
          })
          expect(patchRes.status).toBe("completed")
          expect(fs.readFileSync(path.join(primaryDir, "index.ts"), "utf8")).toContain("'cosmos'")

          // Glob
          const globRes = yield* exec("glob", { pattern: "*.ts" })
          expect(globRes.status).toBe("completed")
          expect((globRes.output as any[]).length).toBe(2)

          // Grep
          const grepRes = yield* exec("grep", { pattern: "export const hello" })
          expect(grepRes.status).toBe("completed")
          expect((grepRes.output as any[]).length).toBe(1)
        }),
      )

      fs.rmSync(primaryDir, { recursive: true, force: true })
    }),
  )
})
