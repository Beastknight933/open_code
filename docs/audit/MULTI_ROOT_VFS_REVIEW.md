# Multi-Root Virtual Filesystem: Code Review & Security Remediation (Task 2.1)

**Repository**: `open_code`  
**Reviewer**: Antigravity Technical Pair Programmer  
**Date**: October 31, 2026  
**Final Assessment**: **Approved and Verified** (All Security Remediation & Regression Tests Passing)

---

## 1. Executive Summary

This document presents the definitive code review, security remediation, and test verification for **Stage 2 — Task 2.1: Complete Multi-Root Virtual Filesystem Integration**.

Following the initial implementation review, a critical directory traversal vulnerability, a medium-priority directory collision edge case, and intermediate directory symlink considerations were identified. A targeted security remediation was authorized, implemented in [`packages/core/src/file-access.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/file-access.ts), and verified across 22 comprehensive integration test scenarios with zero regressions across the codebase.

---

## 2. Files Changed

All modifications were strictly constrained to the authorized scope:

| File | Status | Description |
|---|:---:|---|
| [`packages/core/src/file-access.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/file-access.ts) | Modified | Dynamic multi-root resolution, traversal containment validation, collision prevention, intermediate symlink detection, and single-root backwards compatibility. |
| [`packages/core/src/filesystem/search.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/filesystem/search.ts) | Modified | Extended fuzzy search ripgrep indexer to scan across all attached folders and prefix secondary root entries. |
| [`packages/core/src/tool/plugin/read.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/read.ts) | Modified | Bounded upward directory walk for `AGENTS.md` to the target folder root. |
| [`packages/core/src/tool/plugin/write.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/write.ts) | Modified | Direct pass-through of `ToolFailure` to expose traversal, collision, and ambiguity errors to the agent. |
| [`packages/core/src/tool/plugin/edit.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/edit.ts) | Modified | Serializes mutations by acquiring transaction locks on canonical resolved `target.absolute`. |
| [`packages/core/src/tool/plugin/patch.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/patch.ts) | Modified | Pre-resolves all hunk targets (`main` and `move`) and locks all touched paths before applying changes. |
| [`packages/core/src/tool/plugin/glob.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/glob.ts) | Modified | Multi-root search across active folders, duplicate physical directory deduplication, nested root pruning, root-qualified paths. |
| [`packages/core/src/tool/plugin/grep.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/grep.ts) | Modified | Multi-root content search across active folders, duplicate physical directory deduplication, nested root pruning, root-qualified match entries. |
| [`packages/core/test/workspace-manager/multi-root-vfs.test.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/test/workspace-manager/multi-root-vfs.test.ts) | Modified | Comprehensive 22-scenario integration test suite covering security, resolution, permissions, symlinks, and regressions. |
| [`docs/DEVELOPMENT_ROADMAP.md`](file:///c:/Users/gaumi/Documents/GitHub/open_code/docs/DEVELOPMENT_ROADMAP.md) | Modified | Marked Task 2.1 as completed with security verification details. |
| [`docs/FEATURE_STATUS_MATRIX.md`](file:///c:/Users/gaumi/Documents/GitHub/open_code/docs/FEATURE_STATUS_MATRIX.md) | Modified | Updated Multi-Root Tool VFS Path Resolution to Status 1. |
| [`docs/TECHNICAL_RISKS.md`](file:///c:/Users/gaumi/Documents/GitHub/open_code/docs/TECHNICAL_RISKS.md) | Modified | Marked RISK-03 (Secondary Workspace Roots Invisible) as Resolved. |

---

## 3. Original Findings & Root Cause Analysis

### 3.1 Critical Finding: Unqualified Relative Path Traversal
- **Symptom**: Relative paths containing `../` segments that did not begin with `..` (such as `nested/../../../../escape.txt`) escaped the primary workspace root without triggering `externalDirectory` authorization.
- **Root Cause**: In Case 4 of `FileAccess.resolve`, when an unqualified path did not match any existing file in any active root, the code defaulted to:
  ```ts
  const candidate = AbsolutePath.make(path.resolve(primaryFolder.path, normalized))
  return { absolute: candidate, resource: slash(...), folder: primaryFolder }
  ```
  `candidate` was not validated with `FSUtil.contains(primaryFolder.path, candidate)`. If `normalized` contained traversal segments escaping `primaryFolder.path`, it resolved to an unauthorized external path while silently classifying it as internal, bypassing user approval prompts.

### 3.2 Medium Finding: Primary Subdirectory Collision on Non-Existent Targets
- **Symptom**: If the primary workspace contained an existing `backend/` directory, and a secondary attached root was also named `backend`, resolving `backend/new-file.ts` (where the file did not yet exist) silently routed the write to the secondary root.
- **Root Cause**: Collision detection checked `exists(primaryCandidate) && exists(candidate)`. When `new-file.ts` was not yet created, this condition evaluated to `false`, causing the resolver to assume the secondary root was explicitly intended rather than flagging the naming ambiguity.

### 3.3 Low Finding: Leaf-Only Symlink Verification
- **Symptom**: Symlink containment was only checked when `files.stat(candidate)?.type === "symlink"`.
- **Root Cause**: If an intermediate directory in the path hierarchy was a symlink pointing outside the workspace (e.g. `/workspace/symlink_dir/file.txt` where `symlink_dir -> /external`), `files.stat` on `file.txt` returned `{ type: "file" }`, completely bypassing the symlink escape check.

---

## 4. Exact Remediation Implemented

The following fixes were implemented directly in [`packages/core/src/file-access.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/file-access.ts):

### 4.1 Traversal Containment Guard (Case 4)
In Case 4, candidate paths are strictly checked against `primaryFolder.path` using `FSUtil.contains`. If the path traverses outside `primaryFolder.path`, the resolver checks whether it resolves into any other active workspace folder or valid worktree. If not, it fails immediately with a deterministic `ToolFailure`:
```ts
const candidate = AbsolutePath.make(path.resolve(primaryFolder.path, normalized))
if (!FSUtil.contains(primaryFolder.path, candidate)) {
  const matchingFolder = folders.find((f) => f.status === "active" && FSUtil.contains(f.path, candidate))
  const inWorktree = isWorktreeValid && FSUtil.contains(worktree, candidate)
  if (matchingFolder || inWorktree) {
    const activeFolder = matchingFolder ?? primaryFolder
    yield* checkSymlinkEscape(candidate, input.path, folders, worktree, isWorktreeValid)
    return {
      absolute: candidate,
      resource: activeFolder.isPrimary
        ? slash(path.relative(activeFolder.path, candidate) || ".")
        : slash(path.join(activeFolder.name, path.relative(activeFolder.path, candidate))),
      folder: activeFolder,
    } satisfies Target
  }
  return yield* Effect.fail(
    new ToolFailure({
      message: `Path traversal detected: "${input.path}" escapes authorized workspace roots.`,
    }),
  )
}
```

### 4.2 Deterministic Collision & Duplicate Folder Ambiguity Handling
- **Directory Collision**: If `firstSegment` matches a secondary folder name, the resolver checks if the primary root contains an entry matching `firstSegment`. If so, it rejects ambiguous qualification with actionable options:
  ```ts
  const primaryPrefixExists =
    FSUtil.contains(primaryFolder.path, primaryPrefixCandidate) && (yield* exists(primaryPrefixCandidate))
  if (primaryPrefixExists && isNameMatch) {
    return yield* Effect.fail(
      new ToolFailure({
        message: `Ambiguous path "${input.path}" matches both secondary workspace folder "${rootQualifiedFolder.name}" and existing directory in primary folder "${primaryFolder.name}". Please qualify explicitly using "${primaryFolder.name}/${normalized}" for primary or "${rootQualifiedFolder.id}/${subpath || "."}" for secondary.`,
      }),
    )
  }
  ```
- **Duplicate Folder Names**: If two attached roots share the exact same name, name-based qualification is rejected with an error instructing the caller to prefix using the unique `folder.id`.

### 4.3 Recursive Canonical Symlink Containment
Replaced leaf-only `stat.type === "symlink"` checks with `checkSymlinkEscape`, which traverses up to the deepest existing filesystem component and validates its canonical destination via `FSUtil.resolve`:
```ts
const checkSymlinkEscape = (candidate: AbsolutePath, inputPath: string, ...) =>
  Effect.gen(function* () {
    let existing: string = candidate
    while (existing !== path.parse(existing).root && !(yield* exists(existing))) {
      const parent = path.dirname(existing)
      if (parent === existing) break
      existing = parent
    }
    const real = FSUtil.resolve(existing)
    const isAuthorized =
      folders.some((f) => f.status === "active" && (FSUtil.contains(f.path, real) || FSUtil.contains(FSUtil.resolve(f.path), real))) ||
      (isWorktreeValid && (FSUtil.contains(worktree, real) || FSUtil.contains(FSUtil.resolve(worktree), real)))
    if (!isAuthorized) {
      return yield* Effect.fail(
        new ToolFailure({
          message: `Access denied: path "${inputPath}" resolves through symlink to "${real}", which is outside all authorized workspace roots.`,
        }),
      )
    }
  })
```
This guarantees that both leaf symlinks and intermediate directory symlinks (whether the target file exists or is being created) are validated before any tool operation executes.

---

## 5. Test Coverage Verification

The integration test suite in [`packages/core/test/workspace-manager/multi-root-vfs.test.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/test/workspace-manager/multi-root-vfs.test.ts) was expanded from 14 to **22 scenarios**:

| # | Test Scenario Category | Scenario Description | Result |
|---|---|---|:---:|
| 1 | Baseline Resolution | Read from primary root | **PASS** |
| 2 | Baseline Resolution | Read from secondary root (unqualified when unique) | **PASS** |
| 3 | Mutation | Write to secondary root (root-qualified) | **PASS** |
| 4 | Mutation | Edit file in secondary root | **PASS** |
| 5 | Mutation | Apply patch to file in secondary root | **PASS** |
| 6 | Discovery | Glob across multiple roots (results grouped/prefixed) | **PASS** |
| 7 | Discovery | Grep across multiple roots | **PASS** |
| 8 | Ambiguity | Duplicate relative paths (ambiguity error with candidates) | **PASS** |
| 9 | Explicit Qualification | Explicit root-qualified paths (`<rootName>/<path>`) | **PASS** |
| 10 | Security | Path traversal attempts (`../` outside roots rejected) | **PASS** |
| 11 | Security | Leaf symlink escape attempts rejected | **PASS** |
| 12 | Fault Tolerance | Detached / missing folder handled gracefully in search | **PASS** |
| 13 | Deduplication | Duplicate physical directory detection | **PASS** |
| 14 | Regression | Single-root project 100% backwards compatible | **PASS** |
| 15 | **Critical Security** | **Unqualified traversal (`nested/../../escape.txt`) rejected across `read`, `write`, `edit`, `patch`** | **PASS** |
| 16 | **Collision Handling** | **Primary/secondary directory name collision on nonexistent target rejected** | **PASS** |
| 17 | **Disambiguation** | **Explicit root-name (`frontend/backend/...`) and folder-ID (`f_sec/...`) addressing** | **PASS** |
| 18 | **Disambiguation** | **Duplicate folder names reject name addressing and require folder ID** | **PASS** |
| 19 | **Cross-Platform** | **Windows-style backslash input paths (`backend\src\service.ts`) resolve correctly** | **PASS** |
| 20 | **Permissions** | **Permission denial for mutation in secondary root preserves file untouched** | **PASS** |
| 21 | **Symlink Security** | **Intermediate directory symlink pointing outside rejected for read & write** | **PASS** |
| 22 | **Hierarchy** | **Nested attached workspace roots avoid duplicate search hits** | **PASS** |

---

## 6. Actual Verification Results

### 6.1 Multi-Root VFS Integration Test Suite
```bash
cd packages/core; bun test test/workspace-manager/multi-root-vfs.test.ts
```
- **Exit Code**: `0`
- **Output**: `22 pass, 0 fail, 95 expect() calls` (4.36s).

### 6.2 Native Tool Test Suites (`read`, `write`, `edit`, `patch`, `search`)
```bash
cd packages/core; bun test test/tool-read.test.ts test/tool-write.test.ts test/tool-edit.test.ts test/tool-patch.test.ts test/tool-search.test.ts
```
- **Exit Code**: `0`
- **Output**: `118 pass, 0 fail, 394 expect() calls` (9.03s).

### 6.3 Workspace-Manager Test Suite
```bash
cd packages/core; bun test test/workspace-manager/
```
- **Exit Code**: `0`
- **Output**: `29 pass, 0 fail, 213 expect() calls` (4.94s).

### 6.4 Core Package Typecheck
```bash
cd packages/core; bun typecheck
```
- **Exit Code**: `0`
- **Output**: `✓ No type errors in 1,896 files across 2 projects` (5.83s).

### 6.5 Repository-Wide Lint & Typecheck
```bash
bun run check
```
- **Exit Code**: `0`
- **Output**: `Tasks: 35 successful, 35 total` (Full turbo monorepo check clean).

---

## 7. Remaining Limitations (Documented Transparently)

1. **User-Space TOCTOU Inherent to Runtime**:
   Because Node.js and Bun operate on string paths rather than descriptor-pinned atomic operations (`openat2(..., RESOLVE_BENEATH)`), concurrent external processes modifying the filesystem between path resolution and write cannot be completely blocked by application-level code. OpenCode mitigates internal concurrency via `FileMutation.withLock`, which serializes mutations across all cooperating sessions on canonical resolved paths.
2. **Duplicate Folder Name Disambiguation**:
   When multiple roots share the same base name (e.g. two repositories named `service`), the agent must use the folder ID prefix (`<folderId>/<path>`) rather than the folder name.
3. **TUI Single-Directory Breadcrumbs**:
   While the core agent tools and backend virtual filesystem support arbitrary multi-root topologies, the TUI frontend currently retains a single active root breadcrumb. Multi-folder tree explorer UI in the TUI remains scheduled for a future TUI enhancement stage.

---

## 8. Final Assessment: **Approved and Verified**

All security defects and architectural gaps identified during the initial code review have been remediated. The Multi-Root Virtual Filesystem implementation is robust, adheres to all project design principles and Git safety boundaries, and is fully verified across 22 integration scenarios, 118 native tool tests, and repository-wide checks with zero regressions.
