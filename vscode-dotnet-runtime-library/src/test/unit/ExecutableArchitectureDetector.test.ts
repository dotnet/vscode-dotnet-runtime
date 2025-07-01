/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
 *  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as chai from 'chai';
import * as path from 'path';
import { ExecutableArchitectureDetector } from '../../Utils/ExecutableArchitectureDetector';

const assert = chai.assert;
const standardTimeoutTime = 100000;

suite('ExecutableArchitectureDetector Tests', function ()
{
    const detector = new ExecutableArchitectureDetector();
    const mockExecutablesPath = path.join(__dirname, '../mocks/Executables');

    // Windows Tests
    test('It detects Windows x86 executable architecture', async () =>
    {
        const exePath = path.join(mockExecutablesPath, 'dotnet-Win-x86.exe');
        const architecture = detector.getExecutableArchitecture(exePath);
        assert.equal(architecture, 'x86', 'The detector correctly identifies x86 architecture');
    });

    test('It detects Windows x64 executable architecture', async () =>
    {
        const exePath = path.join(mockExecutablesPath, 'dotnet-Win-x64.exe');
        const architecture = detector.getExecutableArchitecture(exePath);
        assert.equal(architecture, 'x64', 'The detector correctly identifies x64 architecture');
    });

    test('It detects Windows ARM64 executable architecture', async () =>
    {
        const exePath = path.join(mockExecutablesPath, 'dotnet-Win-Arm64.exe');
        const architecture = detector.getExecutableArchitecture(exePath);
        assert.equal(architecture, 'arm64', 'The detector correctly identifies ARM64 architecture');
    });

    // macOS Tests
    test('It detects macOS x64 executable architecture', async () =>
    {
        const exePath = path.join(mockExecutablesPath, 'dotnet-Mac-x64');
        const architecture = detector.getExecutableArchitecture(exePath);
        assert.equal(architecture, 'x64', 'The detector correctly identifies macOS x64 architecture');
    });

    test('It detects macOS ARM64 executable architecture', async () =>
    {
        const exePath = path.join(mockExecutablesPath, 'dotnet-Mac-Arm64');
        const architecture = detector.getExecutableArchitecture(exePath);
        assert.equal(architecture, 'arm64', 'The detector correctly identifies macOS ARM64 architecture');
    });

    // Linux Tests
    test('It detects Linux x64 executable architecture', async () =>
    {
        const exePath = path.join(mockExecutablesPath, 'dotnet-Linux-x64');
        const architecture = detector.getExecutableArchitecture(exePath);
        assert.equal(architecture, 'x64', 'The detector correctly identifies Linux x64 architecture');
    });

    test('It detects Linux ARM64 Musl executable architecture', async () =>
    {
        const exePath = path.join(mockExecutablesPath, 'dotnet-Linux-Arm64-Musl');
        const architecture = detector.getExecutableArchitecture(exePath);
        assert.equal(architecture, 'arm64', 'The detector correctly identifies Linux ARM64 (Musl) architecture');
    });

    test('It detects Linux ARM executable architecture', async () =>
    {
        const exePath = path.join(mockExecutablesPath, 'dotnet-Linux-Arm');
        const architecture = detector.getExecutableArchitecture(exePath);
        assert.equal(architecture, 'other', 'The detector identifies 32-bit ARM as other');
    });

    // Error handling tests
    test('It safely handles missing files', async () =>
    {
        const architecture = detector.getExecutableArchitecture(path.join(mockExecutablesPath, 'nonexistent.exe'));
        assert.isNull(architecture, 'The detector returns null for missing files');
    });

    test('It safely handles non-executable files', async () =>
    {
        const textPath = path.join(mockExecutablesPath, 'not-an-executable.txt');
        const architecture = detector.getExecutableArchitecture(textPath);
        assert.isNull(architecture, 'The detector returns null for non-executable files');
    });
}).timeout(standardTimeoutTime);