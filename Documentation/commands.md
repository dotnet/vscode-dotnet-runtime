# Commands

This article outlines the commands exposed by the .NET Install Tool. To see these commands used in an extension, check out the [sample extension](https://github.com/dotnet/vscode-dotnet-runtime/tree/main/sample) in this repository. Note that the majority of these commands are not user facing, meaning they can only be called programatically using the [VSCode API](https://code.visualstudio.com/api/extension-guides/command#programmatically-executing-a-command) by other extensions.

---

## .NET Install Tool Extension Commands

---

### dotnet.acquire

> **Sample:** See [`sample.helloworld`](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/sample/src/extension.ts) and [`sample.dotnet.acquire`](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/sample/src/extension.ts) for usage examples.

This command will install a .NET runtime at a user-level folder. It accepts a [IDotnetAcquireContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireContext.ts) object and returns a [IDotnetAcquireResult](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireResult.ts), which contains the path to the .NET runtime executable. The extension will automatically identify and install the latest patch of the provided version. It is generally recommended that extension authors call this command immediately on every extension start up to ensure that the .NET runtime has been installed and is ready to use.

The `version` must be a major.minor version (e.g. `8.0`).

**Offline behavior:** If the machine is offline (or `forceUpdate` is not set), the extension will return an existing compatible installation matching the requested major.minor version instead of contacting the network. If no compatible install exists while offline, a warning is posted and the install attempt will eventually time out.

**Automatic updates:** Locally installed runtimes acquired through this command are automatically kept up to date. Approximately 5 minutes after VS Code launches (and at most once every 24 hours), the extension checks for newer patch versions of each installed major.minor runtime. If a newer patch is available, it is downloaded and the outdated patch is uninstalled—provided no other extension still depends on it. Ownership of the install is transferred so that all extensions that depended on the old version now reference the new one. This update runs silently; errors are surfaced as non-blocking warnings. The update is skipped entirely if the machine is offline.

### dotnet.acquireGlobalSDK

> **Sample:** See [`sample.dotnet.acquireGlobalSDK`](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/sample/src/extension.ts) for a usage example.

This command will install a .NET SDK in a system-level location. It accepts a [IDotnetAcquireContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireContext.ts) object and returns a [IDotnetAcquireResult](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireResult.ts).

The `version` accepts multiple formats:
- Major only: `6`
- Major.minor: `6.0`
- Feature band: `6.0.4xx` (resolves to the newest patch within that band)
- Fully specified: `6.0.402`

**Offline behavior:** If the machine is offline, the extension will attempt to find a compatible existing installation that it previously managed. In practice this rarely helps for global SDK installs, since externally installed SDKs are not tracked by the extension. If no compatible managed install is found while offline, a warning is posted and the install will time out.

### dotnet.acquireStatus

> **Sample:** See [`sample.dotnet.acquireStatus`](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/sample/src/extension.ts) for a usage example.

This command checks the status of a .NET installation without triggering a new acquisition. It accepts a [IDotnetAcquireContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireContext.ts) object and returns a [IDotnetAcquireResult](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireResult.ts) if the requested version is already installed, or `undefined` if it is not. Note that `acquireStatus` expects only a major.minor version, so fully specified versions will not be checked.

**Offline behavior:** If a compatible existing installation is found locally, it is returned immediately without network access. Version resolution to a full patch version does require network access; if offline with no cached install, the command will fail.

### dotnet.findPath

> **Sample:** See [`sample.dotnet.findPath`](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/sample/src/extension.ts) for a usage example.

You can execute this command to return a string to a dotnet executable path. This executable represents a 'hive' of runtimes and sdks. Pass it a [IDotnetFindPathContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetFindPathContext.ts) object. The `versionSpecRequirement` field is a [DotnetVersionSpecRequirement](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/DotnetVersionSpecRequirement.ts) that controls version matching. The major.minor will be respected based on the requirement you give (e.g. `greater_than_or_equal` will return a dotnet on the PATH that is >= the version requested).

The supported requirement values are:
- `equal` — exact major.minor match only.
- `greater_than_or_equal` — any version >= the requested major.minor.
- `less_than_or_equal` — any version <= the requested major.minor.
- `latestPatch` — highest installed patch within the same major, minor, and feature band (≥ the specified patch). Equivalent to `global.json` `rollForward: latestPatch`.
- `latestFeature` — highest installed feature band and patch within the same major.minor (≥ the specified feature band). Equivalent to `global.json` `rollForward: latestFeature`.
- `latestMajor` — equivalent to `greater_than_or_equal`. Same as `global.json` `rollForward: latestMajor`.
- `disable` — equivalent to `equal`. Same as `global.json` `rollForward: disable`.

The priority order for path lookup is:
1. VSCode Setting *(runtime and aspnetcore only; skipped for SDK mode)*
2. Shell-spawned dotnet discovery
3. PATH
4. Realpath of PATH (resolves symlinks)
5. DOTNET_ROOT
6. Extension-managed installs *(runtime and aspnetcore only; skipped for SDK mode or if `disableLocalLookup` is set)*
7. hostfxr records

This accounts for pmc installs, snap installs, bash configurations, and other non-standard installations such as homebrew.

This returns `undefined` if no matches are found.


### dotnet.availableInstalls

> **Sample:** See [`sample.dotnet.availableInstalls`](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/sample/src/extension.ts) for a usage example.

This command queries a dotnet host for all .NET installs it can discover (runtimes or SDKs). It accepts a [IDotnetSearchContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetSearchContext.ts) object and returns an array of [IDotnetSearchResult](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetSearchResult.ts). Each result contains the `mode`, `version`, `directory`, and `architecture` of a discovered install.

Both `mode` and `requestingExtensionId` are required in the context. The `dotnetExecutablePath` property is optional; if omitted, the value on `PATH` will be used, though providing an explicit path (e.g. one resolved by `dotnet.findPath`) is _strongly_ recommended.

### dotnet.listVersions

This command returns the available .NET SDK or runtime versions for download. It accepts an optional [IDotnetListVersionsContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetListVersionsContext.ts) object and returns an [IDotnetListVersionsResult](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetListVersionsContext.ts) (an array of `IDotnetVersion`). Set `listRuntimes` to `true` to list runtime versions; otherwise SDK versions are listed.

**Offline behavior:** This command requires network access to query available versions from Microsoft release metadata. It will fail if the machine is offline.

### dotnet.recommendedVersion

> **Sample:** See [`sample.dotnet-sdk.recommendedVersion`](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/sample/src/extension.ts) for a usage example.

This command returns the recommended .NET version to install. It accepts an optional [IDotnetListVersionsContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetListVersionsContext.ts) and returns an [IDotnetListVersionsResult](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetListVersionsContext.ts) containing a single `IDotnetVersion`—the newest version in the `active` support phase. If no active-support version is available, the newest available version is returned instead.

It is not aware of project or repo level requirements such as `global.json`, or the `targetframework`. It is, however, aware of the install support matrix and what versions are supported depending on the OS/Distro.

**Offline behavior:** Requires network access (delegates to `dotnet.listVersions`). Will fail if the machine is offline.

### dotnet.uninstall

You can execute this command to dereference / uninstall .NET, either the SDK or runtime, as long as it's managed by this extension. Pass it a [IDotnetAcquireContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireContext.ts) object containing the `version`, `mode`, `installType`, and `requestingExtensionId` of the install you want to remove. Returns `'0'` on success.

.NET will only be completely uninstalled if all extensions that relied on that version of .NET asked for it to be uninstalled.
Note that users can manually uninstall any version of .NET if they so choose and accept the risk.

### dotnet.uninstallPublic

This is a **user-facing** command that presents a quick-pick menu listing all .NET installations managed by this extension. The user can select a version to uninstall. If the selected version is still in use by other extensions, a warning is shown before proceeding. It accepts no parameters and has a void return type.

### dotnet.uninstallAll

> **Sample:** See [`sample.dotnet.uninstallAll`](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/sample/src/extension.ts) for a usage example.

This command uninstalls all .NET runtimes managed by this extension. It accepts an optional [IDotnetUninstallContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetUninstallContext.ts) object and returns `0` on success.

### dotnet.acquireGlobalSDKPublic

This is a **user-facing** command that opens an input box pre-filled with the recommended .NET SDK version and lets the user choose a version to install globally. It triggers `dotnet.recommendedVersion` to determine the default, then calls `dotnet.acquireGlobalSDK` to perform the installation. It accepts an optional [IDotnetAcquireContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireContext.ts) (only the `errorConfiguration` is used) and has a void return type.

**Offline behavior:** Requires network access for both version recommendation and SDK download. Will fail if the machine is offline.

### dotnet.showAcquisitionLog

> **Sample:** See [`sample.dotnet.showAcquisitionLog`](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/sample/src/extension.ts) for a usage example.

This command surfaces an output channel to the user which provides status messages during extension commands. It does not accept parameters and has a void return type.

### dotnet.ensureDotnetDependencies

This command is only applicable to Linux machines. It attempts to ensure that .NET dependencies are present and, if they are not, installs them or prompts the user to do so. It accepts a [IDotnetEnsureDependenciesContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetEnsureDependenciesContext.ts) object and has a void return type. It is no longer supported but remains to support legacy behavior.

### dotnet.reportIssue

This is a **user-facing** command that opens a pre-populated GitHub issue in the browser and copies the issue body to the clipboard. It does not accept parameters and has a void return type.

### dotnet.resetData

This is a **user-facing** command that uninstalls all .NET installations managed by this extension and resets extension state. It does not accept parameters and has a void return type. Equivalent to calling `dotnet.uninstallAll` with `DisplayAllErrorPopups` error configuration.

---

# JSON Installation

If you want the .NET runtime to be installed as soon as possible, you can also make an API request in your package.json.
Add a [IDotnetAcquireContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireContext.ts) object in a section titled 'x-dotnet-acquire' to do so. You don't need to include the `requestingExtensionId`.

This should go at the root of your `package.json`, and not in the `contributes` section.

When any extension is changed, or on startup, we will try to fulfill these requests.
The disadvantage to this approach is you cannot respond to a failure to install, check the status before making the request,
lookup the PATH first to see if there's a matching install, etc.

```json
"x-dotnet-acquire": {
    "version": "8.0",
    "mode": "aspnetcore"
}
```

Note: If you are a developer for a highly used extension or an extension that is provided by Microsoft, you may be in our 'skip' list to enhance performance.
Please check the list if this is not working for you and ask us to exclude you: [Skipped Extensions](vscode-dotnet-runtime-library/src/Acquisition/JsonInstaller.ts).