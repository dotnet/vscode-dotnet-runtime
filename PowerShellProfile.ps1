# Custom PowerShell functions for vscode-dotnet-runtime development

# Kill dotnet-related processes
function tkl {
    Write-Host "Killing dotnet-related processes..." -ForegroundColor Yellow
    Get-Process -Name "dotnet" -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process -Name "VSTest.Console" -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process -Name "msbuild" -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "Done killing processes." -ForegroundColor Green
}

# VSTS npm authentication
function lgn {
    Write-Host "Running VSTS npm auth..." -ForegroundColor Yellow
    vsts-npm-auth -config .npmrc -force
}

# Update all dependencies and build
function upd {
    Write-Host "Starting comprehensive update and build process..." -ForegroundColor Yellow

    # Root directory updates
    Write-Host "Updating root directory..." -ForegroundColor Cyan
    npm update
    yarn install
    yarn upgrade

    # vscode-dotnet-runtime-library
    Write-Host "Updating vscode-dotnet-runtime-library..." -ForegroundColor Cyan
    Set-Location .\vscode-dotnet-runtime-library\
    npm update
    yarn install
    yarn upgrade

    # vscode-dotnet-runtime-extension
    Write-Host "Updating vscode-dotnet-runtime-extension..." -ForegroundColor Cyan
    Set-Location ..\vscode-dotnet-runtime-extension\
    npm update
    yarn install
    yarn upgrade
    npm version patch

    # Back to vscode-dotnet-runtime-library
    Write-Host "Final update to vscode-dotnet-runtime-library..." -ForegroundColor Cyan
    Set-Location ..\vscode-dotnet-runtime-library\
    npm update
    yarn upgrade

    # sample
    Write-Host "Updating sample..." -ForegroundColor Cyan
    Set-Location ..\sample\
    npm update
    yarn upgrade

    # vscode-dotnet-sdk-extension
    Write-Host "Updating vscode-dotnet-sdk-extension..." -ForegroundColor Cyan
    Set-Location ..\vscode-dotnet-sdk-extension\
    npm update
    yarn upgrade

    # Back to root and build
    Write-Host "Running build..." -ForegroundColor Cyan
    Set-Location ..
    .\build.cmd

    Write-Host "Update and build process completed!" -ForegroundColor Green
}

# Aliases for common executables
Set-Alias -Name build -Value .\build.cmd
Set-Alias -Name test -Value .\test.cmd

# Function wrappers for executables (alternative approach)
function build {
    .\build.cmd @args
}

function test {
    .\test.cmd @args
}

# Generic function to run any .cmd/.ps1/.sh file without extension
function run {
    param([string]$script)

    if (Test-Path ".\$script.cmd") {
        & ".\$script.cmd" @args
    } elseif (Test-Path ".\$script.ps1") {
        & ".\$script.ps1" @args
    } elseif (Test-Path ".\$script.sh") {
        & ".\$script.sh" @args
    } else {
        Write-Host "Script not found: $script" -ForegroundColor Red
        Write-Host "Looked for: .\$script.cmd, .\$script.ps1, .\$script.sh" -ForegroundColor Yellow
    }
}

Write-Host "Custom dotnet-runtime development functions loaded: tkl, lgn, upd, build, test, run" -ForegroundColor Green
Write-Host "Usage examples:" -ForegroundColor Cyan
Write-Host "  build       - runs .\build.cmd" -ForegroundColor Gray
Write-Host "  test        - runs .\test.cmd" -ForegroundColor Gray
Write-Host "  run <name>  - runs .\<name>.cmd/ps1/sh automatically" -ForegroundColor Gray
