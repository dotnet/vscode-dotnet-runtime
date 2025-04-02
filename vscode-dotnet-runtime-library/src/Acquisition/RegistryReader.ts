/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as os from 'os';
import * as path from 'path';

import { CommandExecutor } from '../Utils/CommandExecutor';
import { CommandExecutorResult } from '../Utils/CommandExecutorResult';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { DOTNET_INFORMATION_CACHE_DURATION_MS } from './CacheTimeConstants';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IRegistryReader } from "./IRegistryReader";

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

export class RegistryReader extends IRegistryReader
{
    protected commandRunner: ICommandExecutor;

    constructor(context: IAcquisitionWorkerContext, utilContext: IUtilityContext, executor: ICommandExecutor | null = null)
    {
        super();
        this.commandRunner = executor ?? new CommandExecutor(context, utilContext);
    }

    /**
     * @remarks architecture values accepted: x64, arm64. x86, arm32 possible on linux but 32 bit vscode is not supported.
     * @returns the folder containing the host
     */
    public async getHostLocation(architecture: string): Promise<string | undefined>
    {
        // InstallLocation vs sharedhost:

        // The sharedhost registry key stores the path of dotnet that gets put on the PATH.
        // The InstallLocation stores other paths to the host that might not be on the PATH, such as an x64 host on an arm64 machine.
        // The InstallLocation is always under the 32 bit reg node for our purposes, and the sharedhost is always on the native node.
        // (You can't install arm64 SDK or Runtime on x64, but you can do vice versa and they follow the same methodology.)

        // For non native installs: sharedhost nodes may exist, but there will be no path key

        // See https://github.com/dotnet/runtime/issues/109974
        // Docs: https://github.com/dotnet/designs/blob/main/accepted/2021/install-location-per-architecture.md
        const queryForPATHLocationNotViaPATH = `HKEY_LOCAL_MACHINE\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\${architecture}\\sharedhost`;
        const queryForInstallLocationNotPATH = `HKEY_LOCAL_MACHINE\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\${architecture}\\InstallLocation`;

        const queryForPATH = os.arch() === architecture;
        let queriedInstallationLocation = false;
        let result = null;
        if (queryForPATH)
        {
            result = await this.queryRegistry(queryForPATHLocationNotViaPATH, false, 'Path');
        }
        if (!queryForPATH || result?.status !== '0')
        {
            result = await this.queryRegistry(queryForInstallLocationNotPATH, true, 'InstallLocation');
            queriedInstallationLocation = true;
        }

        if (result?.status === '0')
        {
            // Output is of the type
            // REGISTRY_KEY
            // Key   REG_SZ    C:\path\to\dotnet
            let keyRow = result.stdout?.trim()?.split("\n")?.[1]?.trim(); // Get the line that contains Key REG_SZ Path
            if (!keyRow)
            {
                // If there's an extra newline in the output or reg.exe format changes, find the line which contains the key -- slower
                keyRow = result.stdout?.trim()?.split("\n")?.filter((x) => x.toLowerCase().includes('path') || x.toLowerCase().includes('installlocation'))?.[0]?.trim();
            }
            const finalPath = keyRow?.split(' ')?.filter((x: any) => x !== '')?.slice(2)?.join(' '); // remove N (typically 4) spaces between each output, then remove the ''s, then split by space again to remove Key and REG_SZ, and recombine any path with spaces
            return finalPath
        }

        return undefined;
    }

    /**
     *
     * @returns an array containing fully specified / specific versions of all globally installed sdks on the machine in windows for 32 and 64 bit sdks.
     */
    public async getGlobalSdkVersionsInstalledOnMachine(): Promise<Array<string>>
    {
        let sdks: string[] = [];

        if (os.platform() === 'win32')
        {
            const sdkInstallRecords64Bit = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x64\\sdk';
            const sdkInstallRecords32Bit = sdkInstallRecords64Bit.replace('x64', 'x86');
            const sdkInstallRecordsArm64 = sdkInstallRecords64Bit.replace('x64', 'arm64');

            const queries = [sdkInstallRecords32Bit, sdkInstallRecords64Bit, sdkInstallRecordsArm64];
            for (const query of queries)
            {
                // /reg:32 is added because all keys on 64 bit machines are all put into the WOW node. They won't be on the WOW node on a 32 bit machine.
                const registryLookup = await this.queryRegistry(query, true);
                if (registryLookup === null)
                {
                    return [];
                }

                let installRecordKeysOfXBit = '';
                if (registryLookup.status === '0')
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

    private async queryRegistry(query: string, underWowNode: boolean, querySingleValue?: string): Promise<CommandExecutorResult | null>
    {
        try
        {
            const registryQueryCommand = path.join(`${process.env.SystemRoot}`, `System32\\reg.exe`);
            let queryParameters = [`query`, `${query}`];
            if (underWowNode)
            {
                queryParameters = [...queryParameters, `\/reg:32`];
            }
            if (querySingleValue)
            {
                queryParameters = [...queryParameters, `/v`, `${querySingleValue}`];
            }

            const command = CommandExecutor.makeCommand(registryQueryCommand, queryParameters);
            const registryLookup = (await this.commandRunner.execute(command, { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false));
            return registryLookup;
        }
        catch (e)
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
    private extractVersionsOutOfRegistryKeyStrings(registryQueryResult: string): string[]
    {
        if (registryQueryResult === '')
        {
            return [];
        }
        else
        {
            return registryQueryResult.split(' ')
                .filter
                (
                    function (value: string, i: number) { return value !== '' && i !== 0; } // Filter out the whitespace & query as the query return value starts with the query.
                )
                .filter
                (
                    function (value: string, i: number) { return i % 3 === 0; } // Every 0th, 4th, etc item will be a value name AKA the SDK version. The rest will be REGTYPE and REGHEXVALUE.
                );
        }
    }
}