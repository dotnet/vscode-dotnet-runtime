# @dotnet/vscode-dotnet-runtime-types

[![npm version](https://img.shields.io/npm/v/@dotnet/vscode-dotnet-runtime-types.svg)](https://www.npmjs.com/package/@dotnet/vscode-dotnet-runtime-types)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

TypeScript type definitions for the [VS Code .NET Install Tool](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-runtime) extension API.

## Installation

```bash
npm install --save-dev @dotnet/vscode-dotnet-runtime-types
```

## Usage

These types are designed for VS Code extension authors who want to interact with the .NET Install Tool extension via VS Code's command API.

```typescript
import type {
    IDotnetAcquireContext,
    IDotnetAcquireResult,
    IDotnetFindPathContext,
    DotnetVersionSpecRequirement
} from '@dotnet/vscode-dotnet-runtime-types';
import * as vscode from 'vscode';

// Acquire a .NET runtime
async function acquireDotnet(): Promise<string> {
    const context: IDotnetAcquireContext = {
        version: '8.0',
        requestingExtensionId: 'my-publisher.my-extension'
    };

    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>(
        'dotnet.acquire',
        context
    );

    return result.dotnetPath;
}

// Find an existing .NET installation
async function findDotnet(): Promise<string | undefined> {
    const context: IDotnetFindPathContext = {
        acquireContext: {
            version: '8.0',
            requestingExtensionId: 'my-publisher.my-extension'
        },
        versionSpecRequirement: 'greater_than_or_equal'
    };

    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>(
        'dotnet.findPath',
        context
    );

    return result?.dotnetPath;
}
```

## Available Types

### Context Types
- `IDotnetAcquireContext` - Parameters for acquiring .NET SDK/Runtime
- `IDotnetFindPathContext` - Parameters for finding existing .NET installations
- `IDotnetListVersionsContext` - Parameters for listing available .NET versions
- `IDotnetSearchContext` - Parameters for searching installed .NET versions
- `IDotnetUninstallContext` - Parameters for uninstalling .NET
- `IDotnetEnsureDependenciesContext` - Parameters for ensuring Linux dependencies

### Result Types
- `IDotnetAcquireResult` - Result containing the path to dotnet executable
- `IDotnetVersion` - Information about a .NET version
- `IDotnetSearchResult` - Result of searching for .NET installations

### Enum/Union Types
- `DotnetInstallMode` - `'sdk' | 'runtime' | 'aspnetcore'`
- `DotnetInstallType` - `'local' | 'global'`
- `DotnetVersionSpecRequirement` - Version matching requirements
- `DotnetVersionSupportStatus` - `'lts' | 'sts'`
- `DotnetVersionSupportPhase` - `'active' | 'preview' | 'eol' | 'go-live' | 'maintenance'`
- `AcquireErrorConfiguration` - Error popup configuration for acquisition
- `UninstallErrorConfiguration` - Error popup configuration for uninstallation

## Related

- [VS Code .NET Install Tool Extension](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-runtime)
- [Extension Documentation](https://github.com/dotnet/vscode-dotnet-runtime#readme)

## Third Party Notices

The [notices](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/THIRD-PARTY-NOTICES.txt) file contains third party notices and licenses.

## Contributing

Contributions are always welcome. Please see our [contributing guide](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/contributing.md) for more details.

This package is part of the [dotnet/vscode-dotnet-runtime](https://github.com/dotnet/vscode-dotnet-runtime) repository.

## Microsoft Open Source Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact opencode@microsoft.com with any additional questions or comments.

## Questions and Feedback

**[Provide feedback](https://github.com/dotnet/vscode-dotnet-runtime/issues/new/choose)**

File questions, issues, or feature requests for the extension.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party's policies.

## License

MIT © .NET Foundation and Contributors
