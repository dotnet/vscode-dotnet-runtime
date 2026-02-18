/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as vscode from 'vscode';
import
{
    AcquireErrorConfiguration,
    DotnetInstallMode,
    IDotnetAcquireContext,
    IDotnetAcquireResult,
    IDotnetFindPathContext,
    IDotnetListVersionsContext,
    IDotnetListVersionsResult,
    IDotnetSearchContext,
    IDotnetSearchResult,
    IDotnetVersion,
    IEventStream,
    LanguageModelToolInvoked,
    LanguageModelToolPrepareInvocation
} from 'vscode-dotnet-runtime-library';
import { settingsInfoContent } from './SettingsInfoContent';

/**
 * Tool name constants matching those in package.json
 */
export namespace ToolNames
{
    export const installSdk = 'install_dotnet_sdk';
    export const listVersions = 'list_available_dotnet_versions_to_install';
    export const listInstalledVersions = 'list_installed_dotnet_versions';
    export const findPath = 'find_dotnet_executable_path';
    export const uninstall = 'uninstall_dotnet';
    export const getSettingsInfo = 'get_settings_info_for_dotnet_installation_management';
}


/**
 * Registers all Language Model Tools for the .NET Install Tool extension.
 * These tools enable AI agents (like GitHub Copilot) to help users manage .NET installations.
 */
export function registerLanguageModelTools(context: vscode.ExtensionContext, eventStream: IEventStream): void
{
    // Install SDK Tool
    context.subscriptions.push(
        vscode.lm.registerTool(ToolNames.installSdk, new InstallSdkTool(eventStream))
    );

    // List Versions Tool
    context.subscriptions.push(
        vscode.lm.registerTool(ToolNames.listVersions, new ListVersionsTool(eventStream))
    );

    // Find Path Tool
    context.subscriptions.push(
        vscode.lm.registerTool(ToolNames.findPath, new FindPathTool(eventStream))
    );

    // Uninstall Tool
    context.subscriptions.push(
        vscode.lm.registerTool(ToolNames.uninstall, new UninstallTool(eventStream))
    );

    // Settings Info Tool
    context.subscriptions.push(
        vscode.lm.registerTool(ToolNames.getSettingsInfo, new GetSettingsInfoTool(eventStream))
    );

    // List Installed Versions Tool
    context.subscriptions.push(
        vscode.lm.registerTool(ToolNames.listInstalledVersions, new ListInstalledVersionsTool(eventStream))
    );
}

/**
 * Tool to install .NET SDK system-wide
 */
class InstallSdkTool implements vscode.LanguageModelTool<{ version?: string }>
{
    constructor(private readonly eventStream: IEventStream) {}

    prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<{ version?: string }>,
        token: vscode.CancellationToken
    ): vscode.PreparedToolInvocation
    {
        const input = JSON.stringify(options.input);
        this.eventStream.post(new LanguageModelToolPrepareInvocation(ToolNames.installSdk, input));

        const version = options.input?.version;
        return {
            invocationMessage: version
                ? `Installing .NET SDK version ${version}...`
                : `Installing latest .NET SDK (no version specified)...`,
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<{ version?: string }>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult>
    {
        const rawInput = JSON.stringify(options.input);
        this.eventStream.post(new LanguageModelToolInvoked(ToolNames.installSdk, rawInput));

        const version = options.input?.version;

        // Version is now required by the schema - if not provided, guide the model
        if (!version)
        {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    'ERROR: version parameter is required.\n\n' +
                    '**How to determine the version:**\n' +
                    '1. Check if the user specified a version\n' +
                    '2. Look for TargetFramework in .csproj files (net8.0 → use "8")\n' +
                    '3. Check for global.json sdk.version field\n' +
                    '4. If none found, call the listDotNetVersions tool first to get available versions, ' +
                    'then choose the latest "Active Support" version and call installDotNetSdk with that version.'
                )
            ]);
        }

        try
        {
            // Show the acquisition log so user can see progress
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');

            const acquireContext: IDotnetAcquireContext = {
                version: version,
                requestingExtensionId: 'ms-dotnettools.vscode-dotnet-runtime', // Self-reference for user-initiated installs
                installType: 'global',
                mode: 'sdk' as DotnetInstallMode,
                errorConfiguration: AcquireErrorConfiguration.DisplayAllErrorPopups,
                rethrowError: true // Rethrow errors so the LLM tool can capture the actual error message
            };

            const result: IDotnetAcquireResult | undefined = await vscode.commands.executeCommand(
                'dotnet.acquireGlobalSDK',
                acquireContext
            );

            if (result?.dotnetPath)
            {
                const platform = process.platform;
                const installMethod = platform === 'win32' ? 'MSI installer' : platform === 'darwin' ? 'PKG installer' : 'package manager';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `Successfully installed .NET SDK ${version} using the ${installMethod}.\n\n` +
                        `**Version:** ${version}\n` +
                        `**Installation path:** ${result.dotnetPath}\n\n` +
                        `You may need to restart your terminal or VS Code for PATH changes to take effect.\n\n` +
                        `To verify the installation, run: \`dotnet --version\``
                    )
                ]);
            } else
            {
                // No path returned means installation failed or was cancelled by the user
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `ERROR: The .NET SDK ${version} installation did NOT complete successfully.\n\n` +
                        `**The installation was either cancelled by the user or failed.** ` +
                        `This commonly happens when:\n` +
                        `- The user declined the administrator/elevation prompt\n` +
                        `- The user cancelled the installer dialog\n` +
                        `- The installation was interrupted\n\n` +
                        `**The SDK is NOT installed.** Please check the ".NET Install Tool" output channel for details.\n\n` +
                        `If the user wants to try again, they need to accept all prompts (including any admin/elevation dialogs).`
                    )
                ]);
            }
        } catch (error)
        {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isUserCancellation = /cancel|user rejected|user denied|password request/i.test(errorMessage);

            if (isUserCancellation)
            {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `The install of .NET SDK${version ? ` ${version}` : ''} was cancelled or rejected by the user.\n\n` +
                        `**Error:** ${errorMessage}\n\n` +
                        `Ask the user if they would like to try again. ` +
                        `If so, call this tool again with the same parameters. ` +
                        `They will need to accept all prompts (including any admin/elevation dialogs).`
                    )
                ]);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `The extension-based install of .NET SDK${version ? ` ${version}` : ''} did not succeed.\n\n` +
                    `**Error:** ${errorMessage}\n\n` +
                    `**Troubleshooting steps:**\n` +
                    `- Check the ".NET Install Tool" output channel for detailed logs\n` +
                    `- Ensure you have administrator/sudo privileges\n` +
                    `- Check your internet connection\n` +
                    `- Try running the "Install the .NET SDK System-Wide" command from the Command Palette\n\n` +
                    `If the above steps do not resolve the issue, **DO NOT tell the user this is unsupported.** Instead, install .NET via terminal commands.\n` +
                    `Look up the correct install commands for the user's platform at: https://learn.microsoft.com/dotnet/core/install/linux (for Linux) or use your own knowledge for other platforms.\n\n` +
                    `Run the appropriate command(s) in the terminal for the user's platform.`
                )
            ]);
        }
    }
}

/**
 * Tool to list available .NET versions
 */
class ListVersionsTool implements vscode.LanguageModelTool<{ listRuntimes?: boolean }>
{
    constructor(private readonly eventStream: IEventStream) {}

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<{ listRuntimes?: boolean }>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult>
    {
        const rawInput = JSON.stringify(options.input);
        this.eventStream.post(new LanguageModelToolInvoked(ToolNames.listVersions, rawInput));

        const listRuntimes = options.input.listRuntimes ?? false;

        try
        {
            const listContext: IDotnetListVersionsContext = {
                listRuntimes: listRuntimes
            };

            const versions: IDotnetListVersionsResult | undefined = await vscode.commands.executeCommand(
                'dotnet.listVersions',
                listContext,
                undefined // customWebWorker
            );

            if (!versions || versions.length === 0)
            {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `No ${listRuntimes ? 'runtime' : 'SDK'} versions could be retrieved. ` +
                        `This might be due to network issues. Please check your internet connection.`
                    )
                ]);
            }

            const versionType = listRuntimes ? 'Runtime' : 'SDK';
            let responseText = `# Available .NET ${versionType} Versions\n\n`;

            // Group by support phase for better readability
            const activeVersions = versions.filter((v: IDotnetVersion) => v.supportPhase === 'active');
            const maintenanceVersions = versions.filter((v: IDotnetVersion) => v.supportPhase === 'maintenance');
            const eolVersions = versions.filter((v: IDotnetVersion) => v.supportPhase === 'eol');

            if (activeVersions.length > 0)
            {
                responseText += `## ✅ Active Support (Recommended)\n`;
                responseText += `These versions receive regular updates including security fixes and new features.\n\n`;
                for (const v of activeVersions)
                {
                    responseText += `- **${v.version}**${v.channelVersion ? ` (Channel: ${v.channelVersion})` : ''}${v.supportPhase ? ` - ${v.supportPhase}` : ''}\n`;
                }
                responseText += '\n';
            }

            if (maintenanceVersions.length > 0)
            {
                responseText += `## 🔧 Maintenance Support\n`;
                responseText += `These versions only receive critical security fixes.\n\n`;
                for (const v of maintenanceVersions)
                {
                    responseText += `- **${v.version}**${v.channelVersion ? ` (Channel: ${v.channelVersion})` : ''}\n`;
                }
                responseText += '\n';
            }

            if (eolVersions.length > 0)
            {
                responseText += `## ⚠️ End of Life\n`;
                responseText += `These versions no longer receive updates. Upgrade recommended.\n\n`;
                for (const v of eolVersions)
                {
                    responseText += `- ${v.version}${v.channelVersion ? ` (Channel: ${v.channelVersion})` : ''}\n`;
                }
                responseText += '\n';
            }

            responseText += `\n**Recommendation:** Install an "Active Support" version for the best experience.\n\n`;
            responseText += `---\n`;
            responseText += `**⚠️ IMPORTANT FOR AI AGENT:** Present ALL versions from every category to the user. `;
            responseText += `Do NOT summarize or truncate ANY version list. Users need complete version details to choose correctly.`;

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(responseText)
            ]);
        } catch (error)
        {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `Failed to list .NET versions.\n\n**Error:** ${errorMessage}\n\n` +
                    `Please check your internet connection and try again.`
                )
            ]);
        }
    }
}

/**
 * Tool to find an existing .NET installation path
 */
class FindPathTool implements vscode.LanguageModelTool<{ version: string; mode?: string; architecture?: string }>
{
    constructor(private readonly eventStream: IEventStream) {}

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<{ version: string; mode?: string; architecture?: string }>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult>
    {
        const rawInput = JSON.stringify(options.input);
        this.eventStream.post(new LanguageModelToolInvoked(ToolNames.findPath, rawInput));

        const { version, mode, architecture } = options.input;

        if (!version)
        {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    'Please specify a .NET version to search for (e.g., "8.0" or "6.0").'
                )
            ]);
        }

        try
        {
            const resolvedMode = (mode as DotnetInstallMode) || 'runtime';
            const resolvedArchitecture = architecture || os.arch();

            const findContext: IDotnetFindPathContext = {
                acquireContext: {
                    version: version,
                    requestingExtensionId: 'ms-dotnettools.vscode-dotnet-runtime',
                    mode: resolvedMode,
                    architecture: resolvedArchitecture
                },
                versionSpecRequirement: 'greater_than_or_equal'
            };

            const result: IDotnetAcquireResult | undefined = await vscode.commands.executeCommand(
                'dotnet.findPath',
                findContext
            );

            if (result?.dotnetPath)
            {
                const modeDisplay = resolvedMode === 'sdk' ? 'SDK' : resolvedMode === 'aspnetcore' ? 'ASP.NET Core Runtime' : 'Runtime';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `# .NET ${modeDisplay} Found ✅\n\n` +
                        `**Version requested:** ${version} or later\n` +
                        `**Architecture:** ${resolvedArchitecture}\n` +
                        `**Path:** \`${result.dotnetPath}\`\n\n` +
                        `This is the dotnet executable that will be used. ` +
                        `${resolvedMode !== 'sdk' ? 'This is likely what extensions like C# and C# DevKit are using.' : ''}`
                    )
                ]);
            } else
            {
                const modeDisplay = resolvedMode === 'sdk' ? 'SDK' : resolvedMode === 'aspnetcore' ? 'ASP.NET Core Runtime' : 'Runtime';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `# .NET ${modeDisplay} Not Found ❌\n\n` +
                        `No .NET ${modeDisplay} version ${version} or later was found for architecture ${resolvedArchitecture}.\n\n` +
                        `**Search locations checked:**\n` +
                        `1. VS Code setting (existingDotnetPath)\n` +
                        `2. PATH environment variable\n` +
                        `3. DOTNET_ROOT environment variable\n` +
                        `4. VS Code-managed installations\n\n` +
                        `**To resolve:**\n` +
                        `${resolvedMode === 'sdk'
                            ? '- Run the "Install .NET SDK System-Wide" command or use the installDotNetSdk tool'
                            : '- Install the .NET SDK (which includes runtimes) using the "Install .NET SDK System-Wide" command'}\n` +
                        `- Or download from https://dotnet.microsoft.com/download\n` +
                        `- Or set the existingDotnetPath setting if .NET is installed in a non-standard location`
                    )
                ]);
            }
        } catch (error)
        {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `Failed to search for .NET installation.\n\n**Error:** ${errorMessage}\n\n` +
                    `Please check the ".NET Install Tool" output channel for more details.`
                )
            ]);
        }
    }
}

/**
 * Tool to uninstall .NET versions
 */
class UninstallTool implements vscode.LanguageModelTool<{ version?: string; mode?: string; global?: boolean }>
{
    constructor(private readonly eventStream: IEventStream) {}

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<{ version?: string; mode?: string; global?: boolean }>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult>
    {
        const rawInput = JSON.stringify(options.input);
        this.eventStream.post(new LanguageModelToolInvoked(ToolNames.uninstall, rawInput));

        const { version, mode, global } = options.input;

        try
        {
            // If no specific version provided, fall back to interactive picker
            if (!version)
            {
                await vscode.commands.executeCommand('dotnet.uninstallPublic');
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        'Launched the interactive .NET uninstall dialog. ' +
                        'The user was shown a dropdown to select which version to uninstall.\n\n' +
                        '**IMPORTANT:** The outcome is unknown - the user may have selected a version to uninstall, ' +
                        'or they may have cancelled the dialog. Ask the user if the uninstall succeeded.\n\n' +
                        'Tip: For faster uninstalls with known outcomes, call listInstalledDotNetVersions first, then provide version+mode.'
                    )
                ]);
            }

            // Specific version uninstall
            const resolvedMode = (mode as DotnetInstallMode) || 'sdk';
            const isGlobal = global ?? true;

            const acquireContext: IDotnetAcquireContext = {
                version: version,
                mode: resolvedMode,
                installType: isGlobal ? 'global' : 'local',
                requestingExtensionId: 'ms-dotnettools.vscode-dotnet-runtime',
                rethrowError: true // Rethrow errors so the LLM tool can capture the actual error message
            };

            const result: string = await vscode.commands.executeCommand('dotnet.uninstall', acquireContext);

            if (result === '0' || result === '')
            {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `Successfully uninstalled .NET ${resolvedMode === 'sdk' ? 'SDK' : 'Runtime'} ${version}.\n\n` +
                        `You may need to restart your terminal for changes to take effect.`
                    )
                ]);
            } else
            {
                // Non-zero or unexpected result - likely an error or cancellation
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `WARNING: Uninstall of .NET ${version} returned an unexpected result: ${result}\n\n` +
                        `**The uninstall may not have completed successfully.** ` +
                        `Check the ".NET Install Tool" output channel for details.`
                    )
                ]);
            }
        } catch (error)
        {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isUserCancellation = /cancel|user rejected|user denied|password request/i.test(errorMessage);

            if (isUserCancellation)
            {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `The uninstall of .NET${version ? ` ${version}` : ''} was cancelled or rejected by the user.\n\n` +
                        `**Error:** ${errorMessage}\n\n` +
                        `Ask the user if they would like to try again. ` +
                        `If so, call this tool again with the same parameters. ` +
                        `They will need to accept all prompts (including any admin/elevation dialogs).`
                    )
                ]);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `The extension-based uninstall of .NET${version ? ` ${version}` : ''} did not succeed.\n\n` +
                    `**Error:** ${errorMessage}\n\n` +
                    `**Troubleshooting steps:**\n` +
                    `- Check the ".NET Install Tool" output channel for detailed logs\n` +
                    `- Ensure you have administrator/sudo privileges\n` +
                    `- Check your internet connection\n\n` +
                    `If the above steps do not resolve the issue, **DO NOT tell the user this is unsupported.** Instead, uninstall .NET via terminal commands.\n` +
                    `Look up the correct uninstall commands for the user's platform at: https://learn.microsoft.com/dotnet/core/install/linux (for Linux) or use your own knowledge for other platforms.\n\n` +
                    `Run the appropriate command in the terminal for the user's platform.`
                )
            ]);
        }
    }
}

/**
 * Tool to get settings information
 */
class GetSettingsInfoTool implements vscode.LanguageModelTool<Record<string, never>>
{
    constructor(private readonly eventStream: IEventStream) {}

    invoke(
        options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
        token: vscode.CancellationToken
    ): vscode.LanguageModelToolResult
    {
        this.eventStream.post(new LanguageModelToolInvoked(ToolNames.getSettingsInfo, '{}'));

        // Also include current settings values for context
        const config = vscode.workspace.getConfiguration('dotnetAcquisitionExtension');
        const existingPath = config.get<string[]>('existingDotnetPath');
        const sharedPath = config.get<string>('sharedExistingDotnetPath');

        let currentSettingsInfo = '\n\n---\n\n# Current Settings Values\n\n';

        if (existingPath && existingPath.length > 0)
        {
            currentSettingsInfo += `**existingDotnetPath:** ${JSON.stringify(existingPath)}\n\n`;
        } else
        {
            currentSettingsInfo += `**existingDotnetPath:** Not configured (extension will auto-manage .NET)\n\n`;
        }

        if (sharedPath)
        {
            currentSettingsInfo += `**sharedExistingDotnetPath:** ${sharedPath}\n\n`;
        } else
        {
            currentSettingsInfo += `**sharedExistingDotnetPath:** Not configured\n\n`;
        }

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(settingsInfoContent + currentSettingsInfo)
        ]);
    }
}

/**
 * Tool to list installed .NET versions for a given dotnet executable/hive
 */
class ListInstalledVersionsTool implements vscode.LanguageModelTool<{ dotnetPath?: string; mode?: string }>
{
    constructor(private readonly eventStream: IEventStream) {}

    prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<{ dotnetPath?: string; mode?: string }>,
        token: vscode.CancellationToken
    ): vscode.PreparedToolInvocation
    {
        this.eventStream.post(new LanguageModelToolPrepareInvocation(ToolNames.listInstalledVersions, JSON.stringify(options.input)));
        return {
            invocationMessage: 'Querying installed .NET SDKs and Runtimes via extension API (no terminal command needed)',
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<{ dotnetPath?: string; mode?: string }>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult>
    {
        this.eventStream.post(new LanguageModelToolInvoked(ToolNames.listInstalledVersions, JSON.stringify(options.input)));
        const { dotnetPath, mode } = options.input;

        try
        {
            const pathInfo = dotnetPath ? `Queried path: \`${dotnetPath}\`` : 'Queried: system PATH (global install)';

            // If no mode specified, return BOTH SDKs and Runtimes (like dotnet --info)
            if (!mode)
            {
                const sdkContext: IDotnetSearchContext = {
                    mode: 'sdk',
                    requestingExtensionId: 'ms-dotnettools.vscode-dotnet-runtime'
                };
                const runtimeContext: IDotnetSearchContext = {
                    mode: 'runtime',
                    requestingExtensionId: 'ms-dotnettools.vscode-dotnet-runtime'
                };

                if (dotnetPath)
                {
                    sdkContext.dotnetExecutablePath = dotnetPath;
                    runtimeContext.dotnetExecutablePath = dotnetPath;
                }

                const [sdkResults, runtimeResults] = await Promise.all([
                    vscode.commands.executeCommand<IDotnetSearchResult[]>('dotnet.availableInstalls', sdkContext),
                    vscode.commands.executeCommand<IDotnetSearchResult[]>('dotnet.availableInstalls', runtimeContext)
                ]);

                let resultText = `# Installed .NET SDKs and Runtimes\n\n`;
                resultText += `${pathInfo}\n\n`;

                // SDKs section
                resultText += `## SDKs\n\n`;
                if (sdkResults && sdkResults.length > 0)
                {
                    resultText += '| Version | Architecture |\n';
                    resultText += '|---------|--------------|\n';
                    for (const install of sdkResults)
                    {
                        resultText += `| ${install.version} | ${install.architecture || 'unknown'} |\n`;
                    }
                }
                else
                {
                    resultText += `No SDKs installed.\n\n`;
                }

                // Runtimes section - group by mode for compact display
                resultText += `\n## Runtimes\n\n`;
                if (runtimeResults && runtimeResults.length > 0)
                {
                    // Group runtimes by their mode (each result already has mode set to 'runtime' or 'aspnetcore')
                    const runtimesByMode = new Map<string, string[]>();
                    for (const install of runtimeResults)
                    {
                        const modeKey = install.mode ?? 'runtime';
                        if (!runtimesByMode.has(modeKey))
                        {
                            runtimesByMode.set(modeKey, []);
                        }
                        runtimesByMode.get(modeKey)!.push(install.version);
                    }

                    // Display grouped runtimes with friendly names
                    const modeDisplayNames: Record<string, string> = {
                        'runtime': 'Microsoft.NETCore.App (.NET Runtime)',
                        'aspnetcore': 'Microsoft.AspNetCore.App (ASP.NET Core Runtime)',
                    };

                    resultText += '| Runtime | Versions |\n';
                    resultText += '|---------|----------|\n';
                    for (const [modeKey, versions] of runtimesByMode)
                    {
                        const displayName = modeDisplayNames[modeKey] ?? modeKey;
                        // Sort versions and join with commas
                        const sortedVersions = versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                        resultText += `| ${displayName} | ${sortedVersions.join(', ')} |\n`;
                    }
                }
                else
                {
                    resultText += `No Runtimes installed.\n\n`;
                }

                resultText += `\n---\n`;
                resultText += `**⚠️ IMPORTANT FOR AI AGENT:** Present ALL SDK and Runtime versions listed above to the user. `;
                resultText += `Do NOT summarize or truncate the version lists. Users need to see every installed version to make informed decisions.`;

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(resultText)
                ]);
            }

            // Guard against unsupported modes (e.g. 'windowsdesktop')
            const lowerMode = mode?.toLowerCase();
            if (lowerMode && lowerMode !== 'sdk' && lowerMode !== 'runtime' && lowerMode !== 'aspnetcore')
            {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `The mode '${mode}' is not supported by this tool.\n\n` +
                        `**Supported modes:** sdk, runtime, aspnetcore\n\n` +
                        `**Note:** Windows Desktop Runtime (Microsoft.WindowsDesktop.App) is not tracked by this extension. ` +
                        `To check installed Windows Desktop Runtimes, run \`dotnet --list-runtimes\` in the terminal and look for 'Microsoft.WindowsDesktop.App' entries.`
                    )
                ]);
            }

            // Specific mode requested
            const resolvedMode: DotnetInstallMode = (lowerMode === 'runtime' || lowerMode === 'aspnetcore')
                ? lowerMode as DotnetInstallMode
                : 'sdk';

            const searchContext: IDotnetSearchContext = {
                mode: resolvedMode,
                requestingExtensionId: 'ms-dotnettools.vscode-dotnet-runtime'
            };

            if (dotnetPath)
            {
                searchContext.dotnetExecutablePath = dotnetPath;
            }

            const results: IDotnetSearchResult[] = await vscode.commands.executeCommand(
                'dotnet.availableInstalls',
                searchContext
            );

            if (!results || results.length === 0)
            {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `# No .NET ${resolvedMode === 'sdk' ? 'SDKs' : 'Runtimes'} Found\n\n` +
                        `${pathInfo}\n\n` +
                        `**Suggestions:**\n` +
                        `- Install .NET using the \`installSdk\` tool\n` +
                        `- Verify the PATH includes the .NET installation directory`
                    )
                ]);
            }

            // Format the results
            let singleModeResultText = `# Installed .NET ${resolvedMode === 'sdk' ? 'SDKs' : 'Runtimes'}\n\n`;
            singleModeResultText += `${pathInfo}\n\n`;

            singleModeResultText += '| Version | Architecture | Directory |\n';
            singleModeResultText += '|---------|--------------|----------|\n';

            for (const install of results)
            {
                singleModeResultText += `| ${install.version} | ${install.architecture || 'unknown'} | \`${install.directory}\` |\n`;
            }

            singleModeResultText += `\n---\n`;
            singleModeResultText += `**⚠️ IMPORTANT FOR AI AGENT:** Present ALL ${results.length} versions listed above to the user. `;
            singleModeResultText += `Do NOT summarize or truncate. Users need complete version information.`;

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(singleModeResultText)
            ]);
        } catch (error)
        {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `Failed to list installed .NET versions.\n\n` +
                    `**Error:** ${errorMessage}\n\n` +
                    `**Troubleshooting:**\n` +
                    `- Ensure .NET is installed on the system\n` +
                    `- If specifying a path, verify the dotnet executable exists there\n` +
                    `- Use the installSdk tool to install .NET`
                )
            ]);
        }
    }
}
