# Independent Code Review: Multi-Root Virtual Filesystem (Stage 2 — Task 2.1)

**Repository**: `open_code`  
**Reviewer**: Antigravity Technical Pair Programmer  
**Date**: October 31, 2026  
**Status**: Requires changes (Security Defect Identified in Unqualified Path Traversal)

---

## 1. Files Changed

The changes are strictly confined to the multi-root filesystem implementation, tool integration, test verification, and status documentation:

| File | Change Type | Purpose |
|---|:---:|---|
| [`packages/core/src/file-access.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/file-access.ts) | Modified | Dynamic multi-root resolution, ambiguity detection, root-qualified path handling, and security traversal checks. |
| [`packages/core/src/filesystem/search.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/filesystem/search.ts) | Modified | Extended fuzzy search indexer to scan across all active workspace folders and prefix secondary root entries. |
| [`packages/core/src/tool/plugin/read.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/read.ts) | Modified | Bounded `AGENTS.md` upward walk to target workspace folder root. |
| [`packages/core/src/tool/plugin/write.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/write.ts) | Modified | Preserved `ToolFailure` directly so ambiguity, traversal, and permission errors bubble cleanly to the model. |
| [`packages/core/src/tool/plugin/edit.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/edit.ts) | Modified | Transaction lock and file read/write operate on resolved `target.absolute`. |
| [`packages/core/src/tool/plugin/patch.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/patch.ts) | Modified | Pre-resolves all hunk targets prior to execution and locks all affected targets (`main.absolute`, `move.absolute`). |
| [`packages/core/src/tool/plugin/glob.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/glob.ts) | Modified | Multi-root search across active folders, duplicate physical directory deduplication, nested root pruning, root-qualified paths. |
| [`packages/core/src/tool/plugin/grep.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/grep.ts) | Modified | Multi-root content search across active folders, duplicate physical directory deduplication, nested root pruning, root-qualified match entries. |
| [`packages/core/test/workspace-manager/multi-root-vfs.test.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/test/workspace-manager/multi-root-vfs.test.ts) | New File | 14 end-to-end integration scenarios for multi-root VFS operations. |
| [`docs/DEVELOPMENT_ROADMAP.md`](file:///c:/Users/gaumi/Documents/GitHub/open_code/docs/DEVELOPMENT_ROADMAP.md) | Modified | Updated Task 1.1 and Task 2.1 status and documentation. |
| [`docs/FEATURE_STATUS_MATRIX.md`](file:///c:/Users/gaumi/Documents/GitHub/open_code/docs/FEATURE_STATUS_MATRIX.md) | Modified | Updated Multi-Root Tool VFS Path Resolution to Status 1. |

---

## 2. Architectural Review

### 2.1 Root Discovery & Dependency Lifecycle
- Discovery is performed dynamically via `Effect.serviceOption(MultiFolderWorkspace.Service)`.
- If `MultiFolderWorkspace.Service` is unavailable or if `folders.length <= 1`, `FileAccess.resolve` falls back to the original single-root codepath. This guarantees 100% backward compatibility for standard single-root projects.
- The primary folder is identified by `folder.isPrimary === true`, falling back to `{ id: "primary", path: location.directory, name: path.basename(location.directory) }` if no explicit primary folder is flagged.

### 2.2 Path Parsing & Qualification
- Paths are normalized across separators (`\` -> `/`).
- **Root-Qualified Paths**: Paths of the format `<rootName>/<subpath>` or `<folderId>/<subpath>` match against registered workspace folders.
  - Windows matches case-insensitively (`f.name.toLowerCase() === firstSegment.toLowerCase()`).
  - Unix matches case-sensitively (`f.name === firstSegment`).
- **Unqualified Relative Paths**:
  - For existing files: Searched across all active folders.
    - If found in exactly 1 folder, resolves to that folder.
    - If found in >1 folders, fails with an `AmbiguousPathError` / `ToolFailure` indicating every candidate folder and prompting the user/agent to prefix with `<folderName>/`.
  - For new files (not existing anywhere): Defaults to the primary folder.

### 2.3 File Tools Integration
- **`read`**: Respects the target folder root when walking up for `AGENTS.md` instructions, preventing leaked parent instructions from unrelated folders.
- **`write`**: Retains BOM preservation and formatting while writing directly to the resolved target folder.
- **`edit`**: Locks `target.absolute` through `FileMutation.withLock`, preventing race conditions across different relative aliases for the same file.
- **`patch`**: Resolves both `main` and `move` targets for all hunks up front, then acquires a batch lock on all involved paths before applying transactions.
- **`glob` & `grep`**:
  - Automatically searches across all active roots when `path` is omitted or `"."`.
  - Prunes nested roots (`candidate` contained within `other`) to avoid duplicate hits.
  - Deduplicates physical folders via `FSUtil.resolve`.
  - Prefixes secondary root results with `<folderName>/` to keep paths actionable for subsequent tool calls.

---

## 3. Security Review

### 3.1 Directory Traversal Guards
- In **Case 2** (paths starting with `..`): Paths are resolved against `location.directory`. If they escape all active workspace folders, they are classified as `externalDirectory`, requiring explicit permission approval.
- In **Case 3** (root-qualified paths): `candidate` is verified with `FSUtil.contains(rootQualifiedFolder.path, candidate)`. Traversal attempts (e.g. `backend/../../escape.txt`) are rejected with `PathTraversalError`.

### 3.2 Symlink Escape Validation
- Symlinks are checked via `files.stat(path)` and `FSUtil.resolve(path)`.
- If the resolved canonical destination is outside all active workspace folders and outside the project worktree, access is rejected immediately with a `ToolFailure`.

### 3.3 Time-of-Check to Time-of-Use (TOCTOU) Analysis
- **User-space Limitation**: Node.js and Bun do not expose low-level atomic filesystem flags (such as Linux `openat2` with `RESOLVE_BENEATH` or `O_NOFOLLOW`). As a result, the resolution check (`files.stat` and `FSUtil.resolve`) and the actual mutation (`FileMutation.write`) occur in sequential operations.
- **Concurrency Protection**: `FileMutation.withLock` serializes concurrent operations within the same OpenCode process on the canonical resolved path (`[...new Set(targets.map(FSUtil.resolve))]`). However, it cannot prevent concurrent external processes outside OpenCode from replacing a directory or file with a symlink between check and write.

---

## 4. Test Coverage Review

### 4.1 Coverage Analysis of Required Dimensions

| Dimension | Status | Notes |
|---|:---:|---|
| **Secondary-root file creation** | **Covered** | Scenario 3 verifies creation in secondary directory, ensuring primary is untouched. |
| **Duplicate folder names** | **Gap** | Scenario 13 tests duplicate physical paths, but distinct folders sharing the same name are not tested. |
| **Folder ID addressing** | **Gap** | Addressing by `folder.name` is tested; addressing by `folder.id` is not tested in integration tests. |
| **Absolute-path authorization** | **Gap** | Direct absolute path targeting secondary roots without `external_directory` prompt is not explicitly exercised in multi-root suite. |
| **Windows path separators** | **Partial** | Output paths are tested across Windows, but input paths using backslashes (e.g. `backend\file.txt`) lack an explicit test. |
| **Symlink changes between validation & op** | **Gap** | TOCTOU race is not simulated in automated tests. |
| **Root removal during operation** | **Partial** | Missing/unreachable roots are tested in Scenario 12, but concurrent detachment during a stream is not tested. |
| **Multiple roots with identical paths** | **Covered** | Scenario 8 verifies `AmbiguousPathError` with actionable candidate list. |
| **Nested attached roots** | **Gap** | Deduplication logic exists in `glob.ts` / `grep.ts`, but an actual nested directory fixture is not present in tests. |
| **Permission denial in secondary root** | **Gap** | Multi-root test suite uses a permissive mock (`allows: () => true`); permission denial in secondary roots is not tested. |

---

## 5. Actual Verification Results

All tests and checks were executed locally in the repository:

### 5.1 Multi-Root VFS Integration Test Suite
```bash
cd packages/core; bun test test/workspace-manager/multi-root-vfs.test.ts
```
- **Exit Code**: 0
- **Result**: 14 passed, 0 failed, 49 assertions (3.54s).

### 5.2 Native File Tool Test Suites
```bash
cd packages/core; bun test test/tool-read.test.ts test/tool-write.test.ts test/tool-edit.test.ts test/tool-patch.test.ts test/tool-search.test.ts
```
- **Exit Code**: 0
- **Result**: 118 passed, 0 failed, 394 assertions (9.25s).

### 5.3 Workspace-Manager Test Suite
```bash
cd packages/core; bun test test/workspace-manager/
```
- **Exit Code**: 0
- **Result**: 21 passed, 0 failed, 167 assertions (4.25s).

### 5.4 Core Package Typecheck
```bash
cd packages/core; bun typecheck
```
- **Exit Code**: 0
- **Result**: 0 type errors in 1,896 files across 2 projects (6.14s).

### 5.5 Repository-Wide Check (`bun run check`)
```bash
bun run check
```
- **Exit Code**: 0
- **Result**: 35 successful tasks out of 35 projects. Full turbo check clean.

---

## 6. Defects Discovered

### Defect 1 (CRITICAL): Unqualified Traversal Escapes Workspace Boundary Without External Approval
- **Location**: [`packages/core/src/file-access.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/file-access.ts#L411-L417)
- **Description**:
  In Case 4 (unqualified relative path), when a path does not start with `..` (e.g. `nested/../../../../secret.txt`) and does not exist in any workspace folder, the code defaults to:
  ```ts
  const candidate = AbsolutePath.make(path.resolve(primaryFolder.path, normalized))
  return {
    absolute: candidate,
    resource: slash(path.relative(primaryFolder.path, candidate) || "."),
    folder: primaryFolder,
  } satisfies Target
  ```
  `candidate` is NOT checked with `FSUtil.contains(primaryFolder.path, candidate)`.
  If `normalized` contains sufficient `../` steps to navigate above `primaryFolder.path`, `candidate` resolves outside the workspace. Because `externalDirectory` is not set on this return object, tools calling `authorizeExternal` will not prompt the user for external directory approval, treating an unauthorized external path as internal.
- **Recommended Remedy**:
  Verify `FSUtil.contains(primaryFolder.path, candidate)`. If it is outside, either fail with a `PathTraversalError` or route to `externalDirectory` authorization as done in single-root fallback.

### Defect 2 (MEDIUM): Primary Subdirectory Collision on Non-Existent Targets
- **Location**: [`packages/core/src/file-access.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/file-access.ts#L315)
- **Description**:
  When resolving a path like `backend/new-file.ts`, line 315 checks:
  ```ts
  (yield* exists(primaryCandidate)) && (yield* exists(candidate))
  ```
  If the primary project already has a subdirectory `backend/` on disk, but `new-file.ts` does not yet exist, this check evaluates to `false`. The resolver routes the target to the secondary folder `backend` instead of flagging ambiguity with the existing primary `backend/` directory.

### Defect 3 (LOW): Leaf-Only Symlink Inspection Ignores Intermediate Symlinks
- **Location**: [`packages/core/src/file-access.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/file-access.ts#L188)
- **Description**:
  `stat?.type === "symlink"` checks only the leaf file or directory. If an intermediate directory in the path is a symlink pointing outside the workspace, `files.stat` on the target file returns `{ type: "file" }`, skipping the symlink boundary check.

---

## 7. Missing Tests

### High Priority (Critical)
1. **Unqualified Traversal Test**: Verify that `read`, `write`, `edit`, and `patch` reject or require external approval for inputs like `"some_dir/../../../../escape.txt"`.
2. **Permission Denial in Secondary Root**: Verify that when `permission.assert({ action: "edit", ... })` is denied for a secondary root path, the tool fails without mutating the file.

### Medium Priority
3. **Nested Workspace Roots**: Test attached folders where one folder is an ancestor of another (e.g. `/repo` and `/repo/packages/core`).
4. **Folder ID Addressing**: Test explicit resolution and tool operations using folder ID prefixes (`<folderId>/<path>`).
5. **Windows Path Separators in Tool Input**: Test `read` and `write` with backslashes on Windows (`backend\src\file.ts`).

### Low Priority
6. **Duplicate Folder Names**: Test behavior when two different workspace roots share the same `name`.

---

## 8. Remaining Limitations

1. **Duplicate Folder Name Ambiguity**:
   When two attached folders have the same base name (e.g. `/path1/api` and `/path2/api`), prefix resolution `<name>/...` matches the first folder registered. Targeting the second folder requires using its unique ID (`<id>/...`).
2. **TUI Single-Directory Anchor**:
   The TUI client currently anchors its primary tree and directory breadcrumbs to a single root directory; multi-root tree navigation in the TUI requires future UI component enhancements.
3. **Non-Atomic TOCTOU Window**:
   Because Node.js and Bun lack atomic descriptor-pinned path traversal (`openat2`), symlink swaps by hostile background processes during tool execution cannot be completely prevented at the runtime level.

---

## 9. Final Assessment

### Verdict: **Requires Changes**

**Rationale**:
The multi-root VFS architecture is sound, fully passes all 14 acceptance scenarios, maintains 100% backward compatibility for single-root workspaces, and passes all 118 existing file tool tests and repository-wide checks.

However, **Defect 1** represents a directory traversal vulnerability where non-leading relative traversal paths (e.g. `nested/../../../../secret.txt`) can bypass `externalDirectory` authorization in multi-root workspaces.

Per the engineering protocol, this critical defect is reported here for prioritization and remediation before advancing to the next development stage.
