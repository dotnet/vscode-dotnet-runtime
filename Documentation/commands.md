# Commands

This article outlines the commands exposed by the .NET Install Tool for Extension Authors. To see these commands used in an extension, check out the [sample extension](https://github.com/dotnet/vscode-dotnet-runtime/tree/master/sample) in this repository. Note that the majority of these commands are not user facing, meaning they can only be called programatically using the [VSCode API](https://code.visualstudio.com/api/extension-guides/command#programmatically-executing-a-command) by other extensions.

## dotnet.acquire

This command will install a .NET runtime. It accepts a [IDotnetAcquireContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/master/vscode-dotnet-runtime-library/src/IDotnetAcquireContext.ts) object and returns the path to the .NET runtime executable. Note that the version value in IDotnetAcquireContext must be a valid major.minor runtime version, for example 3.1. The extension will automatically identify and install the latest patch of the provided version. It is generally recommended that extension authors call this command immedietly on every extension start up to ensure that the .NET runtime has been installed and is ready to use.

## dotnet.uninstallAll

This command will uninstall all copies .NET runtime that have been acquired using the dotnet.acquire command. It is generally not necessary for extension authors to call this command directly as .NET runtimes will be removed automatically on extension uninstall. This command accepts no parameters or a [IDotnetUninstallContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/master/vscode-dotnet-runtime-library/src/IDotnetUninstallContext.ts) object and has a void return type.

## dotnet.showAcquisitionLog

This command surfaces an output channel to the user which provides status messages during extension commands. It does not accept parameters and has a void return type.

## dotnet.ensureDotnetDependencies

This command is only applicable to linux machines. It attempts to ensure that .NET dependencies are present and, if they are not, installs them or prompts the user to do so. It accepts a [IDotnetEnsureDependenciesContext](https://github.com/dotnet/vscode-dotnet-runtime/blob/master/vscode-dotnet-runtime-library/src/IDotnetEnsureDependenciesContext.ts) object and has a void return type.

## dotnet.reportIssue

This is the only user facing command that this extension exposes and will be displayed to users with the name `Report an issue with the .NET Install Tool for Extension Authors`. It redirects users to file an issue on our [GitHub page](https://github.com/dotnet/vscode-dotnet-runtime).
