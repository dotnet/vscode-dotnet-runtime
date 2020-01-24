RED=`tput setaf 1`
GREEN=`tput setaf 2`
NC=`tput sgr0`

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
