/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

/**
 * @remarks
 * Type definitions for the VS Code .NET Install Tool extension API.
 *
 * This package is intended for EXTERNAL consumers (other VS Code extensions) that want to
 * interact with the .NET Install Tool extension via VS Code's command API.
 *
 * INTERNAL NOTE: Code within this repository (vscode-dotnet-runtime-library, vscode-dotnet-runtime-extension,
 * vscode-dotnet-sdk-extension) should NOT import directly from this package. Instead, import from
 * vscode-dotnet-runtime-library, which re-exports these types. This allows type changes to propagate
 * immediately during development without requiring a new package version to be published.
 *
 * @example
 * ```typescript
 * import type { IDotnetAcquireContext, IDotnetAcquireResult } from '@dotnet/vscode-dotnet-runtime-types';
 *
 * const context: IDotnetAcquireContext = {
 *     version: '8.0',
 *     requestingExtensionId: 'my-extension-id'
 * };
 *
 * const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
 * console.log(result.dotnetPath);
 * ```
 */

export { DotnetInstallMode } from './DotnetInstallMode';
export { DotnetInstallType } from './DotnetInstallType';
export { DotnetVersionSpecRequirement } from './DotnetVersionSpecRequirement';
export { AcquireErrorConfiguration, UninstallErrorConfiguration, EnsureDependenciesErrorConfiguration } from './ErrorConfiguration';
export { IDotnetAcquireContext } from './IDotnetAcquireContext';
export { IDotnetAcquireResult } from './IDotnetAcquireResult';
export { IDotnetEnsureDependenciesContext } from './IDotnetEnsureDependenciesContext';
export { IDotnetFindPathContext } from './IDotnetFindPathContext';
export { IDotnetListVersionsContext, IDotnetListVersionsResult, IDotnetVersion, DotnetVersionSupportStatus, DotnetVersionSupportPhase } from './IDotnetListVersionsContext';
export { IDotnetSearchContext } from './IDotnetSearchContext';
export { IDotnetSearchResult } from './IDotnetSearchResult';
export { IDotnetUninstallContext } from './IDotnetUninstallContext';
