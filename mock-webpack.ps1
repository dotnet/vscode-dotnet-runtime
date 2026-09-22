# The library doesn't get webpacked, but it needs the copy of items that would normally be webpacked
# ... into the SDK or Runtime Extension for it to run in local dev scenarios.
$ErrorActionPreference = 'Stop'
Remove-Item ".\vscode-dotnet-runtime-library\dist\Acquisition\distro-data" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item ".\vscode-dotnet-runtime-library\distro-data\" -Destination ".\vscode-dotnet-runtime-library\dist\Acquisition\" -Recurse -Force
Remove-Item ".\vscode-dotnet-runtime-library\dist\install scripts" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item ".\vscode-dotnet-runtime-library\install scripts\" -Destination ".\vscode-dotnet-runtime-library\dist\" -Recurse -Force
Copy-Item ".\vscode-dotnet-runtime-library\src\test\mocks\MockMutexHolder.js" -Destination ".\vscode-dotnet-runtime-library\dist\test\unit" -Force