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
    echo "Build failed!"
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
    echo "Build failed!"
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
    echo "Build failed!"
    exit 1
fi
popd

echo ""
echo "Build succeeded!"
exit 0
