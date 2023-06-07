# .NET Runtime Acquisition Strategy

## Common Among All Scenarios

- Users (extension authors) ensure that they have a runtime installed by calling the `acquire` command, providing a Major.Minor version to install.
- Users are expected to call us on extension startup to ensure that the runtime exists.
- Downloaded runtimes are stored in [extension global storage](https://code.visualstudio.com/api/extension-capabilities/common-capabilities#data-storage).

## Scenarios

### First Acquisition

- Resolve version by fetching release.json
  - If we are offline, we will fail here because the user also will not be able to download a runtime offline.
- Check if version has been installed previously or is currently being installed
- Fetch dotnet-install script
- Install runtime via script
- Validate installation was successful
- Return path to runtime

### Subsequent Acquisitions (No Runtime Patches)

- Resolve version with the cached release.json
  - We will update release.json in the background. If we are offline this will fail silently, which is fine as we can use the cached version.
- Check if version has been installed previously or is currently being installed
- As the resolved version is already installed, return path to runtime

Note: This scenario can be conducted offline successfully.

### Subsequent Acquisitions (Runtime Patche Released)

- Resolve version with the cached release.json
  - We will update release.json in the background.
  - **Note**: For efficiency, we do not block on release.json acquisition. This means that we may not install the most updated runtime until the following acquisition (once the release.json with the update has been acquired and cached).
- Check if version has been installed previously or is currently being installed
- Install runtime via cached install script
  - We will update the install script in the background. If we are offline this will fail silently.
- Validate installation was successful
- Return path to runtime
