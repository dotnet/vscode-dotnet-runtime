set -e

echo ""
echo "----------- Copying Library Webpacked Dependencies -----------"
echo "" # See the build.ps1 for more details on why we do this
rm -rf ./vscode-dotnet-runtime-library/dist/Acquisition/distro-data
cp -r ./vscode-dotnet-runtime-library/distro-data ./vscode-dotnet-runtime-library/dist/Acquisition
rm -rf "./vscode-dotnet-runtime-library/dist/install scripts"
cp -r "./vscode-dotnet-runtime-library/install scripts" ./vscode-dotnet-runtime-library/dist
cp "./vscode-dotnet-runtime-library/src/test/mocks/MockMutexHolder.js" ./vscode-dotnet-runtime-library/dist/test/unit