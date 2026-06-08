/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as path from 'path';

/**
 * Computes the root folder under which this extension keeps its VS Code-managed ("local") .NET installs,
 * given the extension's global storage path. Centralizes the install-folder-name resolution so callers
 * outside of IInstallationDirectoryProvider (e.g. the language model tools) classify paths identically.
 */
export function getVSCodeManagedDotnetRoot(globalStoragePath: string): string
{
    const installFolderName = process.env._VSCODE_DOTNET_INSTALL_FOLDER || '.dotnet';
    return path.join(globalStoragePath, installFolderName);
}

/**
 * Returns true when `candidate` resolves to the VS Code-managed install root (`managedRoot`) or a path nested
 * inside it. Uses a normalized relative-path containment check (not a naive string prefix) so sibling folders
 * that merely share a prefix (e.g. `<root>-evil`) and `..` traversal cannot be mistaken for managed paths.
 * On Windows the comparison is case-insensitive to match the platform's path semantics.
 */
export function isVSCodeManagedPath(candidate: string, managedRoot: string): boolean
{
    if (!candidate || !managedRoot)
    {
        return false;
    }

    const normalize = (p: string): string => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
    const relative = path.relative(normalize(managedRoot), normalize(candidate));
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export abstract class IInstallationDirectoryProvider
{
    constructor(protected storagePath: string) {}

    public abstract getInstallDir(installId: string): string;

    public getStoragePath(): string
    {
        return getVSCodeManagedDotnetRoot(this.storagePath);
    }
}


