# Adding Custom Distros

Our initial support for automated .NET installs on Linux includes Ubuntu and Red Hat Enterprise Linux distros. We realize this is a limited number of distros.


While we plan on adding more distros in the future to meet the same support policy as VS Code, (which is also rather limited), we are happy to review PRs that add support for more distros. Only a few changes are required, which we will describe here. We are open to hearing your feedback on https://github.com/dotnet/vscode-dotnet-runtime/issues.

# Steps to Add Support for your Distro

### Edit the distro-support.json file

We have a distro-support.json file which contains all of the commands needed to run dotnet. This file also contains the potential for 'preinstallCommands' necessary to install Microsoft feeds if the distro feed does not automatically include dotnet for certain versions.

Please see https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/json-schema/distro-support-schema.json for the schema of the JSON which explains each command, and edit https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/distro-data/distro-support.json.

### Add your distro to the list of known distros

You will need to update the enumeration of known distros in the 'DistroProviderFactory' here https://github.com/dotnet/vscode-dotnet-runtime/blob/2c4ca303131ab596ae429066bac3caf10e1de5d9/vscode-dotnet-runtime-library/src/Acquisition/LinuxVersionResolver.ts#L176C5-L176C13.

You will have to create a 'DistroSDKProvider' class for your Distro, such as https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/Acquisition/RedHatDistroSDKProvider.ts. But the implementation can all be inherited, unless the distro requires special logic.

### Implement any special functionality for your distro that differs from what's already implemented.

Most of the functionality should be the same, but if your distro needs custom logic, you will need to implement it in a 'DistroSDKProvider'.

## Example

If you'd like to see how Red Hat was initially added, you can look at this PR https://github.com/dotnet/vscode-dotnet-runtime/pull/1500/files. (Some of the custom implementation added during this time is not even needed anymore.)

# Final Steps

Submit a PR and ping our team @dotnet/dotnet-cli.
Please include at minimum a screenshot of your code working on the distro as well as a set of tests to prove that the change is successful. Thank you.
