# Commands

This article outlines the commands exposed by the .NET Install Tool. To see these commands used in an extension, check out the [sample extension](https://github.com/dotnet/vscode-dotnet-runtime/tree/main/sample) in this repository. Note that the majority of these commands are not user facing, meaning they can only be called programatically using the [VSCode API](https://code.visualstudio.com/api/extension-guides/command#programmatically-executing-a-command) by other extensions.

## dotnet.acquire

This command will install a .NET runtime. It accepts a [IDotnetAcquireContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireContext.ts) object and returns a [IDotnetAcquireResult](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetAcquireResult.ts), which contains the path to the .NET runtime executable. Note that the version value in IDotnetAcquireContext must be a valid major.minor runtime version, for example 3.1. The extension will automatically identify and install the latest patch of the provided version. It is generally recommended that extension authors call this command immedietly on every extension start up to ensure that the .NET runtime has been installed and is ready to use.

## dotnet.showAcquisitionLog

This command surfaces an output channel to the user which provides status messages during extension commands. It does not accept parameters and has a void return type.

## dotnet.ensureDotnetDependencies

This command is only applicable to linux machines. It attempts to ensure that .NET dependencies are present and, if they are not, installs them or prompts the user to do so. It accepts a [IDotnetEnsureDependenciesContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/IDotnetEnsureDependenciesContext.ts) object and has a void return type.
