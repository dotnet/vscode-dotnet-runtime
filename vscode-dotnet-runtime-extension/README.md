# .NET Install Tool for Extension Authors

[![Version](https://vsmarketplacebadge.apphb.com/version/ms-dotnettools.vscode-dotnet-runtime.svg)](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-runtime) [![Installs](https://vsmarketplacebadge.apphb.com/installs-short/ms-dotnettools.vscode-dotnet-runtime.svg)](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-runtime)

This extension allows acquisition of the .NET runtime specifically for Visual Studio Code extension authors. This tool is intended to be leveraged in extensions that are written in .NET and require .NET to boot pieces of the extension (e.g. a language server). The extension is not intended to be used directly by users to install .NET for development.

## Goals: Acquiring .NET Core for extensions

Extension authors do not know if the .NET core runtime is installed on the target machine. Existing solutions have a number of challenges:

1. **Duplication of .NET Core runtimes and slow updates**: Currently, each extension is acquiring its own copy of .NET core at ~30mb each.
2. **Clean up**: When extensions install .NET Core in a non-VSCode folder location it is likely to be left behind.
3. **Servicing and floating versions**: It is difficult to ensure that extensions will use the latest releases, particuarly without re-shipping.
4. **Corrupted installations**: Corrupted installations can arise when VS Code is shut down mid-download or unzip.
5. **Network security policies**: Alternative installation methods may result in errors due to blocking from network security policies.
6. **Locked down environments**: Some developers are unable to freely install software, requiring the ability to install extensions manually via a VSIX.
7. **Missing dependencies**: Users may run into situations where .NET Core cannot run as-is, requiring the installation of missing pieces.

This extension attempts to solve the above issues.

## .NET Foundation

.NET for VSCode is a [.NET Foundation](https://www.dotnetfoundation.org/projects) project.

See the [.NET home repo](https://github.com/Microsoft/dotnet) to find other .NET-related projects.

## License

.NET Core (including this repo) is licensed under the MIT license.
