$errorColor = "Red"
$successColor = "Green"


#################### Download backup install scripts ####################
function DownloadInstallScripts() {
    Invoke-WebRequest https://dot.net/v1/dotnet-install.ps1 -OutFile "./vscode-dotnet-runtime-library/install scripts/dotnet-install.ps1"
    Invoke-WebRequest https://dot.net/v1/dotnet-install.sh -OutFile "./vscode-dotnet-runtime-library/install scripts/dotnet-install.sh"
}

try
{
    DownloadInstallScripts
}
catch
{
    $exceptionMessage = $_.Exception.Message
    Write-Host "Failed to install scripts, retrying: $exceptionMessage"
    DownloadInstallScripts
}
if ($?) {
    Write-Host "`nBundled dotnet-install scripts" -ForegroundColor $successColor
} else {
    Write-Host "`nFailed to bundle dotnet-install scripts" -ForegroundColor $errorColor
}
icacls "./vscode-dotnet-runtime-library/install scripts/dotnet-install.ps1" /grant:r "users:(RX)" /C
icacls "./vscode-dotnet-runtime-library/install scripts/dotnet-install.sh" /grant:r "users:(RX)" /C

#################### Compile library ####################
pushd vscode-dotnet-runtime-library
if (Test-Path node_modules) { rm -r -force node_modules }
npm ci
npm run compile

if (! $?)
{
    Write-Host "`nBuild failed!" -ForegroundColor $errorColor
    exit 1
}
popd

#################### Compile runtime extension ####################
pushd vscode-dotnet-runtime-extension
if (Test-Path node_modules) { rm -r -force node_modules }
npm ci
npm run compile

if (! $?)
{
    Write-Host "`nBuild failed!" -ForegroundColor $errorColor
    exit 1
}
popd

#################### Compile SDK extension ####################
pushd vscode-dotnet-sdk-extension
if (Test-Path node_modules) { rm -r -force node_modules }
npm ci
npm run compile

if (! $?)
{
    Write-Host "`nBuild failed!" -ForegroundColor $errorColor
    exit 1
}
popd

#################### Compile sample extension ####################
pushd sample
if (Test-Path node_modules) { rm -r -force node_modules }
npm ci
npm run compile

if (! $?)
{
    Write-Host "`nBuild failed!" -ForegroundColor $errorColor
    exit 1
}
popd

Write-Host "Build Succeeded" -ForegroundColor $successColor