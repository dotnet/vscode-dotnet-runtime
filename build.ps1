$errorColor = "Red"
$successColor = "Green"

pushd dotnetcore-acquisition-library
if (Test-Path node_modules) { rm -r -force node_modules }
npm install
npm run compile

if (! $?)
{
    Write-Host "`nBuild failed!" -ForegroundColor $errorColor
    exit 1
}
popd

pushd dotnetcore-acquisition-extension
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