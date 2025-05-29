# Commands

This article outlines the commands exposed by the .NET Install Tool. To see these commands used in an extension, check out the [sample extension](https://github.com/dotnet/vscode-dotnet-runtime/tree/main/sample) in this repository. Note that the majority of these commands are not user facing, meaning they can only be called programatically using the [VSCode API](https://code.visualstudio.com/api/extension-guides/command#programmatically-executing-a-command) by other extensions.

## dotnet.acquire

This command will install a .NET runtime. It accepts a [IDotnetAcquireContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireContext.ts) object and returns a [IDotnetAcquireResult](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireResult.ts), which contains the path to the .NET runtime executable. Note that the version value in IDotnetAcquireContext must be a valid major.minor runtime version, for example 3.1. The extension will automatically identify and install the latest patch of the provided version. It is generally recommended that extension authors call this command immediately on every extension start up to ensure that the .NET runtime has been installed and is ready to use.

## dotnet.acquireGlobalSDK

This command will install a .NET SDK globally. It accepts a [IDotnetAcquireContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireContext.ts) object and returns a [IDotnetAcquireResult](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireResult.ts).

## dotnet.showAcquisitionLog

This command surfaces an output channel to the user which provides status messages during extension commands. It does not accept parameters and has a void return type.

## dotnet.ensureDotnetDependencies

This command is only applicable to linux machines. It attempts to ensure that .NET dependencies are present and, if they are not, installs them or prompts the user to do so. It accepts a [IDotnetEnsureDependenciesContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetEnsureDependenciesContext.ts) object and has a void return type.

## dotnet.findPath

You can execute this command to return a string to a dotnet runtime path. Pass it a [IDotnetFindPathContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetFindPathContext.ts) object. The major.minor will be respected based on the requirement you give (greater_than_or_equal will return a dotnet on the PATH that is >= the version requested.)

This returns undefined if no matches are found.

## dotnet.uninstall

You can execute this command to dereference / uninstall .NET, either the SDK or runtime, as long as it's managed by this extension. Pass it a [IDotnetFindPathContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetFindPathContext.ts) object suggesting which install you want to remove.

.NET will only be completely uninstalled if all extensions that relied on that version of .NET asked for it to be uninstalled.
Note that users can manually uninstall any version of .NET if they so chose and accept the risk.

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