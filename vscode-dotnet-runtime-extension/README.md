# .NET Runtime Install Tool

[![Version](https://img.shields.io/visual-studio-marketplace/v/ms-dotnettools.vscode-dotnet-runtime?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-runtime) [![Installs](https://img.shields.io/visual-studio-marketplace/i/ms-dotnettools.vscode-dotnet-runtime?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-runtime)

This extension provides an API that allows users to ensure a specific version of the .NET Runtime is installed. Typically, you would use this extension if you are writing a Visual Studio Code extension that has components that are written in .NET languages, and so require the .NET runtime to be installed. This extension is not intended to be used directly by end-users to install .NET for development purposes, because it only includes the .NET Runtime and not the entire .NET SDK.

## Goals: Acquiring .NET Runtimes for extensions

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

.NET for VSCode is a [.NET Foundation](https://www.dotnetfoundation.org/projects) project.

See the [.NET home repo](https://github.com/Microsoft/dotnet) to find other .NET-related projects.

## License

.NET Core (including this repo) is licensed under the MIT license.
