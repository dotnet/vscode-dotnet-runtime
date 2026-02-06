# GitHub Copilot Instructions for vscode-dotnet-runtime

This document provides guidance for GitHub Copilot when working with the vscode-dotnet-runtime repository.

## Repository Overview

This repository contains VS Code extensions for acquiring and managing .NET runtimes and SDKs:

- **vscode-dotnet-runtime-library**: Core library for .NET acquisition logic (shared by extensions)
- **vscode-dotnet-runtime-extension**: Extension for installing .NET runtimes (designed to be used by other extensions)
- **vscode-dotnet-sdk-extension**: Extension for installing .NET SDKs (for internal features, not for general use)
- **sample**: Sample extension demonstrating usage of the runtime acquisition APIs

### Architecture

The repository follows a layered architecture:
1. **Library layer** (`vscode-dotnet-runtime-library`): Contains all acquisition logic, installers, version resolvers, and utilities
2. **Extension layer** (`vscode-dotnet-runtime-extension`, `vscode-dotnet-sdk-extension`): VS Code extension wrappers that expose commands and APIs
3. **Sample layer** (`sample`): Demonstrates proper usage of the extensions

Core logic goes in the library, UI/commands in extensions.

## Build Process

### Full Build

```bash
./build.sh   # Linux/macOS
build.cmd    # Windows
```

The build script downloads .NET install scripts, compiles all components (library, extensions, sample), and runs mock webpack.

### Individual Component Build

```bash
cd <component-directory>
npm ci              # Install dependencies
npm run compile     # Compile TypeScript
npm run clean       # Remove dist/ artifacts
```

## Testing

### Two Test Types

1. **Library Unit Tests** (`vscode-dotnet-runtime-library/src/test/unit/`)
   - Mocha with TDD interface, fast, no VS Code runtime required
   - Run: `npm run unit-test` (in library directory)

2. **Extension Functional Tests** (`*-extension/src/test/functional/`)
   - End-to-end tests using `@vscode/test-electron`, slower
   - Run: `npm run test` (in extension directory)

### Running Tests

```bash
# Full test suite
./test.sh --eslint  # All tests + linting
./test.sh lib       # Library only
./test.sh rnt       # Runtime extension only
./test.sh sdk       # SDK extension only

# Specific unit test (compile first!)
npx mocha --bail -u tdd -- dist/test/unit/LocalInstallUpdateService.test.js
```

**Important**: Tests run against compiled JavaScript in `dist/`, so run `npm run compile` first.

### Debugging Tests

- Library tests: Open `vscode-dotnet-runtime-library` workspace, use VS Code test runner
- Extension tests: Open extension workspace, use debug launch configurations
- Add logging statements to understand test failures; compiled JS is in `dist/` directory

## Linting and Code Style

```bash
npm run lint  # From repository root (ESLint + TypeScript + auto-fix)
```

### Code Conventions

- **TypeScript**: All code
- **File Headers**: Use .NET Foundation license header (see `contributing.md`)
- **Naming**: PascalCase (classes/interfaces/types), camelCase (variables/functions/methods), UPPER_CASE (constants)
- **Testing**: Follow TDD (write tests first when fixing bugs)
- **Security**: Be extra careful - this code downloads and executes .NET installers

## Common Development Workflows

### Updating Dependencies

When asked to update dependencies, follow this process:

```bash
# Update all components in order
cd <repo-root>
npm update && yarn install && yarn upgrade

cd vscode-dotnet-runtime-library
npm update && yarn install && yarn upgrade

cd ../vscode-dotnet-runtime-extension
npm update && yarn install && yarn upgrade

cd ../vscode-dotnet-runtime-library
npm update && yarn upgrade

cd ../sample
npm update && yarn upgrade

cd ../vscode-dotnet-sdk-extension
npm update && yarn upgrade

cd ..
./build.sh  # or build.cmd on Windows
```

### Version Bumping

**Important**: Only bump extension versions when explicitly requested. If not requested, do NOT run `npm version patch`.

When version bumping IS requested:
- Run `npm version patch` in `vscode-dotnet-runtime-extension` after its updates
- Run `npm version patch` in `sample` after its updates
- Update the corresponding CHANGELOG.md file with the new version and changes:
  - `vscode-dotnet-runtime-extension/CHANGELOG.md` for runtime extension
  - `vscode-dotnet-sdk-extension/CHANGELOG.md` for SDK extension

### Fixing a Bug

1. Write a failing test that reproduces the bug
2. Fix the bug with minimal changes
3. Verify: `npx mocha --bail -u tdd -- dist/test/unit/AffectedFile.test.js`
4. Run full test suite to ensure no regressions

### Making Library Changes

Since both extensions depend on the library:
1. Make changes in `vscode-dotnet-runtime-library`
2. Compile: `cd vscode-dotnet-runtime-library && npm run compile`
3. Test library: `npm run test`
4. Test both extensions for compatibility

## Project Structure

```
vscode-dotnet-runtime/
├── .github/                          # GitHub configuration
├── Documentation/                    # Additional documentation
├── vscode-dotnet-runtime-library/    # Core acquisition library
│   ├── src/
│   │   ├── Acquisition/              # Install logic, version resolution
│   │   ├── EventStream/              # Logging and telemetry
│   │   ├── Utils/                    # Utility functions
│   │   └── test/unit/                # Unit tests (Mocha TDD)
│   └── package.json
├── vscode-dotnet-runtime-extension/  # Runtime extension
│   ├── src/extension.ts              # Extension entry point
│   └── src/test/functional/          # Functional tests (vscode-test)
├── vscode-dotnet-sdk-extension/      # SDK extension
├── sample/                           # Sample demonstrating usage
├── build.sh / build.cmd              # Build scripts
└── test.sh / test.cmd                # Test scripts
```

**Key directories**: `dist/` (compiled JS, gitignored), `node_modules/` (gitignored), `install scripts/` (downloaded .NET scripts)

## Common Issues and Solutions

- **Missing install scripts**: Build script downloads automatically
- **TypeScript errors**: Run `npm ci` to update dependencies
- **Tests fail after code changes**: Recompile with `npm run compile`
- **Specific test fails**: Use `--bail` flag for faster debugging
- **Extension tests hang**: Close all VS Code windows first
- **Path issues on Windows**: Use cross-platform path utilities from library

### Debugging Tips

- Use `npm run watch` for automatic recompilation
- Check VS Code output window for extension logs
- Enable high verbosity in extension settings
- Use sample extension to manually test changes
- For library debugging, prefer logging over breakpoints

## VS Code Extension Development

### Testing Extensions Locally

1. Open `vscode-dotnet-runtime.code-workspace`
2. Use "Run Sample Extension" launch configuration
3. In Extension Development Host, run: "Sample: Run a dynamically acquired .NET Core Hello World App"

### Building a .VSIX Package

```bash
cd vscode-dotnet-runtime-extension  # or vscode-dotnet-sdk-extension
npm install -g vsce
vsce package --ignoreFile ../.vscodeignore --yarn
```

## Additional Resources

- [Contributing Guide](../Documentation/contributing.md)
- [Contributing Workflow](../Documentation/contributing-workflow.md)
- [Troubleshooting Runtime](../Documentation/troubleshooting-runtime.md)
- [Troubleshooting SDK](../Documentation/troubleshooting-sdk.md)

## Quick Command Reference

```bash
# Build & Test
./build.sh                    # Full build
./test.sh --eslint           # All tests + linting
./test.sh lib|rnt|sdk        # Selective testing

# Component Operations
cd <component> && npm ci && npm run compile  # Build component
npm run clean                                # Clean artifacts
npm run watch                                # Auto-recompile

# Testing
npx mocha --bail -u tdd -- dist/test/unit/SpecificFile.test.js  # Single test
npm run unit-test            # Library unit tests
npm run test                 # Extension functional tests

# Linting & Quality
npm run lint                 # ESLint with auto-fix
```
