RED=`tput setaf 1`
GREEN=`tput setaf 2`
NC=`tput sgr0`

echo ""
echo "----------- Bundling Install Scripts -----------"
echo ""
curl https://dot.net/v1/dotnet-install.ps1 --retry 2 -o "./vscode-dotnet-runtime-library/install scripts/dotnet-install.ps1"
curl https://dot.net/v1/dotnet-install.sh --retry 2 -o "./vscode-dotnet-runtime-library/install scripts/dotnet-install.sh"
if [ $? -eq 0 ];
then
    echo ""
    echo "${GREEN}Bundled install scripts${NC}"
else
    echo ""
    echo "${RED}Unable to bundle install scripts${NC}"
fi
chmod +x "./vscode-dotnet-runtime-library/install scripts/dotnet-install.ps1"
chmod +x "./vscode-dotnet-runtime-library/install scripts/dotnet-install.sh"

echo ""
echo "----------- Compiling vscode-dotnet-runtime-library -----------"
echo ""
pushd vscode-dotnet-runtime-library
rm -rf node_modules
npm install
npm run compile

if [ $? -ne 0 ];
then
    echo ""
    echo "${RED}Build failed!${NC}"
    exit 1
fi
popd

echo ""
echo "----------- Compiling vscode-dotnet-runtime-extension -----------"
echo ""
pushd vscode-dotnet-runtime-extension
rm -rf node_modules
npm install
npm run compile

if [ $? -ne 0 ];
then
    echo ""
    echo "${RED}Build failed!${NC}"
    exit 1
fi
popd

echo ""
echo "----------- Compiling vscode-dotnet-sdk-extension -----------"
echo ""
pushd vscode-dotnet-sdk-extension
rm -rf node_modules
npm install
npm run compile

if [ $? -ne 0 ];
then
    echo ""
    echo "${RED}Build failed!${NC}"
    exit 1
fi
popd

echo ""
echo "----------- Compiling sample -----------"
echo ""
pushd sample
rm -rf node_modules
npm install
npm run compile

if [ $? -ne 0 ];
then
    echo ""
    echo "${RED}Build failed!${NC}"
    exit 1
fi
popd

echo ""
echo "${GREEN}Build succeeded!${NC}"
exit 0
