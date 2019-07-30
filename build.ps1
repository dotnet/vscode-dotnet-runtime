pushd dotnetcore-acquisition-library
if (Test-Path node_modules) { rm -r -force node_modules }
npm install
npm run compile

if (! $?)
{
    echo "Build failed!"
    exit 1
}
popd

pushd dotnetcore-acquisition-extension
if (Test-Path node_modules) { rm -r -force node_modules }
npm install
npm run compile

if (! $?)
{
    echo "Build failed!"
    exit 1
}
popd

pushd sample
if (Test-Path node_modules) { rm -r -force node_modules }
npm install
npm run compile

if (! $?)
{
    echo "Build failed!"
    exit 1
}
popd