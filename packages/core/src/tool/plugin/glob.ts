export * as GlobTool from "./glob.js"

import { ToolFailure } from "@opencode/ai/effect"
import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect, Option, Schema } from "effect"
import path from "path"
import { FSUtil } from "@opencode/util/fs-util"
import type { ProjectWorkspace } from "@opencode/schema/project-workspace"
import { Environment } from "../../environment/index.js"
import { FileSystem } from "../../filesystem.js"
import { Location } from "../../location.js"
import { FileAccess } from "../../file-access.js"
import { Ripgrep } from "../../ripgrep.js"
import { RelativePath } from "../../schema.js"
import { Permission } from "../../permission.js"
import { MultiFolderWorkspace } from "../../workspace-manager/multi-folder.js"

export const name = "glob"

export const Input = Schema.Struct({
  pattern: FileSystem.GlobInput.fields.pattern.annotate({ description: "Glob pattern to match files against" }),
  path: Schema.optionalKey(RelativePath).annotate({
    description: "Directory to search. Defaults to the current working directory.",
  }),
  hidden: FileSystem.GlobInput.fields.hidden.annotate({
    description: "Include hidden files and directories (default: false).",
  }),
  limit: FileSystem.GlobInput.fields.limit.annotate({
    description: `Maximum number of matching files to return (default: ${FileSystem.DEFAULT_SEARCH_LIMIT})`,
  }),
})

export const Output = Schema.Array(FileSystem.Entry)
type EncodedOutput = typeof Output.Encoded



/** Format raw search results into the concise line-oriented output models expect. */
export const toModelContent = (entries: EncodedOutput, truncated = false) => {
  const lines = entries.length === 0 ? ["No files found"] : entries.map((item) => item.path)
  if (truncated)
    lines.push(
      "",
      `(Results are truncated: showing first ${entries.length} results. Consider using a more specific path or pattern.)`,
    )
  return lines.join("\n")
}

/** Glob leaf that defaults its filesystem root to the active Location. */
export const Plugin = {
  id: "opencode.tool.glob",
  effect: Effect.fn("GlobTool.Plugin")(function* (ctx: Context) {
    const environment = yield* Environment.Service
    const ripgrep = yield* Ripgrep.Service
    const location = yield* Location.Service
    const access = yield* FileAccess.Service
    const permission = yield* Permission.Service
    const mfwOption = yield* Effect.serviceOption(MultiFolderWorkspace.Service)

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          options: { codemode: false },
          description: 'Search file paths using a glob pattern (examples: "**/*.ts", "src/**/*.tsx").',
          input: Input,
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              const searchPath = input.path === "undefined" || input.path === "null" ? undefined : input.path
              const source = { type: "tool" as const, messageID: context.messageID, id: context.id }
              const folders = Option.isSome(mfwOption)
                ? yield* mfwOption.value.listFolders(location.project.id).pipe(Effect.orElseSucceed(() => []))
                : []

              const limit = input.limit ?? FileSystem.DEFAULT_SEARCH_LIMIT

              // Specific directory path requested
              if (searchPath !== undefined && searchPath !== ".") {
                const target = yield* access.resolve({ path: searchPath, kind: "directory" })
                yield* access.authorizeExternal([target], context)
                yield* permission.assert({
                  action: name,
                  resources: [input.pattern],
                  save: ["*"],
                  metadata: {
                    root: searchPath,
                    path: searchPath,
                    hidden: input.hidden,
                    limit: input.limit,
                  },
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })
                const type = yield* Environment.typeFollowing(environment.files, target.absolute).pipe(
                  Effect.catchTag("Environment.NotFound", () =>
                    Effect.fail(new ToolFailure({ message: `Search path does not exist: ${searchPath}` })),
                  ),
                )
                if (type !== "directory")
                  return yield* Effect.fail(
                    new ToolFailure({ message: `Search path is not a directory: ${searchPath}` }),
                  )
                const root = target.absolute
                const rawEntries = yield* ripgrep
                  .glob({
                    cwd: root,
                    pattern: input.pattern,
                    hidden: input.hidden,
                    limit: limit + 1,
                  })
                  .pipe(
                    Effect.timeoutOrElse({
                      duration: FileSystem.DEFAULT_SEARCH_TIMEOUT_MS,
                      orElse: () =>
                        Effect.fail(
                          new ToolFailure({
                            message: `Search timed out after ${FileSystem.DEFAULT_SEARCH_TIMEOUT_MS / 1_000} seconds. Consider using a more specific path or pattern.`,
                          }),
                        ),
                    }),
                  )

                const entries = rawEntries.map((entry) => {
                  const full = path.resolve(root, entry.path)
                  const rel =
                    target.folder && !target.folder.isPrimary
                      ? path.join(target.folder.name, path.relative(target.folder.path, full))
                      : path.relative(location.directory, full)
                  return FileSystem.Entry.make({
                    ...entry,
                    path: RelativePath.make(rel),
                  })
                })

                const modelEntries = rawEntries.map((entry) => ({
                  ...entry,
                  path: path.resolve(root, entry.path),
                }))

                return {
                  entries: entries.slice(0, limit),
                  modelEntries: modelEntries.slice(0, limit),
                  truncated: rawEntries.length > limit,
                }
              }

              // Default search across workspace (path is undefined or ".")
              yield* permission.assert({
                action: name,
                resources: [input.pattern],
                save: ["*"],
                metadata: {
                  root: ".",
                  path: searchPath,
                  hidden: input.hidden,
                  limit: input.limit,
                },
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })

              // Single-root project fallback
              if (folders.length <= 1) {
                const root = location.directory
                const entries = yield* ripgrep
                  .glob({
                    cwd: root,
                    pattern: input.pattern,
                    hidden: input.hidden,
                    limit: limit + 1,
                  })
                  .pipe(
                    Effect.timeoutOrElse({
                      duration: FileSystem.DEFAULT_SEARCH_TIMEOUT_MS,
                      orElse: () =>
                        Effect.fail(
                          new ToolFailure({
                            message: `Search timed out after ${FileSystem.DEFAULT_SEARCH_TIMEOUT_MS / 1_000} seconds. Consider using a more specific path or pattern.`,
                          }),
                        ),
                    }),
                    Effect.map((result) =>
                      result.map((entry) =>
                        FileSystem.Entry.make({
                          ...entry,
                          path: RelativePath.make(path.relative(location.directory, path.resolve(root, entry.path))),
                        }),
                      ),
                    ),
                  )

                const modelEntries = entries.map((entry) => ({
                  ...entry,
                  path: path.resolve(location.directory, entry.path),
                }))

                return {
                  entries: entries.slice(0, limit),
                  modelEntries: modelEntries.slice(0, limit),
                  truncated: entries.length > limit,
                }
              }

              // Multi-folder search across all active attached roots
              const activeFolders: ProjectWorkspace.WorkspaceFolder[] = []
              const seenPaths = new Set<string>()

              for (const folder of folders) {
                if (folder.status !== "active") continue
                const resolved = FSUtil.resolve(folder.path)
                if (seenPaths.has(resolved)) continue
                seenPaths.add(resolved)

                const exists = yield* Environment.exists(environment.files, folder.path).pipe(
                  Effect.orElseSucceed(() => false),
                )
                if (!exists) continue

                activeFolders.push(folder)
              }

              // Filter out duplicate nested roots
              const searchRoots = activeFolders.filter(
                (candidate) =>
                  !activeFolders.some(
                    (other) => other !== candidate && FSUtil.contains(other.path, candidate.path),
                  ),
              )

              const collectedEntries: FileSystem.Entry[] = []
              const collectedModelEntries: Array<EncodedOutput[number]> = []
              let truncated = false

              for (const folder of searchRoots) {
                if (collectedEntries.length >= limit) {
                  truncated = true
                  break
                }
                const remainingLimit = limit - collectedEntries.length
                const folderEntries = yield* ripgrep
                  .glob({
                    cwd: folder.path,
                    pattern: input.pattern,
                    hidden: input.hidden,
                    limit: remainingLimit + 1,
                  })
                  .pipe(
                    Effect.timeoutOrElse({
                      duration: FileSystem.DEFAULT_SEARCH_TIMEOUT_MS,
                      orElse: () =>
                        Effect.fail(
                          new ToolFailure({
                            message: `Search timed out after ${FileSystem.DEFAULT_SEARCH_TIMEOUT_MS / 1_000} seconds. Consider using a more specific path or pattern.`,
                          }),
                        ),
                    }),
                    Effect.orElseSucceed(() => [] as typeof FileSystem.Entry.Type[]),
                  )

                if (folderEntries.length > remainingLimit) {
                  truncated = true
                }

                for (const entry of folderEntries.slice(0, remainingLimit)) {
                  const full = path.resolve(folder.path, entry.path)
                  const rel = folder.isPrimary
                    ? path.relative(folder.path, full)
                    : path.join(folder.name, path.relative(folder.path, full))

                  collectedEntries.push(
                    FileSystem.Entry.make({
                      ...entry,
                      path: RelativePath.make(rel),
                    }),
                  )
                  collectedModelEntries.push({ ...entry, path: full })
                }
              }

              return {
                entries: collectedEntries.slice(0, limit),
                modelEntries: collectedModelEntries.slice(0, limit),
                truncated,
              }
            }).pipe(
              Effect.map((result) => ({
                output: result.entries,
                content: toModelContent(result.modelEntries, result.truncated),
                metadata: { count: result.entries.length, truncated: result.truncated },
              })),
              Effect.mapError((error) =>
                error instanceof ToolFailure
                  ? error
                  : new ToolFailure({ message: `Unable to find files matching ${input.pattern}`, error }),
              ),
            ),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
