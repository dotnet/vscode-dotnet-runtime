/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

// Re-export from the types package.
// We re-export here rather than having internal consumers use the types package directly because:
// 1. During development, we use a local file reference (file:../vscode-dotnet-runtime-types)
// 2. This allows type changes to propagate immediately without publishing a new package version
// 3. The @dotnet/vscode-dotnet-runtime-types package is intended for EXTERNAL consumers only
export { DotnetInstallType, IDotnetAcquireContext } from '@dotnet/vscode-dotnet-runtime-types';
