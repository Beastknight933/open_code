export * as GrepTool from "./grep.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { ToolFailure } from "@opencode/ai/effect"
import { Effect, Option, Schema } from "effect"
import path from "path"
import { FSUtil } from "@opencode/util/fs-util"
import type { ProjectWorkspace } from "@opencode/schema/project-workspace"
import { Environment } from "../../environment/index.js"
import { FileSystem } from "../../filesystem.js"
import { Location } from "../../location.js"
import { FileAccess } from "../../file-access.js"
import { Permission } from "../../permission.js"
import { Ripgrep } from "../../ripgrep.js"
import { RelativePath } from "../../schema.js"
import { MultiFolderWorkspace } from "../../workspace-manager/multi-folder.js"

export const name = "grep"

export const Input = Schema.Struct({
  pattern: FileSystem.GrepInput.fields.pattern
    .check(Schema.isMinLength(1, { message: "Pattern must not be empty" }))
    .annotate({
      description: "Regular expression or literal text to match in file contents.",
    }),
  path: Schema.optionalKey(RelativePath).annotate({
    description: "File or directory to search. Defaults to the current working directory.",
  }),
  include: FileSystem.GrepInput.fields.include.annotate({
    description: 'Glob pattern to filter files (for example, "*.js" or "*.{ts,tsx}")',
  }),
  literal: FileSystem.GrepInput.fields.literal.annotate({
    description: "Treat `pattern` as exact text instead of a regular expression (default: false).",
  }),
  caseSensitive: FileSystem.GrepInput.fields.caseSensitive.annotate({
    description: "Use case-sensitive matching (default: true).",
  }),
  limit: FileSystem.GrepInput.fields.limit.annotate({
    description: `Maximum number of matching lines to return (default: ${FileSystem.DEFAULT_SEARCH_LIMIT})`,
  }),
})

export const Output = Schema.Array(FileSystem.Match)
type EncodedOutput = typeof Output.Encoded

/** Format raw search matches into concise model content. */
export const toModelContent = (matches: EncodedOutput, truncated = false) => {
  const lines = matches.length === 0 ? ["No matches found"] : [`Found ${matches.length} matches`]
  let current = ""
  for (const match of matches) {
    if (current !== match.entry.path) {
      if (current) lines.push("")
      current = match.entry.path
      lines.push(`${match.entry.path}:`)
    }
    lines.push(`  Line ${match.line}: ${match.text}`)
  }
  if (truncated)
    lines.push(
      "",
      `(Results are truncated: showing first ${matches.length} results. Consider using a more specific path or pattern.)`,
    )
  return lines.join("\n")
}

/** Grep leaf that defaults its filesystem root to the active Location. */
export const Plugin = {
  id: "opencode.tool.grep",
  effect: Effect.fn("GrepTool.Plugin")(function* (ctx: Context) {
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
          description:
            "Search file contents using ripgrep's regular expression syntax or literal text matching. Use it to locate specific code, symbols, or text patterns, and narrow searches with `path` or `include`. Returns matching file paths, line numbers, and line previews.",
          input: Input,
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              const source = { type: "tool" as const, messageID: context.messageID, id: context.id }
              const folders = Option.isSome(mfwOption)
                ? yield* mfwOption.value.listFolders(location.project.id).pipe(Effect.orElseSucceed(() => []))
                : []

              const limit = input.limit ?? FileSystem.DEFAULT_SEARCH_LIMIT

              // Specific directory or file path requested
              if (input.path !== undefined && input.path !== ".") {
                const target = yield* access.resolve({ path: input.path })
                yield* access.authorizeExternal([target], context)
                yield* permission.assert({
                  action: name,
                  resources: [input.pattern],
                  save: ["*"],
                  metadata: {
                    root: ".",
                    path: input.path,
                    include: input.include,
                    literal: input.literal,
                    caseSensitive: input.caseSensitive,
                    limit: input.limit,
                  },
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })
                const root = target.absolute
                const type = yield* Environment.typeFollowing(environment.files, root).pipe(
                  Effect.catchTag("Environment.NotFound", () =>
                    Effect.fail(new ToolFailure({ message: `Search path does not exist: ${input.path ?? "."}` })),
                  ),
                )
                const cwd = type === "directory" ? root : path.dirname(root)
                const rawMatches = yield* ripgrep
                  .grep({
                    cwd,
                    pattern: input.pattern,
                    file: type === "file" ? path.basename(root) : undefined,
                    include: input.include,
                    literal: input.literal,
                    caseSensitive: input.caseSensitive,
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

                const matches = rawMatches.map((match) => {
                  const full = path.resolve(cwd, match.entry.path)
                  const rel =
                    target.folder && !target.folder.isPrimary
                      ? path.join(target.folder.name, path.relative(target.folder.path, full))
                      : path.relative(location.directory, full)
                  return FileSystem.Match.make({
                    ...match,
                    entry: FileSystem.Entry.make({
                      ...match.entry,
                      path: RelativePath.make(rel),
                    }),
                  })
                })

                const modelMatches = rawMatches.map((match) => ({
                  ...match,
                  entry: { ...match.entry, path: path.resolve(cwd, match.entry.path) },
                }))

                return {
                  matches: matches.slice(0, limit),
                  modelMatches: modelMatches.slice(0, limit),
                  truncated: rawMatches.length > limit,
                }
              }

              // Default search across workspace (path is undefined or ".")
              yield* permission.assert({
                action: name,
                resources: [input.pattern],
                save: ["*"],
                metadata: {
                  root: ".",
                  path: input.path,
                  include: input.include,
                  literal: input.literal,
                  caseSensitive: input.caseSensitive,
                  limit: input.limit,
                },
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })

              // Single-root project fallback
              if (folders.length <= 1) {
                const root = location.directory
                const cwd = root
                const matches = yield* ripgrep
                  .grep({
                    cwd,
                    pattern: input.pattern,
                    include: input.include,
                    literal: input.literal,
                    caseSensitive: input.caseSensitive,
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
                      result.map((match) =>
                        FileSystem.Match.make({
                          ...match,
                          entry: FileSystem.Entry.make({
                            ...match.entry,
                            path: RelativePath.make(
                              path.relative(location.directory, path.resolve(cwd, match.entry.path)),
                            ),
                          }),
                        }),
                      ),
                    ),
                  )

                const modelMatches = matches.map((match) => ({
                  ...match,
                  entry: { ...match.entry, path: path.resolve(location.directory, match.entry.path) },
                }))

                return {
                  matches: matches.slice(0, limit),
                  modelMatches: modelMatches.slice(0, limit),
                  truncated: matches.length > limit,
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

              const collectedMatches: FileSystem.Match[] = []
              const collectedModelMatches: Array<EncodedOutput[number]> = []
              let truncated = false

              for (const folder of searchRoots) {
                if (collectedMatches.length >= limit) {
                  truncated = true
                  break
                }
                const remainingLimit = limit - collectedMatches.length
                const folderMatches = yield* ripgrep
                  .grep({
                    cwd: folder.path,
                    pattern: input.pattern,
                    include: input.include,
                    literal: input.literal,
                    caseSensitive: input.caseSensitive,
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
                    Effect.orElseSucceed(() => [] as typeof FileSystem.Match.Type[]),
                  )

                if (folderMatches.length > remainingLimit) {
                  truncated = true
                }

                for (const match of folderMatches.slice(0, remainingLimit)) {
                  const full = path.resolve(folder.path, match.entry.path)
                  const rel = folder.isPrimary
                    ? path.relative(folder.path, full)
                    : path.join(folder.name, path.relative(folder.path, full))

                  collectedMatches.push(
                    FileSystem.Match.make({
                      ...match,
                      entry: FileSystem.Entry.make({
                        ...match.entry,
                        path: RelativePath.make(rel),
                      }),
                    }),
                  )
                  collectedModelMatches.push({
                    ...match,
                    entry: { ...match.entry, path: full },
                  })
                }
              }

              return {
                matches: collectedMatches.slice(0, limit),
                modelMatches: collectedModelMatches.slice(0, limit),
                truncated,
              }
            }).pipe(
              Effect.map((result) => ({
                output: result.matches,
                content: toModelContent(result.modelMatches, result.truncated),
                metadata: { matches: result.matches.length, truncated: result.truncated },
              })),
              Effect.mapError((error) =>
                error instanceof ToolFailure
                  ? error
                  : error instanceof Ripgrep.InvalidPatternError
                    ? new ToolFailure({ message: `Invalid regex pattern: ${error.message}` })
                    : new ToolFailure({ message: `Unable to grep for ${input.pattern}`, error }),
              ),
            ),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
