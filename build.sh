RED=`tput setaf 1`
GREEN=`tput setaf 2`
NC=`tput sgr0`

echo ""
echo "----------- Compiling dotnetcore-acquisition-library -----------"
echo ""
pushd dotnetcore-acquisition-library
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
echo "----------- Compiling dotnetcore-acquisition-extension -----------"
echo ""
pushd dotnetcore-acquisition-extension
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
