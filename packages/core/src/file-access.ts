export * as FileAccess from "./file-access.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { FSUtil } from "@opencode/util/fs-util"
import { Global } from "@opencode/util/global"
import { Array, Context, Effect, Layer, Option, Schema } from "effect"
import path from "path"
import { ToolFailure } from "@opencode/ai/effect"
import type { ProjectWorkspace } from "@opencode/schema/project-workspace"
import { Environment } from "./environment/index.js"
import { Location } from "./location.js"
import { Permission } from "./permission.js"
import { Project } from "./project.js"
import { AbsolutePath } from "./schema.js"
import type { SessionErrors } from "./session/error.js"
import type { Tool } from "./tool.js"
import { MultiFolderWorkspace } from "./workspace-manager/multi-folder.js"

export const Kind = Schema.Literals(["file", "directory"])
export type Kind = typeof Kind.Type

export const ResolveInput = Schema.Struct({
  path: Schema.String,
  /** Selects the external approval boundary; it does not validate the target type. */
  kind: Kind.pipe(Schema.optional),
})
export type ResolveInput = typeof ResolveInput.Type

export class AmbiguousPathError extends Schema.TaggedError<AmbiguousPathError>()("FileAccess.AmbiguousPathError", {
  path: Schema.String,
  candidates: Schema.Array(
    Schema.Struct({
      folderName: Schema.String,
      folderId: Schema.String,
      path: Schema.String,
    }),
  ),
}) {
  override get message() {
    const formatted = this.candidates.map((c) => `"${c.folderName}/${this.path}" (${c.path})`).join(", ")
    return `Ambiguous path "${this.path}" matches multiple workspace folders. Please specify the folder name as a prefix: ${formatted}`
  }
}

export class PathTraversalError extends Schema.TaggedError<PathTraversalError>()("FileAccess.PathTraversalError", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `Access denied for path "${this.path}": ${this.reason}`
  }
}

export interface ExternalDirectoryAuthorization {
  readonly action: "external_directory"
  /** Lexical directory used as the external approval boundary. */
  readonly directory: AbsolutePath
  readonly resource: string
  readonly save: string
}

export interface Target {
  readonly absolute: AbsolutePath
  /** Location-relative for internal paths, absolute for external paths. */
  readonly resource: string
  readonly externalDirectory?: ExternalDirectoryAuthorization
  /** The workspace folder this target belongs to, if resolved within a workspace folder */
  readonly folder?: ProjectWorkspace.WorkspaceFolder
}

export type Invocation = Pick<Tool.Context, "sessionID" | "agent" | "messageID" | "id">

export interface ReadOptions {
  /** A target already authorized by this invocation, used for filename recovery. */
  readonly siblingOf: Target
}

export interface Interface {
  /** Resolve a lexical path and its permission resources, without requesting approval. */
  readonly resolve: (input: ResolveInput) => Effect.Effect<Target, Environment.Failed | ToolFailure>
  /** Approve external directories in one batch, preserving first-seen resource order. */
  readonly authorizeExternal: (
    targets: readonly Target[],
    context: Invocation,
    metadata?: Permission.AssertInput["metadata"],
  ) => Effect.Effect<void, Permission.Error | SessionErrors.NotFoundError>
  /** Resolve a read target and obtain external-directory approval before read approval. */
  readonly authorizeRead: (
    file: string,
    context: Invocation,
    options?: ReadOptions,
  ) => Effect.Effect<Target, Environment.Failed | Permission.Error | SessionErrors.NotFoundError | ToolFailure>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/FileAccess") {}

/** Expand a leading ~ and normalize Windows shell paths before lexical resolution. */
export const resolvePath = (directory: string, input: string, home = Global.Path.home) => {
  const normalized = FSUtil.windowsPath(input)
  return path.resolve(
    directory,
    normalized === "~"
      ? home
      : normalized.startsWith("~/") || (process.platform === "win32" && normalized.startsWith("~\\"))
        ? path.join(home, normalized.slice(2))
        : normalized,
  )
}

const slash = (value: string) => value.replaceAll("\\", "/")
const invocation = (context: Invocation) => ({
  sessionID: context.sessionID,
  agent: context.agent,
  source: { type: "tool" as const, messageID: context.messageID, id: context.id },
})

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { files } = yield* Environment.Service
    const exists = (file: string) => Environment.exists(files, file)
    const location = yield* Location.Service
    const permission = yield* Permission.Service
    const mfwOption = yield* Effect.serviceOption(MultiFolderWorkspace.Service)

    const resolve = Effect.fn("FileAccess.resolve")(function* (input: ResolveInput) {
      const folders = Option.isSome(mfwOption)
        ? yield* mfwOption.value.listFolders(location.project.id).pipe(Effect.orElseSucceed(() => []))
        : []

      const worktree = path.resolve(location.project.directory)
      const isWorktreeValid = worktree !== path.parse(worktree).root

      // Single-root fallback when no secondary workspace folders are attached
      if (folders.length <= 1) {
        const absolute = AbsolutePath.make(resolvePath(location.directory, input.path))
        const internal =
          FSUtil.contains(location.directory, absolute) ||
          (isWorktreeValid && FSUtil.contains(worktree, absolute))
        if (internal) {
          return {
            absolute,
            resource: slash(path.relative(location.directory, absolute) || "."),
          } satisfies Target
        }
        const type =
          input.kind ??
          (yield* Environment.typeFollowing(files, absolute).pipe(
            Effect.catchTag("Environment.NotFound", () => Effect.undefined),
          ))
        const directory = AbsolutePath.make(type === "directory" ? absolute : path.dirname(absolute))
        return {
          absolute,
          resource: slash(absolute),
          externalDirectory: {
            action: "external_directory",
            directory,
            resource: slash(path.join(directory, "*")),
            save: slash(path.join((yield* Project.root({ exists }, directory)) ?? directory, "*")),
          },
        } satisfies Target
      }

      // Multi-folder workspace resolution
      const primaryFolder = folders.find((f) => f.isPrimary) ?? {
        id: "primary",
        projectID: location.project.id,
        path: location.directory,
        name: path.basename(location.directory) || "primary",
        isPrimary: true,
        status: "active" as const,
        addedAt: 0,
      }

      const raw = FSUtil.windowsPath(input.path)
      const isHome = raw === "~" || raw.startsWith("~/") || (process.platform === "win32" && raw.startsWith("~\\"))
      const isAbsolute =
        !isHome && (path.isAbsolute(raw) || (process.platform === "win32" && /^[a-zA-Z]:[\\/]/.test(raw)))

      // Case 1: Absolute path or home-relative path
      if (isAbsolute || isHome) {
        const absolute = AbsolutePath.make(resolvePath(location.directory, input.path))
        const matchingFolder = folders.find((f) => f.status === "active" && FSUtil.contains(f.path, absolute))
        const inWorktree = isWorktreeValid && FSUtil.contains(worktree, absolute)

        if (matchingFolder || inWorktree) {
          // Symlink escape check: ensure realpath doesn't point outside all authorized workspace folders
          const stat = yield* files.stat(absolute).pipe(Effect.orElseSucceed(() => undefined))
          if (stat?.type === "symlink") {
            const real = FSUtil.resolve(absolute)
            const escapes =
              !folders.some((f) => f.status === "active" && FSUtil.contains(f.path, real)) &&
              !(isWorktreeValid && FSUtil.contains(worktree, real))
            if (escapes) {
              return yield* Effect.fail(
                new ToolFailure({
                  message: `Access denied: symlink "${input.path}" resolves to "${real}", which is outside all authorized workspace roots.`,
                }),
              )
            }
          }

          const activeFolder = matchingFolder ?? primaryFolder
          const resource = activeFolder.isPrimary
            ? slash(path.relative(activeFolder.path, absolute) || ".")
            : slash(path.join(activeFolder.name, path.relative(activeFolder.path, absolute)))
          return {
            absolute,
            resource,
            folder: activeFolder,
          } satisfies Target
        }

        // External absolute path
        const type =
          input.kind ??
          (yield* Environment.typeFollowing(files, absolute).pipe(
            Effect.catchTag("Environment.NotFound", () => Effect.undefined),
          ))
        const directory = AbsolutePath.make(type === "directory" ? absolute : path.dirname(absolute))
        return {
          absolute,
          resource: slash(absolute),
          externalDirectory: {
            action: "external_directory",
            directory,
            resource: slash(path.join(directory, "*")),
            save: slash(path.join((yield* Project.root({ exists }, directory)) ?? directory, "*")),
          },
        } satisfies Target
      }

      // Case 2: Relative path starting with lexical escape (e.g. "../outside.txt")
      if (raw === ".." || raw.startsWith("../") || (process.platform === "win32" && raw.startsWith("..\\"))) {
        const lexicallyResolved = AbsolutePath.make(path.resolve(location.directory, raw))
        const matchingFolder = folders.find(
          (f) => f.status === "active" && FSUtil.contains(f.path, lexicallyResolved),
        )
        const inWorktree = isWorktreeValid && FSUtil.contains(worktree, lexicallyResolved)

        if (matchingFolder || inWorktree) {
          const activeFolder = matchingFolder ?? primaryFolder
          const resource = activeFolder.isPrimary
            ? slash(path.relative(activeFolder.path, lexicallyResolved) || ".")
            : slash(path.join(activeFolder.name, path.relative(activeFolder.path, lexicallyResolved)))
          return {
            absolute: lexicallyResolved,
            resource,
            folder: activeFolder,
          } satisfies Target
        }

        const type =
          input.kind ??
          (yield* Environment.typeFollowing(files, lexicallyResolved).pipe(
            Effect.catchTag("Environment.NotFound", () => Effect.undefined),
          ))
        const directory = AbsolutePath.make(type === "directory" ? lexicallyResolved : path.dirname(lexicallyResolved))
        return {
          absolute: lexicallyResolved,
          resource: slash(lexicallyResolved),
          externalDirectory: {
            action: "external_directory",
            directory,
            resource: slash(path.join(directory, "*")),
            save: slash(path.join((yield* Project.root({ exists }, directory)) ?? directory, "*")),
          },
        } satisfies Target
      }

      // Case 3: Relative path - check root-qualified prefix
      const normalized = raw.replaceAll("\\", "/").replace(/^\.\//, "")
      const segments = normalized.split("/")
      const firstSegment = segments[0]
      const subpath = segments.slice(1).join("/")

      const matchFolder = (f: ProjectWorkspace.WorkspaceFolder) => {
        if (process.platform === "win32") {
          return (
            f.name.toLowerCase() === firstSegment.toLowerCase() ||
            f.id.toLowerCase() === firstSegment.toLowerCase()
          )
        }
        return f.name === firstSegment || f.id === firstSegment
      }
      const rootQualifiedFolder = folders.find(matchFolder)

      if (rootQualifiedFolder) {
        const targetSubpath = subpath === "" ? "." : subpath
        const candidate = AbsolutePath.make(path.resolve(rootQualifiedFolder.path, targetSubpath))

        // Guard against traversal escaping the qualified folder
        if (!FSUtil.contains(rootQualifiedFolder.path, candidate)) {
          return yield* Effect.fail(
            new ToolFailure({
              message: `Path traversal detected: "${input.path}" escapes workspace folder "${rootQualifiedFolder.name}".`,
            }),
          )
        }

        if (rootQualifiedFolder.status === "missing" || !(yield* exists(rootQualifiedFolder.path))) {
          return yield* Effect.fail(
            new ToolFailure({
              message: `Workspace folder "${rootQualifiedFolder.name}" (${rootQualifiedFolder.path}) is missing or inaccessible.`,
            }),
          )
        }

        // Check collision: if not primary, does the path also exist inside primary?
        if (!rootQualifiedFolder.isPrimary) {
          const primaryCandidate = AbsolutePath.make(path.resolve(primaryFolder.path, normalized))
          if (
            FSUtil.contains(primaryFolder.path, primaryCandidate) &&
            (yield* exists(primaryCandidate)) &&
            (yield* exists(candidate))
          ) {
            return yield* Effect.fail(
              new ToolFailure({
                message: `Ambiguous path "${input.path}" matches both folder "${rootQualifiedFolder.name}" and file/directory in "${primaryFolder.name}". Please qualify explicitly.`,
              }),
            )
          }
        }

        // Symlink escape check
        const stat = yield* files.stat(candidate).pipe(Effect.orElseSucceed(() => undefined))
        if (stat?.type === "symlink") {
          const real = FSUtil.resolve(candidate)
          const escapes =
            !folders.some((f) => f.status === "active" && FSUtil.contains(f.path, real)) &&
            !(isWorktreeValid && FSUtil.contains(worktree, real))
          if (escapes) {
            return yield* Effect.fail(
              new ToolFailure({
                message: `Access denied: symlink "${input.path}" resolves to "${real}", which is outside all authorized workspace roots.`,
              }),
            )
          }
        }

        const resource = rootQualifiedFolder.isPrimary
          ? slash(path.relative(rootQualifiedFolder.path, candidate) || ".")
          : slash(
              path.relative(rootQualifiedFolder.path, candidate)
                ? path.join(rootQualifiedFolder.name, path.relative(rootQualifiedFolder.path, candidate))
                : rootQualifiedFolder.name,
            )

        return {
          absolute: candidate,
          resource,
          folder: rootQualifiedFolder,
        } satisfies Target
      }

      // Case 4: Unqualified relative path - search across active folders
      const activeFolders = folders.filter((f) => f.status === "active")
      const existingMatches: Array<{ folder: ProjectWorkspace.WorkspaceFolder; absolute: AbsolutePath }> = []

      for (const folder of activeFolders) {
        const candidate = AbsolutePath.make(path.resolve(folder.path, normalized))
        if (FSUtil.contains(folder.path, candidate)) {
          if (yield* exists(candidate)) {
            existingMatches.push({ folder, absolute: candidate })
          }
        }
      }

      // Ambiguity detected: file exists in multiple roots
      if (existingMatches.length > 1) {
        return yield* Effect.fail(
          new ToolFailure({
            message: `Ambiguous path "${input.path}" exists in multiple workspace folders: ${existingMatches
              .map((m) => `"${m.folder.name}/${normalized}" (${m.absolute})`)
              .join(", ")}. Please specify the folder name as a prefix (e.g. "${existingMatches[0].folder.name}/${normalized}").`,
          }),
        )
      }

      // Unique match in a single folder
      if (existingMatches.length === 1) {
        const match = existingMatches[0]

        // Symlink escape check
        const stat = yield* files.stat(match.absolute).pipe(Effect.orElseSucceed(() => undefined))
        if (stat?.type === "symlink") {
          const real = FSUtil.resolve(match.absolute)
          const escapes =
            !folders.some((f) => f.status === "active" && FSUtil.contains(f.path, real)) &&
            !(isWorktreeValid && FSUtil.contains(worktree, real))
          if (escapes) {
            return yield* Effect.fail(
              new ToolFailure({
                message: `Access denied: symlink "${input.path}" resolves to "${real}", which is outside all authorized workspace roots.`,
              }),
            )
          }
        }

        const resource = match.folder.isPrimary
          ? slash(path.relative(match.folder.path, match.absolute) || ".")
          : slash(path.join(match.folder.name, path.relative(match.folder.path, match.absolute)))

        return {
          absolute: match.absolute,
          resource,
          folder: match.folder,
        } satisfies Target
      }

      // File does not exist anywhere - default to primary folder (for writing new files or failing on read)
      const candidate = AbsolutePath.make(path.resolve(primaryFolder.path, normalized))
      return {
        absolute: candidate,
        resource: slash(path.relative(primaryFolder.path, candidate) || "."),
        folder: primaryFolder,
      } satisfies Target
    })

    const authorizeExternal = Effect.fn("FileAccess.authorizeExternal")(function* (
      targets: readonly Target[],
      context: Invocation,
      metadata?: Permission.AssertInput["metadata"],
    ) {
      const external = Array.dedupeWith(
        targets.flatMap((target) => (target.externalDirectory ? [target.externalDirectory] : [])),
        (left, right) => left.resource === right.resource,
      )
      if (external.length === 0) return
      yield* permission.assert({
        action: "external_directory",
        resources: external.map((item) => item.resource),
        save: external.map((item) => item.save),
        ...(metadata === undefined ? {} : { metadata }),
        ...invocation(context),
      })
    })

    const authorizeRead = Effect.fn("FileAccess.authorizeRead")(function* (
      file: string,
      context: Invocation,
      options?: ReadOptions,
    ) {
      const target = yield* resolve({ path: file, kind: options ? "file" : undefined })
      const sibling = options && path.dirname(target.absolute) === path.dirname(options.siblingOf.absolute)

      // Filename recovery shares the directory approval, but checks the recovered file's own read rules.
      if (!sibling) yield* authorizeExternal([target], context)
      yield* permission.assert({
        action: "read",
        resources: [target.resource],
        save: ["*"],
        ...invocation(context),
      })
      return target
    })

    return Service.of({ resolve, authorizeExternal, authorizeRead })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Environment.node, Location.node, Permission.node],
})
