# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog],
and this project adheres to [Semantic Versioning].

## [Unreleased]

## [2.0.6] - Unreleased

Keeps track of which extensions manage which installs to allow for better cleanup of old runtimes and sdks.

Fixes a bug with uninstall management where all .net installs would be removed if one install was corrupted.

Fixes other book keeping code regarding .NET runtime and sdk installs.
Improves storage mechanism to allow installing other types of runtimes in the future (aspnet, etc).

# [2.0.5] - 2024-05-07

Includes some minor bug fixes and error message improvements.

## [2.0.4] - 2024-05-03
Adds the setting `sharedExistingDotnetPath` to use an existing install for all extensions, instead of having to set the setting for every individual extension.

UX improvements for C# DevKit and the Global SDK API.\
Bug fixes for the recommended version API when the user is offline or on an unsupported distro.

Improved error logging for diagnosing issues that users report.\
Improved error messages.\
Updates to dependencies and a simplified dependency chain.

## [2.0.3] - 2024-03-21

Breaking change to the recommended version API introduced in 2.0.2.
Previously the API would return a string, now it will return an `IDotnetVersion[]` with more information.
The old string value containing the version can be accessed by calling .version on the fist and only item in the returned object.

## [2.0.2] - 2024-02-05

Allow users to call code to install Global SDKs on their own.
Improves Global .NET SDK Install UX on Linux.
Fixes issue with install scripts on local runtime installs where stderr was treated as error.
Add recommended version API.

## [2.0.1] - 2024-01-03

Fixes several key bugs with installing .NET:

- Ubuntu Global SDK Installs would fail for the first time on 18.04.
- The extension would print ... forever after installation failure for certain errors.
- The extension would fail to read Ubuntu directories properly for the first time if PMC was installed in certain scenarios.
- GitHub Forms is now added.
- Corrects behavior on our unknown Ubuntu Versions by estimating the correct behavior for known versions.
- Improve timeout error handling
- Catch bug in the caching library we use to prevent it from failing to cache
- Remove bug where status bar would stay red when cancelling install
- Fix bug where Linux would not update .NET SDKs properly when it could update instead of install
- Detect when a user cancels the installation in the password prompt or windows installer so we can remove the error failure message
- Adds more logging to the extension to improve diagnostics and speed to resolve github issues
- Improve installation management, so that the extension is aware that installs it manages can be deleted by external sources, to prevent it from thinking something is installed when it is no longer installed.
- Fix an issue where the uninstall command would think it could uninstall a global SDK. This is not the case.
- Improve detection logic for existing Ubuntu and RHEL installations of linux to prevent installing when it is not needed
- Several other key issues.

## [2.0.0] - 2023-11-23

The '.NET Runtime Install Tool' has been renamed to the '.NET Install Tool.'

The tool now supports installing a global .NET SDK on the machine. This feature is in preview and still undergoing improvements to UX.

Developers who wish to use this new API may read about its usage in our documentation.
They should write a UI layer around getting consent from the user to install the .NET SDK before installing it. WSL and distros outside of RHEL and Ubuntu are not yet supported, nor are preview or RC .NET SDKs.
https://github.com/dotnet/vscode-dotnet-runtime/tree/main/Documentation/global-installs

## [1.8.1] - 2023-11-1

Don't report failure if the .NET we try to uninstall is in use, and mark it to be uninstalled again next time, as before, we would not attempt to uninstall again later.

## [1.8.0] - 2023-09-18

Relies on node.arch() to determine .NET installation architecture for local runtimes instead of architecture-related environment variables.
This is to fix ia32/32-bit VS Code versions having an x64 terminal and then installing x64 dotnet when x32 dotnet runtimes are desired.

Installs before this version will be cleaned up, removed, and replaced with an architecture specific version. But this will only occur when a new runtime request is made for the same version, and the old version can thus be replaced by an architecture-specific copy.

## [1.7.4] - 2023-08-24

Don't read registry for proxy lookup if permission is unavailable to do so, requires manual proxy setting in this case.

## [1.7.3] - 2023-08-24

Fixes an issue where install script files could have race conditions by introducing file locking mechanisms.
Adds proxy detection & support that forwards calls through a proxy to axios. This is to fix a bug in axios where it does not handle proxies correctly.
Attempts to discover powershell in more ways in case it's been removed from the PATH, or try using powershell core if only that is available.
Improves file permissions handling to prevent issues on mac and linux where install script files may not have the correct permissions to execute.
Remarks in error messages how users in China may experience timeouts or offline errors due to GFW blocking our download pages.

## [1.7.2] - 2023-08-24

This release completely revamps the web request handling to a new library (axios).

## [1.7.1] - 2023-08-24

This is a small release that changes the error handling and issue reporting experience to make it easier to submit issues with the information we need to properly triage them. It also updates some package dependencies and increases timeout time.

## [1.7.0] - 2023-08-14

This is a small release with a targeted set of fixes derived from user reports in the past week or so.

### Added

- A new error type for when the user tries to install via the Powershell install script on a system where powershell cannot be found [#1212]
- A new error type for when an install was requested but already exists locally [#1212]
- New APIs for querying SDK installations and suggested SDK versions [#791]

### Fixed

- Reenable logging from this extension [#1122]

### Changed

- The default timeout for downloading an Runtime archive was changed to 300 seconds from 120 seconds [#1212]. If you need longer download times, see the [timeout documentation] for more details.
- The error message and pop-up for timeouts were improved to direct users how to extend the timeout [#1212]

<!-- Links -->
[keep a changelog]: https://keepachangelog.com/en/1.0.0/
[semantic versioning]: https://semver.org/spec/v2.0.0.html
[timeout documentation]: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#install-script-timeouts

<!-- PRs -->
[#1122]: https://github.com/dotnet/vscode-dotnet-runtime/pull/1122
[#1212]: https://github.com/dotnet/vscode-dotnet-runtime/pull/1212
[#791]: https://github.com/dotnet/vscode-dotnet-runtime/pull/791

<!-- Versions -->
[Unreleased]: https://github.com/dotnet/vscode-dotnet-runtime/compare/Runtime-v1.7.0...HEAD
[1.7.0]: https://github.com/dotnet/vscode-dotnet-runtime/releases/tag/Runtime-v1.7.0
