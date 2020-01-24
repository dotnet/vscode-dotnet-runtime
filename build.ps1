$errorColor = "Red"
$successColor = "Green"

pushd vscode-dotnet-runtime-library
if (Test-Path node_modules) { rm -r -force node_modules }
npm install
npm run compile

if (! $?)
{
    Write-Host "`nBuild failed!" -ForegroundColor $errorColor
    exit 1
}
popd

pushd vscode-dotnet-runtime-extension
if (Test-Path node_modules) { rm -r -force node_modules }
npm install
npm run compile

if (! $?)
{
    Write-Host "`nBuild failed!" -ForegroundColor $errorColor
    exit 1
}
popd

pushd sample
if (Test-Path node_modules) { rm -r -force node_modules }
npm install
npm run compile

if (! $?)
{
    Write-Host "`nBuild failed!" -ForegroundColor $errorColor
    exit 1
}
popd

Write-Host "Build Succeeded" -ForegroundColor $successColor