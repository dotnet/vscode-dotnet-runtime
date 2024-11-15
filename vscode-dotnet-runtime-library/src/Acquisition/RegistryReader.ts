/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { IEventStream } from "../EventStream/EventStream";
import { IRegistryReader } from "./IRegistryReader";

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

export class RegistryReader extends IRegistryReader
{
    /**
     *
     * @returns an array containing fully specified / specific versions of all globally installed sdks on the machine in windows for 32 and 64 bit sdks.
    */
    public async getGlobalSdkVersionsInstalledOnMachine() : Promise<Array<string>>
    {
        let sdks: string[] = [];


        if (os.platform() === 'win32')
        {
            const sdkInstallRecords64Bit = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x64\\sdk';
            const sdkInstallRecords32Bit = sdkInstallRecords64Bit.replace('x64', 'x86');
            const sdkInstallRecordsArm64 = sdkInstallRecords64Bit.replace('x64', 'arm64');

            const queries = [sdkInstallRecords32Bit, sdkInstallRecords64Bit, sdkInstallRecordsArm64];
            for ( const query of queries )
            {
                try
                {
                    const registryQueryCommand = path.join(`${process.env.SystemRoot}`, `System32\\reg.exe`);
                    // /reg:32 is added because all keys on 64 bit machines are all put into the WOW node. They won't be on the WOW node on a 32 bit machine.
                    const command = CommandExecutor.makeCommand(registryQueryCommand, [`query`, `${query}`, `\/reg:32`]);

                    let installRecordKeysOfXBit = '';
                    const registryLookup = (await this.commandRunner.execute(command));

                    if(registryLookup.status === '0')
                    {
                        installRecordKeysOfXBit = registryLookup.stdout;
                    }

                    const installedSdks = this.extractVersionsOutOfRegistryKeyStrings(installRecordKeysOfXBit);
                    // Append any newly found sdk versions
                    sdks = sdks.concat(installedSdks.filter((item) => sdks.indexOf(item) < 0));
                }
                catch(e)
                {
                    // There are no "X" bit sdks on the machine.
                }
            }
        }

        return sdks;
    }

    /**
     *
     * @param registryQueryResult the raw output of a registry query converted into a string
     * @returns
     */
    private extractVersionsOutOfRegistryKeyStrings(registryQueryResult : string) : string[]
    {
        if(registryQueryResult === '')
        {
                return [];
        }
        else
        {
            return registryQueryResult.split(' ')
            .filter
            (
                function(value : string, i : number) { return value !== '' && i !== 0; } // Filter out the whitespace & query as the query return value starts with the query.
            )
            .filter
            (
                function(value : string, i : number) { return i % 3 === 0; } // Every 0th, 4th, etc item will be a value name AKA the SDK version. The rest will be REGTYPE and REGHEXVALUE.
            );
        }
    }
}