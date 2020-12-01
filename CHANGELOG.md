# Change Log

## 1.0.0

### Fixed

- Correct type checking for configuration values ( #139 )
- Display script errors in extension error popup ( #137 )

## 0.2.0

### Added

- Bundling backup install scripts on build ( #84 )
- Added ability to manually configure .NET path ( #80, #125 )

### Fixed

- Added -NoProfile switch for running powershell script ( #121 )

## 0.1.2

### Added

- Added documentation for known Windows 7 bug. ( #68 )
- Added retries for web requests. ( #72 )

## 0.1.1

### Added

- `dotnetAcquisitionExtension.installTimeoutValue` setting. ( #62 )
- Added window display on timeout. ( #63 )

### Fixed

- Set TLS before calling install script. ( #60, #66 )

## 0.1.0

### Added

- Acquire .NET Core runtimes.
- Uninstall all .NET Core runtimes that have been acquired by this extension.
- Check for dependency requirements being met on linux.