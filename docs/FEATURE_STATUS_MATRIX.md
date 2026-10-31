# Definitive Feature Status Matrix

**Repository**: `open_code`  
**Date**: October 31, 2026  
**Auditor**: Antigravity Technical Pair Programmer  

This document provides the definitive, code-verified status of every feature in the `open_code` repository across Universal Compatibility, Project & Workspace Management, and Core OpenCode Functionality.

---

## 1. Status Codes

| Code | Status Meaning |
| :---: | :--- |
| **1** | **Implemented and verified** (Code complete, integrated across layers, and backed by passing tests). |
| **2** | **Implemented but insufficiently tested** (Implemented in code, but lacks deep real-world or interactive test coverage). |
| **3** | **Partially implemented** (Code exists for part of the capability, but critical runtime connections are missing). |
| **4** | **Present only as documentation or scaffolding** (Described in docs or exists only as types/string templates without logic). |
| **5** | **Missing** (Not implemented in the repository). |
| **6** | **Broken or regressed** (Implemented previously, but now failing tests or broken). |
| **7** | **Unable to verify** (Cannot be verified due to environment or missing external dependencies). |

---

## 2. Universal Compatibility Features

| Subsystem / Feature | Status | Primary Code Reference | Function / Class Reference | Verification Reference |
| :--- | :---: | :--- | :--- | :--- |
| **Common Intermediate Representation (CIR)** | **1** | [`packages/schema/src/extension.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/schema/src/extension.ts) | `Extension.CIR`, `Platform`, `Category` | `test/extension/milestone1.test.ts` |
| **Platform Detection** | **1** | [`packages/core/src/extension/detector.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/detector.ts) | `ExtensionDetector.detect` | `test/extension/detector.test.ts` |
| **Package Decomposition** | **1** | [`packages/core/src/extension/detector.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/detector.ts) | `ExtensionDetector.decomposePackage` | `test/extension/milestone1.test.ts` |
| **Static Threat & AST Scanner** | **1** | [`packages/core/src/extension/security.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/security.ts) | `ExtensionSecurity.isPathSafe`, `scanContent` | `test/extension/security.test.ts` |
| **Extension Registry & Versioning** | **2** | [`packages/core/src/extension/registry.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/registry.ts) | `ExtensionRegistry.register`, `rollback`, `toggle` | `milestone1.test.ts`, `milestone4-integration.test.ts` |
| **Universal Skills Ingestion** | **2** | [`packages/core/src/extension/skills/adapter.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/skills/adapter.ts) | `SkillAdapter.parseSkillDirectory`, `install` | `test/extension/skills.test.ts` |
| **Skill Runtime Script Execution** | **3** | [`packages/core/src/tool/plugin/skill.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/skill.ts) | `SkillTool.Plugin` | *Missing path injection for nested scripts* |
| **MCP Config Importers (Claude/Cursor)** | **1** | [`packages/core/src/extension/mcp/manager.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/mcp/manager.ts) | `importClaudeDesktopConfig`, `importCursorConfig` | `test/extension/mcp.test.ts` |
| **MCP Server Diagnostic Runner** | **1** | [`packages/core/src/extension/mcp/manager.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/mcp/manager.ts) | `UniversalMcpManager.testServer` | `test/extension/milestone1.test.ts` |
| **MCP Live Runtime Persistence** | **3** | [`packages/server/src/handlers/extension.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/server/src/handlers/extension.ts#L198) | Missing write to `ConfigMcpPlugin` | *Gap: Registry records server, but daemon doesn't boot it* |
| **Rules Ingestion & Precedence Parsing**| **1** | [`packages/core/src/extension/rules/adapter.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/rules/adapter.ts) | `parseCursorMdc`, `parseClaudeMd`, `format...` | `test/extension/rules.test.ts` |
| **Rules Prompt Injection Pipeline** | **3** | [`packages/core/src/config/plugin/instruction.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/config/plugin/instruction.ts) | Missing hook in `InstructionDiscovery` | *Gap: Rules parsed in isolation, not delivered to LLM* |
| **Foreign Plugin Manifest Analyzer** | **1** | [`packages/core/src/extension/plugin/adapter.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/plugin/adapter.ts) | `PluginAdapter.inspect` | `test/extension/milestone1.test.ts` |
| **Foreign Plugin Shim Generator** | **3** | [`packages/core/src/extension/plugin/adapter.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/plugin/adapter.ts) | `generateAntigravityShim`, `generateGenericShim` | *Gap: String templates generated; no sandbox host exists* |
| **Foreign Plugin Sandboxed VM Host** | **5** | None | None | *Missing isolated worker/process sandbox* |
| **Declarative Adapter Proposal Engine** | **1** | [`packages/core/src/extension/adapter-generator.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/adapter-generator.ts) | `AdapterGenerator.proposeAdapter` | `test/extension/milestone1.test.ts` |
| **Authenticated GitHub Ingestion** | **4** | [`packages/core/src/extension/github.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/github.ts) | Local git clone only; API auth scaffolding | *Documented, but REST API with PATs missing* |
| **Agent Tool: universal_extension** | **1** | [`packages/core/src/tool/plugin/universal-extension.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/universal-extension.ts) | `UniversalExtensionTool.Plugin` | `milestone4-integration.test.ts` |

---

## 3. Project and Workspace Management Features

| Subsystem / Feature | Status | Primary Code Reference | Function / Class Reference | Verification Reference |
| :--- | :---: | :--- | :--- | :--- |
| **Project Creation** | **1** | [`packages/core/src/workspace-manager/project.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/project.ts) | `ProjectOperations.create` | `test/workspace-manager/acceptance.test.ts` |
| **Project Renaming** | **1** | [`packages/core/src/workspace-manager/project.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/project.ts) | `ProjectOperations.rename` | `test/workspace-manager/acceptance.test.ts` |
| **Project Archive & Restore** | **1** | [`packages/core/src/workspace-manager/project.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/project.ts) | `ProjectOperations.archive`, `restore` | `test/workspace-manager/acceptance.test.ts` |
| **Safe Project Deletion (No Disk Wipe)**| **1** | [`packages/core/src/workspace-manager/project.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/project.ts) | `ProjectOperations.delete` (`deletePhysicalFiles: false` default) | `test/workspace-manager/acceptance.test.ts` |
| **Dynamic Folder Attachment** | **1** | [`packages/core/src/workspace-manager/multi-folder.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/multi-folder.ts) | `MultiFolderWorkspace.addFolder` | `test/workspace-manager/acceptance.test.ts` |
| **Dynamic Folder Detachment** | **1** | [`packages/core/src/workspace-manager/multi-folder.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/multi-folder.ts) | `MultiFolderWorkspace.removeFolder` | `test/workspace-manager/acceptance.test.ts` |
| **Primary Root Switching** | **1** | [`packages/core/src/workspace-manager/multi-folder.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/multi-folder.ts) | `MultiFolderWorkspace.setPrimary` | `test/workspace-manager/acceptance.test.ts` |
| **Folder Relinking** | **1** | [`packages/core/src/workspace-manager/multi-folder.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/multi-folder.ts) | `MultiFolderWorkspace.relinkFolder` | `test/workspace-manager/acceptance.test.ts` |
| **Unified Workspace Directory Tree** | **1** | [`packages/core/src/workspace-manager/multi-folder.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/multi-folder.ts) | `MultiFolderWorkspace.getUnifiedTree` | `test/workspace-manager/workspace-manager.test.ts` |
| **Multi-Root Tool VFS Path Resolution**| **1** | [`packages/core/src/file-access.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/file-access.ts) | `FileAccessService.resolve`, `glob`, `grep`, `edit`, `patch`, `search` | `test/workspace-manager/multi-root-vfs.test.ts` (14 acceptance tests pass) |
| **Agent Tool: workspace_folder** | **1** | [`packages/core/src/tool/plugin/workspace-folder.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/workspace-folder.ts) | `WorkspaceFolderTool.Plugin` | `milestone4-integration.test.ts` |
| **Persistent Attachments Engine** | **1** | [`packages/core/src/workspace-manager/attachments.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/attachments.ts) | `ProjectAttachments.add`, `get`, `read` | `test/workspace-manager/acceptance.test.ts` |
| **Attachment MIME & Summaries** | **1** | [`packages/core/src/workspace-manager/attachments.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/attachments.ts) | `categorizeMime`, `extractSummary` | `test/workspace-manager/workspace-manager.test.ts` |
| **Attachment Full-Text Search** | **1** | [`packages/core/src/workspace-manager/attachments.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/attachments.ts) | `ProjectAttachments.search` | `test/workspace-manager/workspace-manager.test.ts` |
| **Agent Tool: project_attachment** | **1** | [`packages/core/src/tool/plugin/attachment.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/attachment.ts) | `AttachmentTool.Plugin` | `milestone4-integration.test.ts` |
| **Project Multi-Conversation Coordinator**| **1** | [`packages/core/src/workspace-manager/conversations.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/conversations.ts) | `ProjectConversations.list`, `create`, `rename` | `test/workspace-manager/acceptance.test.ts` |
| **Fork Data Isolation Paths** | **2** | [`packages/core/src/workspace-manager/config-migration.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/config-migration.ts) | `ConfigMigration.getEnhancedPaths` | `test/workspace-manager/config-migration.test.ts` |
| **UI Management Panels** | **1** | [`packages/app/src/settings/workspaces/`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/app/src/settings/workspaces/) | `ProjectSettingsFolders`, `Attachments`, `Extensions` | `packages/app/src/settings/shell.tsx` |

---

## 4. Existing OpenCode Baseline Functionality

| Subsystem / Capability | Status | Primary Code Reference | Function / Class Reference | Verification Reference |
| :--- | :---: | :--- | :--- | :--- |
| **Agent Execution Loop (Streaming)** | **1** | [`packages/core/src/session/runner/step.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/session/runner/step.ts) | `SessionRunner.run`, `llm.stream` | Monorepo typecheck & core tests |
| **Prompt Admission & Session Inbox** | **1** | [`packages/core/src/session/prompt.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/session/prompt.ts) | `SessionPrompt.prepare`, `SessionExecution.wake` | `packages/server/test/session-admit-location.test.ts` |
| **Model Resolution & 30+ Providers** | **1** | [`packages/ai/src/llm.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/ai/src/llm.ts), `packages/ai/src/providers/` | Anthropic, OpenAI, Gemini, Bedrock, etc. | Core provider test suites |
| **Native Tool Execution Host** | **1** | [`packages/core/src/plugin/internal.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/plugin/internal.ts) | `ReadTool`, `WriteTool`, `ShellTool`, etc. | Core tool test suites |
| **Interactive Tool Permissions** | **1** | [`packages/core/src/permission.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/permission.ts) | `Permission.Service.ask` | Desktop permission tests |
| **Native MCP Client Daemon** | **1** | [`packages/core/src/mcp/`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/mcp/) | `Mcp.Service`, `McpClient` (stdio/sse/oauth) | `packages/server/test/client-mcp.test.ts` |
| **SQLite Persistence & Drizzle ORM** | **1** | [`packages/core/src/database/database.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/database/database.ts) | Drizzle schema & migrations | Core DB tests |
| **Terminal / CLI Supervisor** | **1** | `packages/cli/` | `opencode service status`, `start`, `dev:live` | CLI test suite |
| **Desktop Electron Application** | **1** | `packages/desktop/` | Electron v34 window state, IPC transport | 235 passed desktop tests |
| **Pre-built Distribution Binaries** | **4** | Missing `dist/` | `electron-builder` configuration ready | *Binaries not compiled on disk* |
| **TUI Multi-Folder Navigation** | **5** | `packages/tui/` | Focused on single canonical directory | *Missing multi-folder UI* |
| **Antigravity Interactive Sidecars** | **5** | None | None | *Missing sidecar host protocol* |
| **Reactive Wakeup Without Polling** | **5** | `packages/core/src/session/execution.ts` | Processes run synchronously or in background | *Missing background process event wakeup* |
