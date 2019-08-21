# Purpose

There are two top level use-cases for needing .NET Core in VSCode:

1. For extensions: A VSCode extension was written in .NET and requires .NET to boot pieces of the extension (i.e. a language server).
1. For users: VSCode is the only IDE installed on the box and a user wants to use .NET for development.

In this repos current state it only supports the first use-case but can easily be expanded to support the second.

## Acquiring .NET Core for extensions
There are an increasing number of VS Code extensions that depend on .NET Core including Python, Live Share, Live Share Audio, Razor, Debug adapter, ARM JSON editor, Azure policy, F# and soon the Cloud Gateway extension.

Today, extensions either ship or do dynamic acquisition of .NET Core on first activation. While it works, there are a number of challenges that have come up:

1. **Duplication of .NET Core + slow updates**: The way things are going at the moment, each extension is acquiring its own copy of .NET core at ~30mb each. The binary contents are dropped inside the extensions folder in VS Code so that when the extension is uninstalled, the copy of .NET Core goes away too. This also forces .NET core to be downloaded on every extension version update.
1. **Clean up**: To avoid slow updates extensions could consider installing .NET Core in a non-VSCode folder location; however, in this case, there's no great mechanism to tell when all extensions that use .NET Core are uninstalled. So, .NET Core would likely need to be left behind. 
1. **Servicing / floating versions**: With newer releases of various OS flavors and .NET Core releases there are occasions when incompatibilities arise. With the existing infrastructure every team that re-ships .NET Core needs to re-ship their extension, re-dynamically acquire .NET and then cross their fingers. This can typically be avoided by dynamically acquiring the latest flavor of .NET Core (if the extension wants) to avoid re-shipping every .NET Core extension.
1. **Corruption due to lack of control**: VS Code can be shut down mid-download or unzip which can result in corrupted bits.  After a year of heavy use and attempting to resolve these problems, Live Share is still seeing corruption in some cases. Live Share doesn't have control over the process lifecycle which makes solving this difficult.
1. **Barrier to entry due to network security policies**: There have been a number of companies that "whitelist" sites instead of blacklisting them for security. As a result, developers have to request access to URIs to enable access. The VS marketplace is typically already unblocked if they are VS Code users while others may not be. 
1. **Locked down envs**: There have been situations where developers are not allowed to freely download software. The ability to download a VSIX from the marketplace allows these customers to centrally acquire extensions and install them manually. Any dynamic acquisition experience does not easily work in these environments.
1. **.NET Core missing dependencies**: VSCode runs on more platforms than .NET Core and therefore users run into situations where .NET Core cannot run as-is (generic containers, Alpine etc.) once dynamically acquired. This leads extension authors to detect these situations and attempt to prompt users to install missing pieces.

This repo attempts to solve the above issues.

## Acquiring .NET Core for users

TBD


# Contributing to Repository 

Looking for something to work on? The list 
of [up-for-grabs issues](https://github.com/dotnet/vscode-dotnetcore-acquisition-extension/labels/up-for-grabs) is a great place to start.

Please read the following documents to get started.

* [Contributing Guide](Documentation/contributing.md)

This project has adopted the code of conduct defined by the [Contributor Covenant](http://contributor-covenant.org/) 
to clarify expected behavior in our community. For more information, see the [.NET Foundation Code of Conduct](http://www.dotnetfoundation.org/code-of-conduct).

## Building the repo

### Requirements
- Node.js + npm
- VSCode

### Running the sample
1.  Run the build script at the root of the repo (`build.sh` or `build.cmd`).
2. Open the repo's [workspace](dotnetcore-acquisition.code-workspace) in VSCode
3. Run the `Run Sample Extension` configuration in VSCode
4. In the launched experimental instance open the command pallete and run the `Sample: Run a dynamically acquired .NET Core Hello World App`.

# License
.NET Core (including this repo) is licensed under the MIT license.
