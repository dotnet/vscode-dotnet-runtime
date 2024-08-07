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

#################### Copy Library Artifacts ####################
& "$(Split-Path $MyInvocation.MyCommand.Path)/mock-webpack.ps1"

Write-Host "Build Succeeded" -ForegroundColor $successColor

#################### Install Signing Tool ####################

try
{
    $InstallNuGetPkgScriptPath = ".\signing\Install-NuGetPackage.ps1"
    $nugetVerbosity = 'quiet'
    if ($Verbose) { $nugetVerbosity = 'normal' }
    $MicroBuildPackageSource = 'https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet-public/nuget/v3/index.json'
    if ($Signing)
    {
        Write-Host "Installing MicroBuild signing plugin" -ForegroundColor $successColor
        Invoke-Expression "& `"$InstallNuGetPkgScriptPath`" MicroBuild.Plugins.Signing -source $MicroBuildPackageSource -Verbosity $nugetVerbosity"
        $EnvVars['SignType'] = "Test"
    }

    & ".\signing\Set-EnvVars.ps1" -Variables $EnvVars -PrependPath $PrependPath | Out-Null
} catch {
    Write-Host "Failed to install signing tool" -ForegroundColor $errorColor
    Write-Host $_.Exception.Message
}