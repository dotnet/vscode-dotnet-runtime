pushd dotnetcore-acquisition-library
rm -r -force node_modules
npm install
npm run compile

if (! $?)
{
    echo "Build failed!"
    exit 1
}
popd

pushd dotnetcore-acquisition-extension
rm -r -force node_modules
npm install
npm run compile

if (! $?)
{
    echo "Build failed!"
    exit 1
}
popd

pushd sample
rm -r -force node_modules
npm install
npm run compile

if (! $?)
{
    echo "Build failed!"
    exit 1
}
popd