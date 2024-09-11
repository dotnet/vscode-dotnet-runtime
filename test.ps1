$result = 0
$errorColor = "Red"
$successColor = "Green"

if ($args[1] -eq '--eslint') {
    npm run lint
    if ($LASTEXITCODE -ne 0)
    {
        Write-Host "`nESLint Failed.`n" -ForegroundColor $errorColor
        $result = 1
    }
    else
    {
        Write-Host "`nESLint Succeeded.`n" -ForegroundColor $successColor
    }
}

if ($args[1] -ne 'sdk' -and $args[1] -ne 'rnt') {
    pushd vscode-dotnet-runtime-library
    if (Test-Path node_modules) { rm -r -force node_modules }
    npm ci --silent
    npm run test
    if ($LASTEXITCODE -ne 0)
    {
        Write-Host "`nAcquisition Library Tests Failed.`n" -ForegroundColor $errorColor
        $result = 1
    }
    else
    {
        Write-Host "`nAcquisition Library Tests Succeeded.`n" -ForegroundColor $successColor
    }
    popd
}

if ($args[1] -ne 'sdk' -and $args[1] -ne 'lib') {
    pushd vscode-dotnet-runtime-extension
    if (Test-Path node_modules) { rm -r -force node_modules }
    npm ci --silent
    npm run test
    if ($LASTEXITCODE -ne 0)
    {
        Write-Host "`n.NET Runtime Acquisition Extension Tests Failed.`n" -ForegroundColor $errorColor
        $result = 1
    }
    else
    {
        Write-Host "`n.NET Runtime Acquisition Extension Tests Succeeded.`n" -ForegroundColor $successColor
    }
    popd
}

if ($args[1] -ne 'lib' -and $args[1] -ne 'rnt') {
    pushd vscode-dotnet-sdk-extension
    if (Test-Path node_modules) { rm -r -force node_modules }
    npm ci --silent
    npm run test
    if ($LASTEXITCODE -ne 0)
    {
        Write-Host "`n.NET SDK Acquisition Extension Tests Failed.`n" -ForegroundColor $errorColor
        $result = 1
    }
    else
    {
        Write-Host "`n.NET SDK Acquisition Extension Tests Succeeded.`n" -ForegroundColor $successColor
    }
    popd
}

if ($result -ne 0)
{
    Write-Host "`n`nTests Failed.`n" -ForegroundColor $errorColor
    exit $result
}
else
{
    Write-Host "`n`nAll Tests Succeeded.`n" -ForegroundColor $successColor
    exit $result
}