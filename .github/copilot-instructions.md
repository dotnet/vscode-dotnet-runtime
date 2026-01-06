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

## Build Process

### Full Build

To build the entire repository:

```bash
# On Linux/macOS
./build.sh

# On Windows
build.cmd
```

The build script:
1. Downloads .NET install scripts from the official .NET repository
2. Compiles the library (`vscode-dotnet-runtime-library`)
3. Compiles the runtime extension (`vscode-dotnet-runtime-extension`)
4. Compiles the SDK extension (`vscode-dotnet-sdk-extension`)
5. Compiles the sample extension (`sample`)
6. Runs mock webpack scripts

### Building Individual Components

Navigate to each component directory and run:

```bash
npm ci              # Install dependencies
npm run compile     # Compile TypeScript
```

### Cleaning Build Artifacts

Each component has a `clean` script:

```bash
npm run clean       # Removes dist/ directory
```

## Testing

### Two Types of Tests

The repository has two distinct types of tests:

1. **Library Unit Tests** (`vscode-dotnet-runtime-library/src/test/unit/`)
   - Pure unit tests using Mocha with TDD interface
   - Test individual components and utilities
   - Run with: `npm run unit-test` (in library directory)
   - Fast and don't require VS Code runtime

2. **Extension Functional Tests** (`*-extension/src/test/functional/`)
   - End-to-end tests using `@vscode/test-electron`
   - Test full extension behavior in VS Code environment
   - Run with: `npm run test` (in extension directory)
   - Slower as they launch VS Code instances

### Running Tests

#### Full Test Suite

Run all tests across all components:

```bash
# On Linux/macOS
./test.sh

# On Windows
test.cmd

# With linting
./test.sh --eslint
```

#### Individual Component Tests

In each component directory:

```bash
# Library tests (unit tests)
cd vscode-dotnet-runtime-library
npm run test

# Extension tests (functional tests)
cd vscode-dotnet-runtime-extension
npm run test
```

#### Running Specific Unit Tests

For faster iteration when working on specific tests, use the `--bail` flag to stop on first failure:

```bash
# Run a specific test file (from library directory)
npx mocha --bail -u tdd -- dist/test/unit/LocalInstallUpdateService.test.js

# Run all unit tests with bail
npx mocha --bail -u tdd -- dist/test/unit/**.test.js
```

**Important**: Tests run against compiled JavaScript in the `dist/` directory, so compile first with `npm run compile`.

#### Selective Testing

The test script supports testing specific components:

```bash
# Test only the library
./test.sh lib

# Test only the runtime extension
./test.sh rnt

# Test only the SDK extension
./test.sh sdk
```

### Debugging Tests

- For library tests: Open `vscode-dotnet-runtime-library` workspace and use VS Code's test runner
- For extension tests: Open the extension's workspace folder and use the debug launch configurations
- To debug compiled code: Set breakpoints in TypeScript tests, then add breakpoints to generated `.js` files after the first run

## Linting and Code Style

### Running the Linter

```bash
# From repository root
npm run lint
```

The linter uses ESLint with TypeScript support and auto-fixes issues when possible.

### Code Style Guidelines

- **TypeScript**: All code is written in TypeScript
- **File Headers**: Use the .NET Foundation license header (see `contributing.md` for template)
- **Naming**: Follow TypeScript/JavaScript conventions
  - PascalCase for classes, interfaces, types
  - camelCase for variables, functions, methods
  - UPPER_CASE for constants
- **Comments**: Add comments for complex logic; follow existing patterns
- **Error Handling**: Use proper error types and meaningful error messages
- **Testing**: Follow TDD approach (write tests first when fixing bugs)

### ESLint Configuration

The repository uses:
- `@typescript-eslint` plugins for TypeScript-specific rules
- Prettier for code formatting
- Custom rules defined in `.eslintrc.js`

## Common Development Workflows

### Adding a New Feature

1. Create an issue to discuss the feature
2. Create a feature branch: `git checkout -b feature-name`
3. Implement in the library layer if it's core logic
4. Expose through extension layer if needed
5. Add unit tests in the library
6. Add functional tests in the extension if it affects extension behavior
7. Update documentation if adding new APIs
8. Run `./build.sh` to ensure everything compiles
9. Run `./test.sh --eslint` to run all tests and linting
10. Create a pull request

### Fixing a Bug

1. Write a failing test that reproduces the bug
2. Fix the bug with minimal changes
3. Verify the test passes
4. Run related tests: `npx mocha --bail -u tdd -- dist/test/unit/AffectedFile.test.js`
5. Run full test suite to ensure no regressions

### Making Changes to the Library

Since both extensions depend on the library:

1. Make changes in `vscode-dotnet-runtime-library`
2. Compile the library: `cd vscode-dotnet-runtime-library && npm run compile`
3. Test library changes: `npm run test`
4. Test both extensions to ensure compatibility
5. Update the library version if making breaking changes

## Project Structure

```
vscode-dotnet-runtime/
├── .github/                          # GitHub configuration
│   ├── workflows/                    # CI/CD workflows
│   └── copilot-instructions.md       # This file
├── Documentation/                    # Additional documentation
├── vscode-dotnet-runtime-library/    # Core acquisition library
│   ├── src/
│   │   ├── Acquisition/              # Install logic, version resolution
│   │   ├── EventStream/              # Logging and telemetry
│   │   ├── Utils/                    # Utility functions
│   │   └── test/
│   │       ├── unit/                 # Unit tests (Mocha TDD)
│   │       └── mocks/                # Test mocks and utilities
│   └── package.json
├── vscode-dotnet-runtime-extension/  # Runtime extension
│   ├── src/
│   │   ├── extension.ts              # Extension entry point
│   │   └── test/functional/          # Functional tests (vscode-test)
│   └── package.json
├── vscode-dotnet-sdk-extension/      # SDK extension
│   └── package.json
├── sample/                           # Sample demonstrating usage
├── build.sh / build.cmd              # Build scripts
├── test.sh / test.cmd                # Test scripts
└── package.json                      # Root package for linting
```

## Key Files and Directories

- **`dist/`**: Compiled JavaScript output (gitignored, generated by `npm run compile`)
- **`node_modules/`**: NPM dependencies (gitignored)
- **`install scripts/`**: Downloaded .NET install scripts from Microsoft
- **`.eslintrc.js`**: ESLint configuration
- **`tsconfig.json`**: TypeScript compiler configuration (per component)

## Common Issues and Solutions

### Build Failures

1. **Missing install scripts**: The build script downloads these automatically
2. **TypeScript errors**: Run `npm ci` to ensure dependencies are up to date
3. **Webpack errors**: Check that mock-webpack script has execute permissions

### Test Failures

1. **Tests fail after code changes**: Recompile with `npm run compile`
2. **Specific test fails**: Run with `--bail` flag to stop on first failure for faster debugging
3. **Extension tests hang**: Check for VS Code instance conflicts; close all VS Code windows
4. **Path issues on Windows**: Use cross-platform path utilities from the library

### Debugging Tips

1. Use `npm run watch` for automatic recompilation during development
2. Check the output window in VS Code for extension logs
3. Enable high verbosity in extension settings for detailed logging
4. Use the sample extension to manually test changes
5. For library debugging, add logging rather than relying on breakpoints

## Dependencies and Package Management

- **npm**: Primary package manager (some components use yarn as well)
- **Mocha**: Test runner for unit tests
- **@vscode/test-electron**: Test runner for extension functional tests
- **TypeScript**: Language and compiler
- **ESLint**: Linting and code quality
- **webpack**: Bundling for production builds

### Installing Dependencies

Always use `npm ci` (not `npm install`) for consistent, reproducible builds:

```bash
npm ci  # Install exact versions from package-lock.json
```

## VS Code Extension Development

### Testing Extensions Locally

1. Open the workspace file: `vscode-dotnet-runtime.code-workspace`
2. Use the "Run Sample Extension" launch configuration
3. In the Extension Development Host, open the command palette
4. Run: "Sample: Run a dynamically acquired .NET Core Hello World App"

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

## Copilot-Specific Guidance

When assisting with code changes:

1. **Respect the layered architecture**: Core logic goes in the library, UI/commands in extensions
2. **Write tests first**: Follow TDD when fixing bugs
3. **Use existing patterns**: Match the coding style of surrounding code
4. **Keep changes minimal**: Make surgical, focused changes
5. **Test incrementally**: Use `--bail` flag for fast iteration on specific tests
6. **Consider both extensions**: Changes to the library affect both runtime and SDK extensions
7. **Follow .NET conventions**: This is a .NET-focused project; respect .NET naming and patterns
8. **Security matters**: This code downloads and executes .NET installers; be extra careful with security

## Quick Command Reference

```bash
# Build everything
./build.sh

# Test everything with linting
./test.sh --eslint

# Compile a specific component
cd vscode-dotnet-runtime-library && npm run compile

# Run specific unit test with early exit
npx mocha --bail -u tdd -- dist/test/unit/SpecificFile.test.js

# Run library unit tests
cd vscode-dotnet-runtime-library && npm run unit-test

# Run extension functional tests
cd vscode-dotnet-runtime-extension && npm run test

# Lint code
npm run lint

# Clean build artifacts
npm run clean

# Watch for changes
npm run watch
```
