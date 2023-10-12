# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog],
and this project adheres to [Semantic Versioning].


## [Unreleased]

### Added

- A new error type for when the user tries to install via the Powershell install script on a system where powershell cannot be found [#1212]
- A new error type for when an install was requested but already exists locally [#1212]
- New APIs for querying SDK installations and suggested SDK versions [#791]

### Fixed

- Reenable logging from this extension [#1122]

### Changed

- The default timeout for downloading an Runtime archive was changed to 300 seconds from 120 seconds [#1212]. If you need longer download times, see the [timeout documentation] for more details.
- The error message and pop-up for timeouts were improved to direct users how to extend the timeout [#1212]

## [0.8.0] - 2021-09-16

### Changed

- Reduce the permissions required to exceute the scripts [#16120]

<!-- Links -->
[keep a changelog]: https://keepachangelog.com/en/1.0.0/
[semantic versioning]: https://semver.org/spec/v2.0.0.html
[timeout documentation]: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#install-script-timeouts

<!-- PRs -->
[#1122]: https://github.com/dotnet/vscode-dotnet-runtime/pull/1122
[#1212]: https://github.com/dotnet/vscode-dotnet-runtime/pull/1212
[#791]: https://github.com/dotnet/vscode-dotnet-runtime/pull/791
[#16120]: https://github.com/dotnet/vscode-dotnet-runtime/commit/0b6504a157525b0107a68b4a2a2914782e389456

<!-- Versions -->
[Unreleased]: https://github.com/dotnet/vscode-dotnet-runtime/compare/SDK-v0.8.0...HEAD
[0.8.0]: https://github.com/dotnet/vscode-dotnet-runtime/releases/tag/SDK-v0.8.0