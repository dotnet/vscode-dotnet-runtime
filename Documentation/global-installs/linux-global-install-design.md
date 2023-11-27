

# How to install the .NET SDK on Linux (VS Code):

When we say we are doing a 'global' linux install, we mean to install dotnet through the distro's preferred package manager. When doing this, we will either download off the distro's feed if available, if that's unavailable, then we will use the Microsoft feed. We cannot mix the feeds, so we will only support one or the other.

This website provides much more context: https://learn.microsoft.com/dotnet/core/install/linux

## Determining .NET SDK Version to Install

### Data Available:

There's the SDK in the `global.json`. We'd need an 'API' to read from that as it doesn't exist currently. We may be able to use https://github.com/actions/setup-dotnet/blob/main/src/setup-dotnet.ts#L98-L113.

There's the `rollforward` option in the `global.json` which is a 2nd segment of determining which version we'd want.

`TargetFrameworks` is a property that we can read the highest value of (theoretically) and grab that SDK. There is no library for parsing this in typescript. We may  be able to run C# code in typescript. But we'd also need to parse MSBuild. So we'd need an SDK just to download the SDK. Ideally we could get this information from the C# DevKit. This would also tell us what runtime(s) may be needed.

> :exclamation: We decided to install the newest available SDKs that are in support. We use our own distro-install files to determine this. @leecow is working on an API so we don't need to ship a new version to support newer major releases of distros.

> :bulb: As for determining the newest SDK available, keep reading. We did this because it minimizes problems that can occur with several VS Codes being open at once and to get this feature out sooner rather than later. We will also install the latest in-support runtime that is most commonly used, which is currently 6.0 and will be hard-coded to 6.0 until we see customer data support for switching the default to 8.0. This will not be part of the first set of PRs.


In the future we will add support for `global.json` parsing.

### When to Install?

Pivots:

* An SDK Installation Exists that Satisfies the Version Constraint

* An SDK Exists that Conflicts. See the `Conflicting SDKs` section.

* No SDK Exists.



If a global (not local) SDK Exists that satisfies the constraint, then we don't install.
We can check this on linux via the `currentInstallationInfoCommand` with the major/minor on linux that is requested.

#### The 'constraint'?

The constraint is that it's of the desired SDK version. For windows/mac that means the major.minor.featureband. Not the patch version, we don't have that granularity. (We're limited by what's released in the releases.json and what installers are available.)


For linux: On all distros for distro feeds that means the major.minor. At this point in time that's the limit of our granularity. For microsoft feeds, we could allow major.minor.band, but then we'd have a different support policy on the version per distro, and that's very confusing. My opinion is that we shouldn't do this. Perhaps this is an indication that we only use the microsoft packages, but I'd prefer not to do that as we'd like to use what comes in the feed with the distro if possible.

If no SDK exists, follow the `Which SDK to Install` section.

> :exclamation: Our decision is to install iff there is no conflicting SDK.

### Which SDK to install?

We _will_ install the newest in support SDK that's also available for the OS/distro.

We could use the version in global.json SDK if that's specified. (major.minor.band for win/mac, major.minor respected for linux.) If no global.json is specified, we use the newest.
If `rollforward` is added, then we could follow that. But we'd need to implement logic to respect that and won't support that in the initial release.

To do the install on linux, we just run the `installCommand`.


> :exclamation: We will install the latest .NET SDK.

### Newest on Win/Mac -- The Available SDK API:
This uses the data from:
https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json

We created an API to get the newest SDKs available that were in support. We can use this for Windows and Mac to tell which SDK to use.

> :bulb:
We added the `support-phase` option to it and we can just install the newest version (first returned) by checking the for an `active` `support-phase`.


For Linux, this doesn't say which ones are actually in support.

### Newest on Linux: Distro API + Newest SDK API:
We can take the intersection of the majors from the available API from above + the distro file and use that as the newest version.

## Conflicting SDKs

SDKs on the machine can be side by side but they can still conflict with one another.

To my knowledge, you can only have one SDK for each major.minor.band on the machine on win/mac. But only one can be global.

For Linux with distro feeds you can have only one SDK for each major.minor since only 100 level bands are supported.

For windows/mac, the .NET SDK installer will fail or not allow you to install if the SDKs will conflict. But we still need to detect this ourselves and can do less wasted work this way.

For Windows we can read the registry.
For Mac, we have our own installation location.
For Linux: it's complicated!

### What counts as 'conflicting' on Linux:

- If a custom dotnet installation exists, we should count that as conflicting and do absolutely nothing (aka, fail with a custom error such as `DotnetCustomInstallExistsError`) and ask the user to uninstall it or manually manage their SDK(s).)

What counts as a 'custom dotnet' and how do we find it?

1) The `installedSDKVersionsCommand` can help us list all installed .NET SDKs. If the directory of that installation isn't the `expectedInstallationDirectory` then it's custom.

> :exclamation: This dotnet may not show up if you're running with different environment variable settings that override ours but there is not much we can do about this. This is a behavior of `dotnet --list-sdks`.

2) An existing version with a different patch but same major.minor.band is conflicting. Generally speaking, I believe we could update if the requested version is newer. Though we don't be able to update to the specific version, only the newest. This should be OK.

3) A global .NET SDK exists on the machine that's newer than the requested major.minor. This is only conflicting in the sense that you can only have one global SDK and we don't want to clobber the newer one. In this case, we should reject the request with a specific error.

## Update Experience:

_We should provide a `checkForUpdates` command._ It can check the releases.json api we publish online, and then if thats a newer version than what you're on, then ask for admin and run the sudo command to update packages on the machine. For Microsoft packages, we have an undefined behavior currently, to do nothing.

We currently would ship distro .net versions in support via the files described below.
This would mean to add a new major.minor SDK for linux we would have to manually update the files. In addition, a newer version of the extension would be required to update on linux to a newly supported major.minor SDK. We don't have a good way around this until we have an online API for .NET linux support status, unless we want to rely on exclusively microsoft packages.

What we can do without an extension update is update the patch version. This we could do automatically. We could check the releases.json API for a new patch and if it exists, run an update. The cadence for releases may not line up 1:1 with the distro packages and our official releases, but they should be roughly similar.

We'd need the `isInstalledCommand` to check the version of the existing package for the major.minor.
From there, if there's an update available on releases.json, we could suggest to try updating.
`apt-update` requires `sudo` which means we'll need to ask for elevation and we'd prefer not to do that to check for updates.

If we are allowed to update and want to try doing so, we simply run the `updateCommand`.

For DevKit to decide:
Any UI is outside of the scope of the extensions we own.
How often do we check for updates?
How do we prompt the user to update? Do we do it at all?

## Multiple VS Codes with Different Workspaces

_DevKit will install 1 SDK (the bewest recommended one) so we don't need to worry about that._

A user could open multiple VS Code windows with different .NET SDK requirements.
Most of this is in `Conflicting SDKs`. But only 1 SDK can be on the path globally at a time.

We should use the newest SDK that is on the machine, which is generally what I'd expect to happen (7.0 install on top of an existing 6.0 install would be chosen. And we wouldn't allow a 6.0 SDK to be put on top of a 7.0 SDK.)

The runtimes would be managed in the other section. Using a newer SDK for older runtimes should still be fine. There may be (?) customizations or differences between the old sdk and a newer sdk, but I don't think it's worth the cost (if we can _even_ do anything at all) to try to temporarily uninstall a newer SDK when you open a vscode window and re-install it when you exit.

## Downloading Older Runtimes

While you can build an app with an older runtime using a newer .NET SDK, you need the older runtime installed  globally to test or run it.

### Downloading & Installing the Runtime

#### How To Tell When & What Older Runtime Is Needed:

> :exclamation: We _will_ download the 6.0 runtime hardcoded (latest LTS .NET Runtime), no automatic update for now as to what's the 'latest lts runtime' as we don't want to break people when 8 suddenly becomes available. We will also have the list available runtimes API for DevKit to use, for other runtimes they must tell us.

We _need_ to add the runtimes and aspnet runtimes to the distro install files.

We _should_ reject to install if a global custom runtime is detected. (Also uses listRuntimes command.)

We don't have the mechanism in place for this to my knowledge. C# DevKit may be able to provide it to us. Basically: we need to add global installs to the runtime as well. They don't know we want to request this potential work item yet (aka: them telling us which runtime to use.)

#### Windows and Mac:
This can be done just like how the .NET SDK is installed by using the Runtime Installer for Windows and Mac. For Linux, it's more complicated.


#### Linux:
We need to acquire the .NET Runtime and the ASP.NET Runtime.
Both of those generally seem to have the same support policy as the SDK packages.

> :exclamation: C# DevKit will add a 'gold bar' to update once they load the project system to tell which `TargetFrameworks` the project uses. They don't want that work to happen for a while, so we won't provide the update command for a while yet until it is needed.

## Distro Install Files

We want distro installation to be data driven. We should be able to 'plug and play' with a live API service once it becomes available. Doing a .json file based installation also makes it easier for community contributors (AND US) to add support for new distros. The only thing we'd require is

0) a new distro file or version addition
1) a security check from our side
2) a test of the distro to show that it works with screenshots or some piece of evidence
3) minor code updates described below.

We initially wanted each distro to have its own file, but given we need to sign the file we decided to make only one.
Each file needs to have all necessary commands for us.

### Limitations of this proposal:
* We can only support either distro feeds or microsoft feeds unless we add preinstallcommand to each version. We don't want to support a mix though for the initial release as it can be very flaky.

* We can't support versions that have different requirements for the comands, which is unlikely but it's possible that a newer version of a distro uses some other command or installation location for .NET, or for apt-get, etc.

### Ubuntu Example:

The version should be in the same format as that returned by checking `etc/os-release`. This may be incomplete, I would refer to the files at `vscode-dotnet-runtime-library/distro-data/distro-support.json` for the newest design. The preInstallCommands indicate a microsoft only support life-cycle and does all of the work needed to configure the machine to use microsoft feeds to install dotnet.

`distros.json`

```json
{
    "ubuntu" :
    {
        "installCommand" : "sudo apt-get update && sudo apt-get install -y {0}",
        "uninstallCommand" : "sudo apt-get remove {0}",
        "updateCommand" : "sudo apt-get update && apt-get upgrade -y {0}",
        "isInstalledCommand" : "sudo apt list --installed {0}",
        "expectedDistroFeedInstallationDirectory" : "/usr/lib/dotnet/sdk",
        "expectedMicrosoftFeedInstallationDirectory" : "?",
        "installedSDKVersionsCommand" : "dotnet --list-sdks"
        "currentInstallationInfoCommand" : "dotnet --info",
        "versions" : [
                {
                "version" : "18.04",
                "dotnet" : [
                    {
                        "version" : "6.0",
                        "sdk" : "dotnet-sdk-6.0",
                        "runtime":  "dotnet-runtime-6.0:",
                        "aspnetcore": "aspnetcore-runtime-6.0"
                    },
                    {
                        "version" : "7.0",
                        "sdk" : "dotnet-sdk-6.0",
                        "runtime":  "dotnet-runtime-6.0:",
                        "aspnetcore": "aspnetcore-runtime-6.0"
                    }
                ],
                "preInstallCommands" : [
                    "apt-get update && apt install -y wget",
                    "wget https://packages.microsoft.com/config/ubuntu/18.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb",
                    "sudo dpkg -i packages-microsoft-prod.deb && rm packages-microsoft-prod.deb"
                ]
            },
            {
                "version" : "20.04",
                "dotnet" : [
                    {
                        "version" : "6.0",
                        "sdk" : "dotnet-sdk-6.0",
                        "runtime":  "dotnet-runtime-6.0:",
                        "aspnetcore": "aspnetcore-runtime-6.0"
                    },
                    {
                        "version" : "7.0",
                        "sdk" : "dotnet-sdk-6.0",
                        "runtime":  "dotnet-runtime-6.0:",
                        "aspnetcore": "aspnetcore-runtime-6.0"
                    }
                ],
                "preInstallCommands" : [
                    "apt-get update && apt install -y wget",
                    "wget https://packages.microsoft.com/config/ubuntu/20.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb",
                    "sudo dpkg -i packages-microsoft-prod.deb && rm packages-microsoft-prod.deb"
                ]
            },
            {
                "version" : "22.04",
                "dotnet" : [
                    {
                        "version" : "6.0",
                        "sdk" : "dotnet-sdk-6.0",
                        "runtime":  "dotnet-runtime-6.0:",
                        "aspnetcore": "aspnetcore-runtime-6.0"
                    },
                    {
                        "version" : "7.0",
                        "sdk" : "dotnet-sdk-6.0",
                        "runtime":  "dotnet-runtime-6.0:",
                        "aspnetcore": "aspnetcore-runtime-6.0"
                    }
                ],
            },
            {
                "version" : "23.04",
                "dotnet" : [
                    {
                        "version" : "6.0",
                        "sdk" : "dotnet-sdk-6.0",
                        "runtime":  "dotnet-runtime-6.0:",
                        "aspnetcore": "aspnetcore-runtime-6.0"
                    },
                    {
                        "version" : "7.0",
                        "sdk" : "dotnet-sdk-6.0",
                        "runtime":  "dotnet-runtime-6.0:",
                        "aspnetcore": "aspnetcore-runtime-6.0"
                    }
                ],
            }
        ]
    },
}
```

## Code Support For Distro Files

`IDistroDotnetSDKProvider` will be the interface that implements all of the needed logic for interacting with each distro.

`GenericDistroProvider` will be based off the commands needed for Ubuntu, but it should be relatively distro-agnostic. It will not implement any special logic for the commands and just outright parse the dotnet commands which should change from distro to distro. The same can be said for running the linux commands on the .json file. If any special logic is needed, then it can be added in an interface for this class.

Each `sudo` command should be run separately by the && and will require an elevation prompt using `@vscode/sudo`.

`DotnetGlobalSDKInstallerResolver` will determine the distro and version using `cat /etc/os-release`. The logic it does need to know is the mapping for the distro -> distro.json file. It will also call the needed commands on the Distro class.

## Extension Branding

_We will update the SDK extension naming. Chet is on top of this._

The .NET SDK Extension and .NET Runtime Extension are branded separately. The SDK Extension is branded for the education bundle only and the runtime extension is branded to only install the runtime. I think we should rebrand the runtime extension and add global sdk and global runtime support to it.

## Linux Uninstallation

To uninstall on linux, we simply run the `uninstallCommand`.

# WSL

WSL is another issue because we can't use pkexec or a UI layer to get the sudo password. We would like to avoid parsing the users password and forwarding it to terminal commands as it may get logged somewhere we dont expect and cause a password breach. Our current code will fail with a specific error if you try to run under WSL.

# Which Versions/Distros to Support

We will match the VS Code support tree. For the initial set of builds we will only support Ubuntu, but we need to support RHEL and things like CentOS as VS Code supports them. The support policy listed by VS Code is here: https://code.visualstudio.com/docs/supporting/FAQ. You may find that their versions are rather old and that document does not completely tell the truth (it is rather out of date), and so we will go beyond the version numbers of that list and support the newest versions we can.