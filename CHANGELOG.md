# Change Log

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