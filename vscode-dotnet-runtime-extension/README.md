# .NET Runtime Install Tool

[![Version](https://img.shields.io/visual-studio-marketplace/v/ms-dotnettools.vscode-dotnet-runtime?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-runtime) [![Installs](https://img.shields.io/visual-studio-marketplace/i/ms-dotnettools.vscode-dotnet-runtime?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-runtime)

This extension provides a unified way for other extensions like the [C#] and [C# Dev Kit] extensions to install local, private version of the .NET Runtime. This extension is not intended to be used directly by users to install .NET for development purposes because it only includes the .NET Runtime and not the entire .NET SDK.

## Troubleshooting

### I already have a .NET Runtime or SDK installed, and I want to use it

Try adding the requesting extension to the `dotnetAcquisitionExtension.existingDotnetPath` setting in your vscode.json settings file. You can read more about [using external installations] in our documentation, but here's an example of how to tell the [C#] extension to use your existing .NET installation:

```json
    "dotnetAcquisitionExtension.existingDotnetPath": [
        {
            "extensionId": "ms-dotnettools.csharp",
            "path": "C:\\Program Files\\dotnet\\dotnet.exe"
        }
    ]
```

For [C# Dev Kit] you would use the same thing, but with the extension ID `ms-dotnettools.csdevkit`.  Other extensions, like the MAUI and Unity extensions, will have their own extension IDs that you can find in the extension pane by right-clicking on them and choosing 'Copy Extension ID'.

> NOTE:
> You'll need to make a new item in the settings array for each extension that uses this extension to acquire .NET.


### Downloading the .NET Runtime times out

It can sometimes take a while to download the .NET Runtime. While the default download time is 300 seconds, if you need more time you can set the `dotnetAcquisitionExtension.installTimeoutValue` setting to change that timeout. Here's an example of increasing the download timeout to 10 minutes:

```json
{
    "dotnetAcquisitionExtension.installTimeoutValue": 600
}
```

You can read more about [changing the installation timeout] in our documentation.

## Information for repo contributors

### Goals: Acquiring .NET Runtimes for extensions

Prior to the release of this extension, extension authors had no way of knowing if the .NET Runtime was installed on their target machines. Other solutions had a number of challenges:

1. **Duplication of .NET runtimes and slow updates**: Each extension was acquiring its own copy of .NET, wasting disk space.
2. **Clean up**: When extensions installed .NET in a non-VSCode-managed folder location it was likely to be left behind.
3. **Servicing and floating versions**: It was difficult to ensure that extensions would use the latest releases, particularly without re-shipping their extension.
4. **Corrupted installations**: Corrupted installations could arise when VS Code was shut down mid-download or unzip.
5. **Network security policies**: Alternative installation methods could have resulted in errors due to blocking from network security policies.
6. **Locked down environments**: Some developers are unable to freely install software, requiring the ability to install extensions manually via a VSIX.
7. **Missing dependencies**: Users may run into situations where .NET cannot run as-is, requiring the installation of missing pieces.

This extension attempts to solve the above issues.

## .NET Foundation

The .NET Runtime Install Tool is a [.NET Foundation](https://www.dotnetfoundation.org/projects) project.

See the [.NET home repo](https://github.com/Microsoft/dotnet) to find other .NET-related projects.

## License

.NET (including this repo) is licensed under the MIT license.

[C#]: https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp
[C# Dev Kit]: https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csdevkit
[using external installations]: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#manually-installing-net
[changing the installation timeout]: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#install-script-timeouts