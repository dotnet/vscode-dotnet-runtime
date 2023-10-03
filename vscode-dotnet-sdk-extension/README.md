# .NET SDK Install Tool

[![Version](https://img.shields.io/visual-studio-marketplace/v/ms-dotnettools.vscode-dotnet-sdk?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-sdk) [![Installs](https://img.shields.io/visual-studio-marketplace/i/ms-dotnettools.vscode-dotnet-sdk?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-sdk)

This VSCode extension allows acquisition of a local copy of the .NET SDK. While originally developed and intended to be used as part of the [.NET Coding Pack], this extension can be used by other extensions like C# DevKit, Polyglot Notebooks, and others to ensure that a .NET SDK is available on the user's machine. This can be useful when another extension needs to make use of the .NET Toolchain to compile or run code. 

> **Note:**
> .NET SDKs installed with this extension are unique *per-calling-extension*, and will not be installed system-wide. This means they will not be usable from outside of the VS Code editor.

## .NET Foundation

.NET for VSCode is a [.NET Foundation](https://www.dotnetfoundation.org/projects) project.

See the [.NET home repo](https://github.com/Microsoft/dotnet) to find other .NET-related projects.

## License

.NET Core (including this repo) is licensed under the MIT license.

## Telemetry Notice

Please note that this extension collects telemetry by default and aims to follow the [VS Code Telemetry Policy](https://code.visualstudio.com/api/extension-guides/telemetry). You may disable this telemetry in the extension settings.

[.NET Coding Pack]: https://learn.microsoft.com/shows/on-net/get-started-quick-with-the-net-coding-pack