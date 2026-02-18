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
- Installed via package manager on Linux (e.g., apt, dnf, yum)
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

**IMPORTANT:** If a user wants to pin which SDK their PROJECT uses (for \`dotnet build\`, \`dotnet run\`, etc.), existingDotnetPath is the WRONG setting. They should use \`global.json\` instead — see the "I want to use a local/repo-specific SDK" scenario below.

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

### "I want to use a local/repo-specific SDK (not a global install)"
→ This is NOT about existingDotnetPath! existingDotnetPath only controls which runtime VS Code extensions use internally.
→ Use the \`paths\` property in global.json (.NET 10 SDK+ required):
  1. Ensure .NET 10 SDK or later is installed (the host \`dotnet\` must be 10+)
  2. Place or install the desired SDK in a folder relative to the repo (e.g. \`.dotnet/\`)
  3. Create or modify \`global.json\` in the repo root:
\`\`\`json
{
  "sdk": {
    "version": "10.0.100",
    "paths": [ ".dotnet", "$host$" ],
    "errorMessage": "Required .NET SDK not found. Please run ./install.sh to install it."
  }
}
\`\`\`
  - \`paths\` lists directories to search for SDKs, in order. Paths are relative to the global.json location.
  - \`$host$\` is a special value meaning the location of the running \`dotnet\` executable (i.e. the global install).
  - The first matching SDK found wins.
  - This ONLY works with SDK commands (\`dotnet run\`, \`dotnet build\`, etc.), NOT with native apphost (\`app.exe\`) or \`dotnet app.dll\`.
→ Reference: https://learn.microsoft.com/en-us/dotnet/core/tools/global-json#paths

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

---

## CRITICAL: Behavior on Unsupported Platforms (WSL, Other Linux Distros, Preview Versions)

**NEVER tell the user that something is "unsupported" or "not available".** Instead, do what a knowledgeable developer would do without this extension.

### When to SKIP the install/uninstall tools entirely
Do NOT call the installDotNetSdk or uninstallDotNet tools on:
- **WSL** (Windows Subsystem for Linux)
- **Linux distros other than Ubuntu, Debian, or Red Hat (RHEL/Fedora/CentOS)**

The extension tools will fail on these platforms. Instead, go straight to running terminal commands.

### What to do instead
1. **Read the official install guide** at https://learn.microsoft.com/dotnet/core/install/linux to find the correct commands for the user's distro and version
2. **Run all the commands** needed (repo setup + install) together
3. The user should not need to know that the extension doesn't handle their platform — just get .NET installed

### Preview / Pre-release Versions
The extension tools may not support preview versions. Do not tell the user they are "unsupported". Instead:
Use your own knowledge to determine the best approach.

### Key Principles
1. **Skip the extension tool on known-unsupported platforms** — don't waste time calling it
2. **Never say "unsupported"** to the user — just do what needs to be done via terminal
3. **Reference https://learn.microsoft.com/dotnet/core/install/linux** for the correct Linux commands
4. **Ask the user for permission** before running install/uninstall commands in the terminal
5. **WSL is just Linux** — use the appropriate distro commands
`;
