#!/usr/bin/env bash
RESULT=0
RED=`tput setaf 1`
GREEN=`tput setaf 2`
NC=`tput sgr0`

if [ "$1" = "--eslint" ];
then
    npm run lint
    if [ $? -ne 0 ];
    then
        echo ""
        echo "${RED}ESLint Failed.${NC}"
        echo ""
        RESULT=1
    else
        echo ""
        echo "${GREEN}ESLint Succeeded.${NC}"
        echo ""
    fi
fi

echo ""
echo "----------- Testing vscode-dotnet-runtime-library -----------"
echo ""
pushd vscode-dotnet-runtime-library
rm -rf node_modules
npm ci
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
echo "----------- Testing vscode-dotnet-runtime-extension -----------"
echo ""
pushd vscode-dotnet-runtime-extension
rm -rf node_modules
npm ci
npm run test

if [ $? -ne 0 ];
then
    echo ""
    echo "${RED}.NET Runtime Acquisition Extension Tests Failed.${NC}"
    echo ""
    RESULT=1
else
    echo ""
    echo "${GREEN}.NET Runtime Acquisition Extension Tests Succeeded.${NC}"
    echo ""
fi
popd

echo ""
echo "----------- Testing vscode-dotnet-sdk-extension -----------"
echo ""
pushd vscode-dotnet-sdk-extension
rm -rf node_modules
npm ci
npm run test

if [ $? -ne 0 ];
then
    echo ""
    echo "${RED}.NET SDK Acquisition Extension Tests Failed.${NC}"
    echo ""
    RESULT=1
else
    echo ""
    echo "${GREEN}.NET SDK Acquisition Extension Tests Succeeded.${NC}"
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