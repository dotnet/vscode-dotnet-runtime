# .NET Authoring Tool for Extensions (Preview)

This extension allows acquisition of the .NET runtime specifically for VSCode extension authors. This tool is intended to be leveraged in extensions that are written in .NET and requires .NET to boot pieces of the extension (i.e. a language server). The extension is not intended to be used directly by users to install .NET for development.

**This is a very early release of this tool. If you want to test it, reach out on [GitHub](https://github.com/dotnet/vscode-dotnet-runtime/issues) to discuss being in our early beta.**

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

## Contributing to Repository

Looking for something to work on? The list
of [up-for-grabs issues](https://github.com/dotnet/vscode-dotnet-runtime/labels/up-for-grabs) is a great place to start.

Please read the following documents to get started.

* [Contributing Guide](Documentation/contributing.md)

This project has adopted the code of conduct defined by the [Contributor Covenant](http://contributor-covenant.org/)
to clarify expected behavior in our community. For more information, see the [.NET Foundation Code of Conduct](http://www.dotnetfoundation.org/code-of-conduct).

## Building

### Requirements

- Node.js + npm
- VSCode

### Running the sample

1. Run the build script at the root of the repo (`build.sh` or `build.cmd`).
2. Open the repo's [workspace](vscode-dotnet-runtime.code-workspace) in VSCode
3. Run the `Run Sample Extension` configuration in VSCode
4. In the launched experimental instance open the command pallete and run the `Sample: Run a dynamically acquired .NET Core Hello World App`.

## .NET Foundation

.NET Core for VSCode is a [.NET Foundation](https://www.dotnetfoundation.org/projects) project.

See the [.NET home repo](https://github.com/Microsoft/dotnet) to find other .NET-related projects.

## License

.NET Core (including this repo) is licensed under the MIT license.
