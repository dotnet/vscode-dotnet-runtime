RESULT=0
RED=`tput setaf 1`
GREEN=`tput setaf 2`
NC=`tput sgr0`

npm install -g tslint
tslint -c tslint.json 'dotnetcore-acquisition-library/src/**/*.ts' 'dotnetcore-acquisition-extension/src/**/*.ts'
if [ $? -ne 0 ];
then
    echo ""
    echo "${RED}TSLint Failed.${NC}"
    echo ""
    RESULT=1
else
    echo ""
    echo "${GREEN}TSLint Succeeded.${NC}"
    echo ""
fi

echo ""
echo "----------- Testing dotnetcore-acquisition-library -----------"
echo ""
pushd dotnetcore-acquisition-library
rm -rf node_modules
npm install
npm run test

if [ $? -ne 0 ];
then
    echo ""
    echo "${RED}Acquisition Library Tests Failed.${NC}"
    echo ""
    RESULT=1
else
    echo ""
    echo "${GREEN}Acquisition Library Tests Succeeded.${NC}"
    echo ""
fi
popd

echo ""
echo "----------- Testing dotnetcore-acquisition-extension -----------"
echo ""
pushd dotnetcore-acquisition-extension
rm -rf node_modules
npm install
npm run test

if [ $? -ne 0 ];
then
    echo ""
    echo "${RED}Acquisition Extension Tests Failed.${NC}"
    echo ""
    RESULT=1
else
    echo ""
    echo "${GREEN}Acquisition Extension Tests Succeeded.${NC}"
    echo ""
fi
popd

if [ $RESULT -ne 0 ];
then
    echo ""
    echo ""
    echo "${RED}Tests Failed.${NC}"
    echo ""
    exit $RESULT
else
    echo ""
    echo ""
    echo "${GREEN}All Tests Succeeded.${NC}"
    echo ""
    exit $RESULT
fi