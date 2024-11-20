/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { IEventStream } from "../EventStream/EventStream";
import { IRegistryReader } from "./IRegistryReader";
import { CommandExecutor } from '../Utils/CommandExecutor';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { CommandExecutorResult } from '../Utils/CommandExecutorResult';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

export class RegistryReader extends IRegistryReader
{
    protected commandRunner : ICommandExecutor;

    constructor(context : IAcquisitionWorkerContext, utilContext : IUtilityContext, executor : ICommandExecutor | null = null)
    {
        super();
        this.commandRunner = executor ?? new CommandExecutor(context, utilContext);
    }

    /**
     * @remarks architecture values accepted: x64, arm64. x86, arm32 possible on linux but 32 bit vscode is not supported.
     */
    public async getHostLocation(architecture : string) : Promise<string | undefined>
    {
        // TODO: Verify on ARM 64, the x64 path in paths and also reg.

        "%programfiles%";

        // InstallLocation vs sharedhost:
        // See https://github.com/dotnet/runtime/issues/109974
        const query = `HKEY_LOCAL_MACHINE\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\${architecture}\\sharedhost`;
        const result = await this.queryRegistry(query, false);

        if(result?.status === '0')
        {

        }

        return undefined;
    }

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
                    // /reg:32 is added because all keys on 64 bit machines are all put into the WOW node. They won't be on the WOW node on a 32 bit machine.
                    const registryLookup = await this.queryRegistry(query, true);
                    if(registryLookup === null)
                    {
                        return [];
                    }

                    let installRecordKeysOfXBit = '';
                    if(registryLookup.status === '0')
                    {

                        installRecordKeysOfXBit = registryLookup.stdout;
                    }

                    const installedSdks = this.extractVersionsOutOfRegistryKeyStrings(installRecordKeysOfXBit);
                    // Append any newly found sdk versions
                    sdks = sdks.concat(installedSdks.filter((item) => sdks.indexOf(item) < 0));
            }
        }

        return sdks;
    }

    private async queryRegistry(query : string, underWowNode : boolean) : Promise<CommandExecutorResult | null>
    {
        try
        {
            const registryQueryCommand = path.join(`${process.env.SystemRoot}`, `System32\\reg.exe`);
            let queryParameters = [`query`, `${query}`];
            if(underWowNode)
            {
                queryParameters = [...queryParameters, `\/reg:32`];
            }

            const command = CommandExecutor.makeCommand(registryQueryCommand, queryParameters);
            const registryLookup = (await this.commandRunner.execute(command));
            return registryLookup;
        }
        catch(e)
        {
            // There are no "X" bit sdks on the machine.
        }

        return null;
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