# .NET Global Acquisition Engineering Spec

> :exclamation: This document is intended for use by DevKit and other teams in Microsoft who are moving to our new extension. However, it may be useful to those looking to install a global .NET SDK using our extension.

# Basic Usage

Currently, most extensions rely on the .NET Runtime Extension to acquire .NET. Of course, this only acquires the runtime, which means many devtool capabilities are not available. The .NET SDK Extension that is currently released only allows local installs. We have expanded the API to allow global installs.

The difference between requesting a local and global SDK is quite simple. You just set the global flag. As marked in https://github.com/dotnet/vscode-dotnet-runtime/issues/763, here is the spec:

```ts
export interface IDotnetAcquireContext {
    /**
     * @remarks
     * The data required to acquire either the sdk or the runtime.
     *
     * @property version - The major.minor version of the SDK or Runtime desired.
     *
     * NOTE: For global SDK installations, more options are available.
     * The version can be provided in the following format in this acquisition:
     * Major (e.g: 6)
     * Major.Minor (e.g: 3.1)
     * Feature Band (e.g: 7.0.1xx or 7.0.10x)
     * Specific Version / Fully-Qualified Version (e.g: 8.0.103)
     *
     * @property requestingExtensionId - The Extension that relies on our extension to acquire the runtime or .NET SDK. It MUST be provided.
     *
     * @property errorConfiguration - An set of options for the desired treat as error and error verbosity behaviors of the extension.
     *
     * @property installType - For SDK installations, allows either global or local installs.
     * Do NOT use the local install feature with the global install feature or any global install as it is currently unsupported.
     */
    version: string;
    requestingExtensionId?: string;
    errorConfiguration?: AcquireErrorConfiguration;
    installType?: DotnetInstallType;
}

/**
 * @remarks
 * Defines if an install should be global on the machine or local to a specific local folder/user.
 */
export type DotnetInstallType = 'local' | 'global';
```

As defined in the spec, you can use different version formats, such as a major, '7', a major minor, '8.0', a feature band, '7.0.2xx' or a fully specified version '7.0.102'. Note that linux does not have the same graunlarity of control as windows or mac.

A sample call to the extension to call a global install would look like this, and is included in our sample extension.

```ts

      try {
            await vscode.commands.executeCommand('dotnet-sdk.showAcquisitionLog');
            let commandContext : IDotnetAcquireContext = { version, requestingExtensionId, installType: 'global' };
            await vscode.commands.executeCommand('dotnet-sdk.acquire', commandContext);
        } catch (error) {
            vscode.window.showErrorMessage((error as Error).toString());
        }
```

You should also set the error configuration to disable error popups if you dont want our extension errors to pop up on the bottom right corner, so you can handle them.

```ts
    const issueContext = {
            errorConfiguration: AcquireErrorConfiguration.DisableErrorPopups;
        } as IIssueContext;
    };
```

# Our Linux Spec

If you are interested in seeing the differences of how our install works on Linux, you can check out this spec here: https://gist.github.com/nagilson/f5b4cf699df24f56d2335ce0c82ab761

# State of The Extension

As of 6/22/23, we have built out the functionality for Ubuntu but are testing it. We have not checked in as we do not desire to release the extension until linux is supported, as well as windows and mac.

While these are dev builds, the main installation API surface for you should not change, and it is unlikely callers of the extension would have any desire to add additional OS logic for using our extension. With this belief, we think we can provide you a .VSIX to allow the development of code that consumes our API, as well as the UI layers around it.

Our expectation is that DevKit will have a monthly release cadence. With this expectation, we plan to have a prod-level build in August, and would generally aim/expect the integration work to be finished for September.

# How to know what version to request

We have an API you can call to get the recommended version. I would suggest using it, as we plan on adding support for global.json in the future. But for now, it is important as it contains the logic to tell which version of dotnet is newest, yet in full-support, and is available on your machine. We have the knowledge for each linux distro and version thats supported which versions of dotnet are supported, which is logic you likely don't want to have to handle.

To call this api, simple do the following. It is also marked in the sample extension.

```ts
const result : IDotnetVersion | undefined = await vscode.commands.executeCommand('dotnet-sdk.recommendedVersion', { listRuntimes: false });
```

It returns the `IDotnetVersion`.

```ts

/**
 * @remarks
 * The result/response from the API to be implemented that returns available SDKs/Runtimes.
 */
export declare type IDotnetListVersionsResult = IDotnetVersion[];
export interface IDotnetVersion {
    /**
     * @remarks
     * Information regarding the version of the .NET SDK / Runtime.
     *
     * @property version - The full version of the SDK or Runtime. May include text such as -Preview.
     * @property channelVersion - The major.minor version.
     * @property supportPhase - Whether the version is actively in support or in some other stage of support.
     * @property supportStatus - Is the version in long-term support or 'standard-term' support
     */
    version: string;
    supportStatus: DotnetVersionSupportStatus;
    supportPhase: DotnetVersionSupportPhase;
    channelVersion: string;
}
```

# Waiting, Waiting, Waiting ...

The .NET SDK is a large piece of software. Depending on the internet connection and machine speed, installing and downloading everything necessary can take a good amount of time. For me, on faster machines I can see times within 5-25 seconds, slower machines may a minute or more.

This is not the extension being slow but rather just the cost of downloading a large file, and then the cost of the .NET installer (or apt-get install).

DevKit should almost certainly consider this and have some sort of UI showing that things are happening. We do provide periods that show we are still working, but not much else.

# What does the user see?

It should be clear that admin/elevation is required to install globally. We want to install globally so terminals outside of VSCode work.

If VSCode is under admin, the user should not see anything from our extension. If it is not however, on windows and mac they will see the actual installer manifest itself on top of vscode like so:

Linux users would see a sudo prompter such as pkexec asking for permissions.
![MicrosoftTeams-image](https://user-images.githubusercontent.com/23152278/248009734-d8b9e7a3-7e6d-46e7-badc-36e2f2c3893e.png)


If you want to learn more and see it in action, I have a demo here:
https://teams.microsoft.com/l/message/19:meeting_ZGU1MDMwMGYtZDU1Mi00Nzc2LTk4MDgtZjhjOWIwMDQ1ZGU3@thread.v2/1686588048444?context=%7B%22contextType%22%3A%22chat%22%7D

# Errors

Our extension will reject your request if there are issues. For example, the user may have a conflicting installation on their machine. Or their distro might not be supported. Or the version requested was invalid. To see all of our error types, I would look at the `EventStreamEvents.ts`. It is not yet comprehensive, but contains most errors we'd expect.

Generally speaking, you would probably want to use our error message in conjuction with a suggestion to manually install .NET if you still face issues. The errors we raise should be descriptive and give the user an action to fix the error, like to uninstall the version that would cause an install to fail. Though in some cases, such as if we do not support this individual's distro, then obviously there is not much we can do.

https://github.com/nagilson/vscode-dotnet-runtime/blob/015cbbafaae033982f3c99c13c9858c832b0f3eb/vscode-dotnet-runtime-library/src/EventStream/EventStreamEvents.ts

# Future Work

Some of this I expect to have been scoped on in recent days, I would suggest looking at the PM specs to see what's changed on DevKit's side.

## Runtime Work

Our extension will download a global runtime as well for the user, for now the .NET 6 runtime as it is the stable runtime, and eventually that will change to .NET 8. BUT users may target different target frameworks. We don't have access to the project system or MSBuild evaluation from the extension before .NET is installed, and this is separate logic from what the extension's purpose is (to install .NET).

We expect DevKit to parse the TargetFrameworks of a users project. We have an API (currently unsurfaced) to detect .NET runtimes that are on the machine. We should either have DevKit use that and tell us the runtimes that it needs that aren't installed, or simple have DevKit tell us to install the Runtimes if they aren't availbe.

This has not been speced out to my knowledge.

@forgind is developing a feature that may help you get the target frameworks easily!

## Update Work

We have suggested a gold-bar experience for DevKit and need an api surface to check for updates, and or then perform the update. This will require more collaboration. Generally, this will be minimal work on our end.

## Uninstall Work

We don't yet have an API to uninstall, though we do have some of the code to do so on linux. We expect this to be minimal work from our end. It is unclear to us how DevKit would expose an end-point to uninstall .NET, but it certainly should be an option. Perhaps this is more reason for us to add an 'installed runtimes' and 'installed sdks' API.

## From Our Side

We still need to add support for distros outside of Ubuntu and do more testing. We also need to create a threat model for our extension.
