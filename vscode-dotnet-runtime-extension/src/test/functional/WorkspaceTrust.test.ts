/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as vscode from 'vscode';
import { dotnetCoreAcquisitionExtensionId } from '../../DotnetCoreAcquisitionId';

const assert = chai.assert;

interface ExtensionManifest
{
    capabilities?: {
        untrustedWorkspaces?: {
            supported?: boolean | 'limited';
            restrictedConfigurations?: string[];
        };
    };
}

suite('Workspace Trust End to End', () =>
{
    test('the loaded extension restricts settings that select executables or network routes', () =>
    {
        const runtimeExtension = vscode.extensions.getExtension(dotnetCoreAcquisitionExtensionId);
        if (!runtimeExtension)
        {
            throw new Error(`VS Code did not load ${dotnetCoreAcquisitionExtensionId}`);
        }

        const extensionManifest = runtimeExtension.packageJSON as ExtensionManifest;
        const untrustedWorkspaces = extensionManifest.capabilities?.untrustedWorkspaces;

        assert.equal(untrustedWorkspaces?.supported, 'limited');
        assert.sameMembers(untrustedWorkspaces?.restrictedConfigurations ?? [], [
            'dotnetAcquisitionExtension.existingDotnetPath',
            'dotnetAcquisitionExtension.sharedExistingDotnetPath',
            'dotnetAcquisitionExtension.proxyUrl',
            'dotnetAcquisitionExtension.allowInvalidPaths',
        ]);
    });
});