echo ""
echo "----------- Copying Library Webpacked Dependencies -----------"
echo "" # See the build.ps1 for more details on why we do this
cp -r ./vscode-dotnet-runtime-library/distro-data ./vscode-dotnet-runtime-library/dist/Acquisition
cp -r "./vscode-dotnet-runtime-library/install scripts" ./vscode-dotnet-runtime-library/dist
cp "./vscode-dotnet-runtime-library/src/test/mocks/MockMutexHolder.js" ./vscode-dotnet-runtime-library/dist/test/unit