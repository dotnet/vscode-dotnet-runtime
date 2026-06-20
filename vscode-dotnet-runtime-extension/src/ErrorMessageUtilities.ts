/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

/**
 * Heuristically detects whether an error/installer message indicates the user cancelled or declined an
 * elevation/credential prompt. Kept private to this module: the more robust check in CommandExecutor's
 * parseVSCodeSudoExecError is preferred everywhere else, and this heuristic does not consider exit code 126.
 * "did not grant permission" comes from @vscode/sudo-prompt when the UAC dialog is dismissed on Windows.
 */
function isUserCancellationMessage(message: string): boolean
{
    return /cancel|user rejected|user denied|password request|did not grant permission/i.test(message);
}

/**
 * Builds the message thrown for a failed `dotnet.uninstall` so the LLM-tool layer (and other callers) can
 * surface the real installer failure reason instead of a generic "another install may be in progress".
 */
export function buildUninstallFailureMessage(version: string, result: string): string
{
    const normalized = result.trim();
    const asNumber = Number(normalized);
    const detail = normalized !== '' && Number.isInteger(asNumber) ? `code ${normalized}` : normalized;
    return isUserCancellationMessage(normalized)
        ? `Uninstall of .NET ${version} was cancelled — the admin/elevation prompt was dismissed. Retry and accept the prompt to continue. (${detail})`
        : `Uninstall of .NET ${version} did not succeed (${detail}). The uninstaller may be blocked by another install in progress, or require manual removal.`;
}
