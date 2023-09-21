# .NET Runtime Install Tool

[![Version](https://img.shields.io/visual-studio-marketplace/v/ms-dotnettools.vscode-dotnet-runtime?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-runtime) [![Installs](https://img.shields.io/visual-studio-marketplace/i/ms-dotnettools.vscode-dotnet-runtime?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-runtime)

This extension provides a unified way for other extensions like the [C#] and [C# Dev Kit] extensions to install local, private versions of the .NET Runtime. This extension is not intended to be used directly by users to install .NET for development purposes because it only includes the .NET Runtime and not the entire .NET SDK.

## Why do I have this extension?

This extension was probably included as a dependency of one of the following extensions, though this list is not exhaustive:

* [C#]
* [C# Dev Kit]
* [Unity]
* [.NET MAUI]
* [CMake]
* [Bicep]

These extensions call into this extension to provide a unified way of downloading per-extension copies of the .NET Runtime for those extensions to use internally. If you already have an installation of .NET that you'd like to use, see [the troubleshooting section below](#i-already-have-a-net-runtime-or-sdk-installed-and-i-want-to-use-it). If you want to remove this extension completely, you will need to uninstall any extensions that depend on it first. If this extension is uninstalled, any .NET Runtimes installed by it will also be removed.

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

It can sometimes take a while to download the .NET Runtime. While the default download time is 600 seconds, if you need more time you can set the `dotnetAcquisitionExtension.installTimeoutValue` setting to change that timeout. Here's an example of increasing the download timeout to 11 minutes:

```json
{
    "dotnetAcquisitionExtension.installTimeoutValue": 660
}
```

You can read more about [changing the installation timeout] in our documentation.

## The extension thinks you are offline with error response of 400 or 407, and you have a proxy.

This is a known issue with axios, the system we use to make web-requests.
The requests we make need to be routed through the proxy. We have logic to try to detect your proxy automatically.
If your proxy does not get detected by us, please try adding it here.
You may want to consider temporarily switching to version 1.7.2 of the runtime extension if you are still experiencing issues as this version does not use axios. Note that proxies that require additional credentials are not yet supported.

Note: GFW / China also blocks some of our requests, which may be why our extension thinks you are offline or times out.

You can add the proxy in the extension settings like following the advice above for timeouts.
```json
{
    "dotnetSDKAcquisitionExtension.proxyUrl": "https://your_proxy_url:port"
}
```

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

## Telemetry Notice

Please note that this extension collects telemetry by default and aims to follow the [VS Code Telemetry Policy](https://code.visualstudio.com/api/extension-guides/telemetry). You may disable this telemetry in the extension settings.

[C#]: https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp
[C# Dev Kit]: https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csdevkit
[using external installations]: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#manually-installing-net
[changing the installation timeout]: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#install-script-timeouts
[Unity]: https://marketplace.visualstudio.com/items?itemName=VisualStudioToolsForUnity.vstuc
[.NET MAUI]: https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.dotnet-maui
[CMake]: https://marketplace.visualstudio.com/items?itemName=twxs.cmake
[Bicep]: https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-bicep