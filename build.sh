pushd dotnetcore-acquisition-library
rm -rf node_modules
rm package-lock.json
npm install
npm run compile

if [$? -neq 0];
then
    echo "Build failed!"
    exit 1
fi
popd

pushd dotnetcore-acquisition-extension
rm -rf node_modules
rm package-lock.json
npm install
npm run compile

if [$? -neq 0];
then
    echo "Build failed!"
    exit 1
fi
popd

pushd sample
rm -rf node_modules
rm package-lock.json
npm install
npm run compile

if [$? -neq 0];
then
    echo "Build failed!"
    exit 1
fi
popd

echo ""
echo "Build succeeded!"
exit 0