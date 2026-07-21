# Supported Pre-Release Suffixes

`historicalDotnetPreReleaseSuffixPattern` in `VersionUtilities.ts` accepts only
suffix families supported by the official .NET release metadata feed. The
examples are public artifacts that establish each family's historical use; they
are not a list of the only accepted builds.

| Suffix family | Historical version | Evidence |
| --- | --- | --- |
| `preview` | `.NET Core SDK 3.0.100-preview9-014004` | [.NET 3.0 releases.json](https://builds.dotnet.microsoft.com/dotnet/release-metadata/3.0/releases.json) |
| `rc` | `.NET Core SDK 3.0.100-rc1-014190` | [.NET 3.0 releases.json](https://builds.dotnet.microsoft.com/dotnet/release-metadata/3.0/releases.json) |

## Unsupported Families

The following historical package suffixes are intentionally unsupported because
they have no corresponding official .NET `releases.json` record. Their package
history alone is insufficient evidence for acquisition-version support.

| Suffix family | Historical package version |
| --- | --- |
| `alpha` | [`Microsoft.NET.Sdk 1.0.0-alpha-20161104-2`](https://www.nuget.org/packages/Microsoft.NET.Sdk/1.0.0-alpha-20161104-2) |
| `beta` | [`Microsoft.Net.Native.Compiler 1.5.0-beta`](https://www.nuget.org/packages/Microsoft.Net.Native.Compiler/1.5.0-beta) |
| `rel` | [`Microsoft.Net.Native.Compiler 2.2.12-rel-33220-00`](https://www.nuget.org/packages/Microsoft.Net.Native.Compiler/2.2.12-rel-33220-00) |
| `arm64rel` | [`Microsoft.Net.Native.Compiler 2.1.8-arm64rel-26502-00`](https://www.nuget.org/packages/Microsoft.Net.Native.Compiler/2.1.8-arm64rel-26502-00) |

The matcher intentionally excludes arbitrary labels such as `ci`, `foo`, and
`bar-1.3`. A successful SemVer comparison does not make an unsupported suffix
a valid .NET acquisition version.