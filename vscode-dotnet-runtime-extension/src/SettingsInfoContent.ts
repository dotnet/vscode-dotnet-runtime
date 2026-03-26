/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

/**
 * Comprehensive information for the AI agent about the .NET Install Tool extension.
 * This explains settings, architecture, installation types, and useful tricks.
 *
 * Extracted into its own file to keep LanguageModelTools.ts focused on tool logic.
 */
export const settingsInfoContent = `
# .NET Install Tool - Guide

## Overview
The .NET Install Tool is a VS Code extension that manages .NET installations. It serves two distinct purposes:
1. **For VS Code Extensions**: Automatically installs .NET runtimes that other extensions (C#, C# DevKit, Unity, Bicep, etc.) need to run their internal components
2. **For Users**: Provides commands to install .NET SDKs system-wide for development

---

## Installation Types

### LOCAL (Extension-Managed) Runtime Installs
- Small, isolated .NET runtime installs stored in VS Code's extension data folder
- NOT on the system PATH, NOT visible via \`dotnet --list-runtimes\`
- Used solely by VS Code extensions to run their internal components
- Auto-managed; users rarely need to interact with these
- The extension's uninstall list ONLY shows these local installs for runtimes

### GLOBAL/Admin SDK Installs (system-wide)
- System-wide .NET SDK installs (includes runtimes)
- Locations: Windows: \`C:\\Program Files\\dotnet\` (admin required) | macOS: \`/usr/local/share/dotnet\` (.pkg) | Linux: \`/usr/lib/dotnet\` or \`/usr/share/dotnet\` (package manager, officially Ubuntu/Debian only; WSL is not supported)
- Requires administrator/sudo privileges; users must accept elevation prompts
- IS on the system PATH after installation
- Visible via \`dotnet --list-sdks\` and \`dotnet --list-runtimes\`
- Use "Install .NET SDK System-Wide" command for this

---

## existingDotnetPath Setting (Commonly Misunderstood)

### What It Does
Controls which .NET runtime VS Code **extensions** use to run their internal components.

### What It Does NOT Do
- Does NOT change what .NET the user's code runs on
- Does NOT affect \`dotnet build\` or \`dotnet run\` commands
- Does NOT change a project's target framework

### When Users Need This
- Extensions fail to start with "could not find .NET runtime" errors
- Corporate/restricted environments where the extension cannot auto-download .NET
- Air-gapped machines without internet or PowerShell script execution restrictions
- User wants extensions to use a specific pre-installed .NET version

**IMPORTANT:** If a user wants to pin which SDK their PROJECT uses (for \`dotnet build\`, \`dotnet run\`, etc.), existingDotnetPath is the WRONG setting. They should use \`global.json\` instead — see the "I want to use a local/repo-specific SDK" scenario below.

Format:
\`\`\`json
"dotnetAcquisitionExtension.existingDotnetPath": [
  { "extensionId": "ms-dotnettools.csharp", "path": "C:\\\\Program Files\\\\dotnet\\\\dotnet.exe" }
]
\`\`\`

**sharedExistingDotnetPath** applies to ALL extensions at once:
\`\`\`json
"dotnetAcquisitionExtension.sharedExistingDotnetPath": "C:\\\\Program Files\\\\dotnet\\\\dotnet.exe"
\`\`\`

---

## How to See What's Installed

**Extension-Managed Local Installs:** Run the "Uninstall .NET" command — the dropdown shows all extension-managed installs.

**System-Wide Global Installs:** Run \`dotnet --list-sdks\` and \`dotnet --list-runtimes\` in terminal, or use the listInstalledVersions tool.

**listInstalledVersions Tool:** Calls \`dotnet.availableInstalls\` to scan SDKs/runtimes for a given dotnet executable. If no path provided, it uses PATH (the global install). Returns version, architecture, and directory for each install.

---

## Uninstall Notes

- The uninstall list only shows extension-managed installs, not system-wide ones
- **Trick:** To uninstall a global SDK not in the list, first install the SAME version via the extension (this registers it), then it appears in the uninstall list
- Global SDK uninstall requires the same admin/elevated privileges as installing

---

## Version Selection

Always check for \`global.json\` first — if present, install the version in \`sdk.version\` (respecting rollForward policy). If absent, install the latest LTS version.

### SDK vs Runtime Versioning
SDK and Runtime versions share the same **major.minor** but differ in patch:

| SDK Version | Includes Runtime |
|-------------|-----------------|
| 8.0.100     | 8.0.0           |
| 8.0.204     | 8.0.4           |
| 9.0.100     | 9.0.0           |

Installing an SDK always includes the corresponding runtime. If a user needs ".NET 8 runtime," installing the .NET 8 SDK provides both.

---

## global.json paths (.NET 10+)

For repo-local SDK resolution, use the \`paths\` property in global.json:
\`\`\`json
{
  "sdk": {
    "version": "10.0.100",
    "paths": [ ".dotnet", "$host$" ],
    "errorMessage": "Required .NET SDK not found. Run ./install.sh to install."
  }
}
\`\`\`
- \`paths\` lists directories to search for SDKs, in order (relative to global.json location)
- \`$host$\` = location of the running \`dotnet\` executable (i.e., the global install)
- First matching SDK wins
- Only works with SDK commands (\`dotnet run\`, \`dotnet build\`), NOT with native apphost
- The host \`dotnet\` must be .NET 10+
- Ref: https://learn.microsoft.com/en-us/dotnet/core/tools/global-json#paths

---

## Common Scenarios

- **"I want to develop .NET applications"** \u2192 Install an SDK globally via "Install .NET SDK System-Wide." This provides the \`dotnet\` CLI for build, run, test, and publish.
- **"C# extension won't start / can't find .NET"** \u2192 Check \`dotnet --version\` in terminal. If missing, install SDK globally. If installed but not detected, set existingDotnetPath or sharedExistingDotnetPath.
- **"Extension installed .NET but I can't use it in terminal"** \u2192 Extension-managed installs are LOCAL and not on PATH. For terminal/CLI usage, install globally.
- **"I want to use a different .NET version for my project"** \u2192 NOT existingDotnetPath. Create \`global.json\` in the project root or install the desired SDK globally.
- **"I want a local/repo-specific SDK (not global)"** \u2192 NOT existingDotnetPath. Use the \`paths\` property in global.json (.NET 10+ required) — see section above.
- **"Which dotnet does the C# extension use?"** \u2192 Use the findDotNetPath tool. It searches in order: existingDotnetPath setting \u2192 PATH \u2192 DOTNET_ROOT \u2192 extension-managed local installs.

---

## Other Settings

- **installTimeoutValue**: Seconds to wait for downloads (default: 600). Increase for slow connections.
- **proxyUrl**: HTTP proxy URL for corporate firewalls.

---

## .NET Hives Architecture
.NET supports multiple installation "hives" (locations). The extension manages its own hive separate from global installs:
- Extension installs do not conflict with system installs; users can have both extension-managed runtimes AND global SDKs
- The \`dotnet\` CLI only sees global installs, not extension-managed ones
- \`dotnet.findPath\` shows which hive C# DevKit and others will use
- \`dotnet.availableInstalls\` lists installs in a specific hive when given an executable path

## Unsupported Platforms

NEVER say "unsupported." On WSL or unsupported Linux distros, SKIP system level extension tools and use terminal commands from https://learn.microsoft.com/dotnet/core/install/linux. For preview versions, use your own knowledge.
`;
