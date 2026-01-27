# VS Code .NET Runtime/SDK Installation Extensions - Copilot Instructions

## Project Overview

This is a **VS Code extension monorepo** providing two extensions:
1. **vscode-dotnet-runtime**: Installs .NET runtime and SDK for extension authors to depend on
2. **vscode-dotnet-sdk**: Internal-only SDK installer (not published for general use)

The repo contains a **library** (`vscode-dotnet-runtime-library`) shared by both extensions and handles the core acquisition logic for downloading, installing, and managing .NET versions across Windows, macOS, and Linux.

## Architecture

### Core Components

- **`vscode-dotnet-runtime-library/src/`**: Shared TypeScript library
  - `Acquisition/`: Handles downloading and installing .NET (DotnetCoreAcquisitionWorker, GlobalInstallerResolver)
  - `EventStream/`: Observer pattern for all internal events (telemetry, logging, UI updates)
  - `Utils/`: Utilities (file ops, command execution, NodeIPC mutex for cross-process locks)
  
- **`vscode-dotnet-runtime-extension/src/`**: Main extension entry point (extension.ts ~850 lines)
  - Registers VS Code commands
  - Manages extension activation and state
  - Integrates library with VS Code APIs

### Critical Design Patterns

**EventStream (Observer Pattern)**: All significant operations emit events via `IEventStream.post(event)`. Don't log directly—post events instead. Examples:
- `DotnetAcquisitionStarted`, `DotnetAcquisitionCompleted` for user actions
- `DotnetVersionResolutionError` for failures
- Events flow to: `TelemetryObserver` (analytics), `LoggingObserver` (VS Code output), `ModalEventPublisher` (user dialogs)

**Acquisition Strategy** (see `Documentation/dev-spec.md`):
- **First acquisition**: Resolve version → fetch install script → install → validate → return path
- **Cached acquisitions**: Use cached release.json offline-first; update scripts/versions in background
- Version stored in [extension global storage](https://code.visualstudio.com/api/extension-capabilities/common-capabilities#data-storage)

**Global Installation**: Windows/macOS use system-wide installers; Linux uses package managers. Separate resolvers handle platform differences (`WinMacGlobalInstaller`, `LinuxGlobalInstaller`).

**Cross-Process Locking**: Uses `NodeIPCMutex` with file-based locks to prevent concurrent installs across multiple extension instances.

## Build & Test Workflows

### Building
```bash
# Root: Downloads install scripts, compiles both library and extension
build.cmd  # Windows
build.sh   # Unix

# Individual builds
cd vscode-dotnet-runtime-library && npm run compile
cd vscode-dotnet-runtime-extension && npm run compile
```

### Testing
```bash
cd vscode-dotnet-runtime-library
npm test  # Runs mocha unit tests (dist/test/unit/**.test.js)
```

**Key test patterns** (Mocha TDD syntax):
- Tests mock `IEventStream`, `IExtensionState`, `IVSCodeExtensionContext`
- Use `TestUtility.ts` for logging with cross-process locks
- Test file structure mirrors source (e.g., `DotnetCoreAcquisitionWorker.test.ts`)

### Code Quality
```bash
npm run lint  # ESLint with TypeScript + Prettier
```

## Project-Specific Conventions

1. **Null/undefined handling**: Check both `null` and `undefined`; project supports older VS Code versions
2. **Platform differences**: Use `os.platform()` checks (`'win32'`, `'darwin'`, `'linux'`) for OS-specific logic
3. **Error handling**: Catch acquisition errors as `EventBasedError` or `EventCancellationError`; don't throw unhandled exceptions
4. **Telemetry**: Initialize with `enableExtensionTelemetry()` at startup; respect user telemetry settings
5. **File structure**: Source in `src/`, compiled to `dist/`, webpack-bundled for extensions
6. **Dependencies**: All versions pinned in `package.json`; verify `npm ci` (not `npm install`) for builds

## Integration Points

- **VS Code APIs**: Uses only stable APIs (no proposed features); targets `vscode ^1.99.0`
- **External**: Fetches `release.json` from `dot.net` and runs official `dotnet-install` scripts
- **Extension Consumption**: Authors call `dotnet.acquireRuntime` command with version spec; receive path to dotnet executable
- **Global State**: Persists install paths and version metadata via `IExtensionState` (VS Code memento)

## Key Files to Reference

- [extension.ts](vscode-dotnet-runtime-extension/src/extension.ts#L1): Command registration, extension lifecycle
- [DotnetCoreAcquisitionWorker.ts](vscode-dotnet-runtime-library/src/Acquisition/DotnetCoreAcquisitionWorker.ts#L1): Core acquisition logic
- [EventStreamEvents.ts](vscode-dotnet-runtime-library/src/EventStream/EventStreamEvents.ts): All event types
- [IAcquisitionWorkerContext.ts](vscode-dotnet-runtime-library/src/Acquisition/IAcquisitionWorkerContext.ts): Dependency injection interface
- [dev-spec.md](Documentation/dev-spec.md): Detailed acquisition strategy

## Before Making Changes

- Run `npm run lint` to fix style issues automatically
- Run tests: `npm test` in library directory
- For cross-platform changes, verify platform-specific paths are tested
- If modifying acquisition logic, trace event flow via EventStream to ensure telemetry/UI updates work
- Check if changes affect global installs (separate mutex and resolver logic)

