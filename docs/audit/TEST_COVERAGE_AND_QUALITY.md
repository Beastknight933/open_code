# Test Coverage and Quality Assessment

**Repository**: `open_code`  
**Audit Date**: October 31, 2026  
**Auditor**: Antigravity Technical Pair Programmer  

This document evaluates the automated test suites, quality assurance mechanisms, regression safety, and gaps in test coverage across the `open_code` repository.

---

## 1. Test Suite Execution Summary

All test suites were executed directly on the local Windows environment using Bun `v1.4.4` without mocks or skipped suites:

| Test Suite / Package | Files | Tests | `expect()` Calls | Duration | Result |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Desktop Baseline Suite** (`packages/desktop`) | 40 | 235 | 887 | 92.13s | **235 PASS / 0 FAIL** |
| **Core Extension Suite** (`packages/core/test/extension`) | 6 | 21 | 148 | 0.95s | **21 PASS / 0 FAIL** |
| **Core Workspace Suite** (`packages/core/test/workspace-manager`) | 3 | 9 | 84 | 1.03s | **9 PASS / 0 FAIL** |
| **Core Integration & E2E** (`packages/core/test/integration`) | 4 | 24 | 133 | 2.26s | **24 PASS / 0 FAIL** |
| **Total Verified Test Executions** | **53** | **289** | **1,252** | **~96s** | **100% PASS** |

### Monorepo Typecheck Results
- Executed canonical typecheck: `bun check --no-script`
- Verified across: `@opencode/schema`, `@opencode/protocol`, `@opencode/client`, `@opencode/core`, `@opencode/server`, and `@opencode/app`.
- **Result: 0 type errors across all workspaces**.

---

## 2. Test Architecture & Quality Breakdown

### 2.1 Acceptance & End-to-End Tests (High Quality)
- **Multi-Folder Acceptance Suite** ([`packages/core/test/workspace-manager/acceptance.test.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/test/workspace-manager/acceptance.test.ts)):
  - *Quality*: High. Implements 12 distinct acceptance scenarios using genuine temporary directories across drives without mock filesystems. Exercises project creation, dynamic folder attach/detach, root switching, folder relinking, attachments, multi-conversations, and non-destructive deletion.
- **Production E2E Workflow** ([`packages/core/test/integration/milestone5-e2e.test.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/test/integration/milestone5-e2e.test.ts)):
  - *Quality*: High. Verifies the entire lifecycle from project creation through multi-folder attachment, extension CIR inspection, agent tool queries, and fork data isolation.
- **System Integration & Security Audit** ([`packages/core/test/integration/milestone4-integration.test.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/test/integration/milestone4-integration.test.ts)):
  - *Quality*: High. Tests fault recovery (broken MCP configurations, missing folders, atomic rollback), AST security scanning against real malicious strings, and monotonic performance benchmarks.

---

### 2.2 Unit Tests & Fixtures (Moderate to High Quality)
- **Extension Security** ([`packages/core/test/extension/security.test.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/test/extension/security.test.ts)):
  - Tests path traversal with null bytes, double dots (`..`), destructive bash commands, and private key strings.
- **Rules Ingestion** ([`packages/core/test/extension/rules.test.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/test/extension/rules.test.ts)):
  - Verifies YAML frontmatter glob extraction from `.mdc` files, precedence calculation, and prompt string concatenation.
- **MCP Importer** ([`packages/core/test/extension/mcp.test.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/test/extension/mcp.test.ts)):
  - Tests parsing of Claude and Cursor JSON configurations into strongly-typed `Mcp.ServerConfig` structures.
- **Desktop Regression Baseline** (`packages/desktop`):
  - Comprehensive 40-file suite ensuring window lifecycle, IPC serialization, storage flushing, and installer sandboxing remain intact.

---

## 3. Test Coverage Gaps & Superficial Tests

While unit and acceptance coverage for the new services is solid, several critical areas have test coverage gaps or test only superficial behavior:

| Subsystem | Current Test Focus | Critical Missing Test Coverage |
| :--- | :--- | :--- |
| **MCP Integration** | Validates JSON format translation (`mcp.test.ts`) | **Missing**: No test boots a translated MCP server through OpenCode's actual MCP client process or executes a live tool call through it. |
| **Rules Pipeline** | Validates parsing & precedence formatting (`rules.test.ts`) | **Missing**: No test verifies that imported rules are injected into an LLM session prompt during active turns. |
| **Multi-Folder Tool Access** | Validates directory listing and tree creation (`acceptance.test.ts`) | **Missing**: No test attempts relative path resolution for `read`, `write`, `edit`, or `grep` tools inside secondary attached roots. |
| **Plugin Compatibility** | Tests manifest decomposition & string shim generation (`milestone1.test.ts`) | **Missing**: No test attempts to load, execute, or sandbox a generated plugin shim inside a runtime process. |
| **Customization UI** | Route parsing tested in `settings/route.test.ts` | **Missing**: No Playwright component tests for `project-extensions.tsx` or `project-folders.tsx` UI interactions (modal opening, form submit, reactive refetch). |
| **Skill Helper Execution** | Tests file copying & frontmatter extraction (`skills.test.ts`) | **Missing**: No test exercises an agent invoking a skill and executing a helper script inside `scripts/`. |

---

## 4. Test Quality Recommendations

1. **Implement Live MCP Roundtrip Test**:
   - Create a test fixture using a lightweight STDIO echo server and verify that importing Claude/Cursor config boots the server in OpenCode's `Mcp.Service`.
2. **Implement Instruction Discovery Integration Test**:
   - Write a test ensuring `InstructionDiscovery` aggregates both `AGENTS.md` and `RulesAdapter` parsed instructions (`CLAUDE.md`, `.cursorrules`).
3. **Implement Multi-Folder File Tool Test**:
   - Test `read` and `grep` resolving files located inside secondary attached roots.
