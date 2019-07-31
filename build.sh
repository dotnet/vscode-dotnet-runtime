echo ""
echo "----------- Compiling dotnetcore-acquisition-library -----------"
echo ""
pushd dotnetcore-acquisition-library
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