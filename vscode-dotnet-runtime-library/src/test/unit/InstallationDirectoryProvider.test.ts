/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as path from 'path';
import { getVSCodeManagedDotnetRoot, isVSCodeManagedPath } from '../../Acquisition/IInstallationDirectoryProvider';

const assert = chai.assert;

suite('IInstallationDirectoryProvider Unit Tests', function ()
{
    this.timeout(15000);

    const storage = path.join(path.sep === '\\' ? 'C:\\storage' : '/storage', 'globalStorage');
    const managedRoot = getVSCodeManagedDotnetRoot(storage);

    suite('getVSCodeManagedDotnetRoot', function ()
    {
        test('appends the default install folder name', function ()
        {
            const original = process.env._VSCODE_DOTNET_INSTALL_FOLDER;
            delete process.env._VSCODE_DOTNET_INSTALL_FOLDER;
            try
            {
                assert.equal(getVSCodeManagedDotnetRoot(storage), path.join(storage, '.dotnet'));
            }
            finally
            {
                if (original === undefined)
                {
                    delete process.env._VSCODE_DOTNET_INSTALL_FOLDER;
                }
                else
                {
                    process.env._VSCODE_DOTNET_INSTALL_FOLDER = original;
                }
            }
        });

        test('honors the _VSCODE_DOTNET_INSTALL_FOLDER override', function ()
        {
            const original = process.env._VSCODE_DOTNET_INSTALL_FOLDER;
            process.env._VSCODE_DOTNET_INSTALL_FOLDER = 'custom-folder';
            try
            {
                assert.equal(getVSCodeManagedDotnetRoot(storage), path.join(storage, 'custom-folder'));
            }
            finally
            {
                if (original === undefined)
                {
                    delete process.env._VSCODE_DOTNET_INSTALL_FOLDER;
                }
                else
                {
                    process.env._VSCODE_DOTNET_INSTALL_FOLDER = original;
                }
            }
        });
    });

    suite('isVSCodeManagedPath', function ()
    {
        test('returns true for the managed root itself', function ()
        {
            assert.isTrue(isVSCodeManagedPath(managedRoot, managedRoot));
        });

        test('returns true for a nested install directory', function ()
        {
            assert.isTrue(isVSCodeManagedPath(path.join(managedRoot, '8.0.100~x64', 'dotnet'), managedRoot));
        });

        test('returns true for a path needing normalization', function ()
        {
            assert.isTrue(isVSCodeManagedPath(path.join(managedRoot, 'a', '..', '8.0', 'dotnet'), managedRoot));
        });

        test('returns false for a sibling folder that merely shares the prefix', function ()
        {
            assert.isFalse(isVSCodeManagedPath(`${managedRoot}-evil`, managedRoot));
        });

        test('returns false for a parent directory', function ()
        {
            assert.isFalse(isVSCodeManagedPath(storage, managedRoot));
        });

        test('returns false for an unrelated absolute path', function ()
        {
            assert.isFalse(isVSCodeManagedPath(path.join(path.sep === '\\' ? 'C:\\other' : '/other', 'dotnet'), managedRoot));
        });

        test('returns false for a `..` traversal escaping the root', function ()
        {
            assert.isFalse(isVSCodeManagedPath(path.join(managedRoot, '..', '..', 'dotnet'), managedRoot));
        });

        test('returns false for empty inputs', function ()
        {
            assert.isFalse(isVSCodeManagedPath('', managedRoot));
            assert.isFalse(isVSCodeManagedPath(managedRoot, ''));
        });

        if (process.platform === 'win32')
        {
            test('is case-insensitive on Windows', function ()
            {
                assert.isTrue(isVSCodeManagedPath(managedRoot.toUpperCase(), managedRoot.toLowerCase()));
            });
        }
    });
});
