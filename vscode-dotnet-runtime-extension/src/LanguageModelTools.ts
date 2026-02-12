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
 * Comprehensive information for the AI agent about the .NET Install Tool extension.
 * This explains settings, architecture, installation types, and useful tricks.
 */
const settingsInfoContent = `
# .NET Install Tool - Complete Guide for AI Agents

## Overview
The .NET Install Tool is a VS Code extension that helps manage .NET installations. It serves TWO distinct purposes:
1. **For VS Code Extensions**: Automatically installs .NET runtimes that OTHER extensions (like C#, C# DevKit) need to run
2. **For Users**: Provides commands to install .NET SDKs system-wide for development

---

## CRITICAL: Understanding Installation Types

### 1. LOCAL Runtime Installs (Extension-Managed)
**What:** Small, isolated .NET runtime installations managed by this extension
**Where:** Stored in VS Code's extension data folder (NOT in Program Files, NOT on PATH)
**Purpose:** Used by VS Code extensions (C#, C# DevKit, Unity, Bicep, Etc) to run their internal components
**Key Points:**
- These are NOT visible via \`dotnet --list-runtimes\` in terminal
- These are NOT on the system PATH
- Users should NOT use these for their own projects
- The extension auto-manages these - users rarely need to interact with them
- Uninstall list ONLY shows these local installs for runtimes

### 2. GLOBAL/Admin SDK Installs
**What:** System-wide .NET SDK installations (includes runtimes)
**Where:**
  - Windows: \`C:\\Program Files\\dotnet\` (requires admin/elevated privileges)
  - macOS: \`/usr/local/share/dotnet\`
  - Linux: \`/usr/lib/dotnet\` or \`/usr/share/dotnet\`
**Purpose:** For users to BUILD and RUN their own .NET projects
**Key Points:**
- Installed via MSI on Windows (users may not know this term - just say "system installer")
- Installed via package manager on Linux (e.g., apt, yum) - only Ubuntu/Debian are officially supported. WSL is not.
- Installed via a .pkg on MacOS
- Requires administrator/sudo privileges, and the user must accept the prompts
- IS on the system PATH after installation
- Visible via \`dotnet --list-sdks\` and \`dotnet --list-runtimes\`
- Use "Install .NET SDK System-Wide" command for this

---

## The existingDotnetPath Setting (COMMONLY MISUNDERSTOOD!)

### What It Actually Does
Controls which .NET runtime VS Code **extensions** use to run their internal components.

### What It Does NOT Do
- Does NOT change what .NET your CODE runs on
- Does NOT affect \`dotnet build\` or \`dotnet run\` commands
- Does NOT change your project's target framework

### When Users Need This Setting
1. Extensions fail to start with "could not find .NET runtime" errors
2. Corporate/restricted environments where the extension cannot auto-download .NET
3. Air-gapped machines without internet access or powershell script execution restrictions
4. User wants extensions to use a specific pre-installed .NET version

### Correct Format
\`\`\`json
"dotnetAcquisitionExtension.existingDotnetPath": [
  {
    "extensionId": "ms-dotnettools.csharp",
    "path": "C:\\\\Program Files\\\\dotnet\\\\dotnet.exe"
  }
]
\`\`\`

### sharedExistingDotnetPath
Same purpose but applies to ALL extensions at once (simpler):
\`\`\`json
"dotnetAcquisitionExtension.sharedExistingDotnetPath": "C:\\\\Program Files\\\\dotnet\\\\dotnet.exe"
\`\`\`

---

## How to See What's Installed

### Extension-Managed Local Installs
- Run the "Uninstall .NET" command - the dropdown shows all extension-managed installs
- These are the ONLY installs the extension's uninstall feature directly manages

### System-Wide Global Installs
- Run in terminal: \`dotnet --list-sdks\` (shows SDKs)
- Run in terminal: \`dotnet --list-runtimes\` (shows runtimes)
- Use the "Find .NET Path" tool to locate installations
- **Use the "List Installed Versions" tool** - queries what's installed for a given dotnet host

### Using the listInstalledVersions Tool
This tool calls \`dotnet.availableInstalls\` to scan what SDKs/runtimes are installed for a specific dotnet executable.
- If no path provided: Uses PATH (i.e., the global install)
- Returns version, architecture, and directory for each install
- Great for checking what's ALREADY installed before installing more

---

## Uninstall Tricks & Tips

### The Uninstall List Only Shows Extension-Managed Installs
The extension's uninstall command only lists .NET versions that IT installed locally.

### TRICK: Uninstalling a Global SDK Not in the List
If a user wants to uninstall a system-wide SDK (like one in C:\\Program Files) that's not showing in the uninstall list:
1. Use the "Install .NET SDK System-Wide" command with the SAME version
2. The extension will detect it's already installed and REGISTER it
3. Now it will appear in the uninstall list and can be removed

### Global SDK Uninstall Requires Admin
Uninstalling global SDKs requires the same admin/elevated privileges as installing them.

---

## Choosing Which Version to Install

### Check for global.json First!
Before installing .NET, ALWAYS check if the project has a \`global.json\` file in the project root. This file pins the SDK version the project requires:

\`\`\`json
{
  "sdk": {
    "version": "8.0.100",
    "rollForward": "latestFeature"
  }
}
\`\`\`

**If global.json exists:** Install the version specified in the \`sdk.version\` field (or a compatible one based on rollForward policy).

**If no global.json:** Install the latest LTS (Long Term Support) version, or ask the user which version they prefer.

### SDK vs Runtime Versioning (IMPORTANT!)
SDK and Runtime versions do NOT match exactly, but they DO share the same **major.minor** version:

| SDK Version | Includes Runtime Version |
|-------------|-------------------------|
| 8.0.100     | 8.0.0                   |
| 8.0.204     | 8.0.4                   |
| 9.0.100     | 9.0.0                   |

**Key insight:** Installing an SDK **always includes** the corresponding runtime for that major.minor version.

So if a user needs ".NET 8 runtime", you can install the .NET 8 SDK and they'll get both:
- The SDK (for building)
- The runtime (for running)

### When User Asks for "Runtime Only"
- If they just want to RUN .NET apps (not build): They technically only need the runtime
- But the SDK includes the runtime, so installing the SDK works fine
- The global "Install .NET SDK System-Wide" command installs the SDK (which includes runtimes)
- Extension-managed LOCAL installs can be runtime-only (for extension use)

---

## Common User Scenarios

### "I want to develop .NET applications"
→ Install an SDK globally: Use "Install .NET SDK System-Wide" command
→ This gives them \`dotnet\` CLI access for build, run, test, publish

### "C# extension won't start / can't find .NET"
→ First check if .NET is installed: \`dotnet --version\` in terminal
→ If not installed: Install SDK globally
→ If installed but not detected: Set existingDotnetPath or sharedExistingDotnetPath

### "I want to use a different .NET version for my project"
→ This is NOT about existingDotnetPath!
→ Options:
  1. Create global.json in project root: \`{ "sdk": { "version": "8.0.100" } }\`
  2. Install the desired SDK version globally
  3. Modify PATH to prioritize a specific dotnet installation

### "How do I know which dotnet the C# extension is using?"
→ Use the "Find .NET Path" tool - it searches in priority order:
  1. existingDotnetPath setting
  2. PATH environment variable
  3. DOTNET_ROOT environment variable
  4. Extension-managed local installs

### "The extension installed .NET but I can't use it in terminal"
→ Extension-managed installs are LOCAL and not on PATH
→ For terminal/CLI usage, install globally with "Install .NET SDK System-Wide"

---

## Other Useful Settings

- **installTimeoutValue**: Seconds to wait for downloads (default: 600). Increase for slow connections.
- **proxyUrl**: HTTP proxy URL if behind a corporate firewall

---

## Architecture Note: .NET "Hives"
.NET supports multiple installation "hives" (locations). The extension manages its own hive separate from global installs. This is why:
- Extension installs don't conflict with system installs
- Users can have both extension-managed runtimes AND global SDKs
- The \`dotnet\` CLI only sees global installs, not extension-managed ones
- The 'dotnet.findPath' VS Code command we provide shows which hive will be used by C# DevKit and others.
- The 'dotnet.availableInstalls' command lists what installs are in that hive if you specify the executable with the call.
`;

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
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `Failed to install .NET SDK${version ? ` ${version}` : ''}.\n\n` +
                    `**Error:** ${errorMessage}\n\n` +
                    `**Troubleshooting:**\n` +
                    `- Ensure you have administrator/sudo privileges\n` +
                    `- Check your internet connection\n` +
                    `- Check the ".NET Install Tool" output channel for detailed logs\n` +
                    `- Try running the "Install the .NET SDK System-Wide" command from the Command Palette`
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
                for (const v of eolVersions.slice(0, 5))
                { // Limit EOL versions shown
                    responseText += `- ${v.version}${v.channelVersion ? ` (Channel: ${v.channelVersion})` : ''}\n`;
                }
                if (eolVersions.length > 5)
                {
                    responseText += `- ... and ${eolVersions.length - 5} more EOL versions\n`;
                }
                responseText += '\n';
            }

            responseText += `\n**Recommendation:** Install an "Active Support" version for the best experience with regular updates and features.`;

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
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `Failed to uninstall .NET${version ? ` ${version}` : ''}.\n\n` +
                    `**Error:** ${errorMessage}\n\n` +
                    `**Troubleshooting:**\n` +
                    `- For global installs, ensure you have administrator/sudo privileges\n` +
                    `- The version may be in use by other extensions - try closing VS Code first\n` +
                    `- Use the interactive command: run "Uninstall .NET" from the Command Palette`
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
                    resultText += '| Version | Architecture | Directory |\n';
                    resultText += '|---------|--------------|----------|\n';
                    for (const install of sdkResults)
                    {
                        resultText += `| ${install.version} | ${install.architecture || 'unknown'} | \`${install.directory}\` |\n`;
                    }
                    resultText += `\n**Total:** ${sdkResults.length} SDK(s) found\n\n`;
                }
                else
                {
                    resultText += `No SDKs installed.\n\n`;
                }

                // Runtimes section
                resultText += `## Runtimes\n\n`;
                if (runtimeResults && runtimeResults.length > 0)
                {
                    resultText += '| Version | Architecture | Directory |\n';
                    resultText += '|---------|--------------|----------|\n';
                    for (const install of runtimeResults)
                    {
                        resultText += `| ${install.version} | ${install.architecture || 'unknown'} | \`${install.directory}\` |\n`;
                    }
                    resultText += `\n**Total:** ${runtimeResults.length} Runtime(s) found\n\n`;
                }
                else
                {
                    resultText += `No Runtimes installed.\n\n`;
                }

                resultText += `**✅ This result is COMPLETE for initial queries. After installing .NET via the installSdk tool, you may use terminal commands to verify the install succeeded.**`;

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(resultText)
                ]);
            }

            // Specific mode requested
            const resolvedMode: DotnetInstallMode = (mode?.toLowerCase() === 'runtime' || mode?.toLowerCase() === 'aspnetcore')
                ? mode.toLowerCase() as DotnetInstallMode
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

            singleModeResultText += `\n**Total:** ${results.length} ${resolvedMode === 'sdk' ? 'SDK(s)' : 'Runtime(s)'} found\n\n`;
            singleModeResultText += `**✅ This result is COMPLETE for initial queries. After installing .NET via the installSdk tool, you may use terminal commands to verify.**`;

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
