/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetCoreAcquisitionWorker } from "./DotnetCoreAcquisitionWorker";

/**
 * @remarks
 * A string representing the installation of either a .NET runtime or .NET SDK.
 */
export interface IInstallKey
{
    installKey: string;
    version: string;
    architecture: string;
    isGlobal: boolean;
    isRuntime: boolean;
}

function IsEquivalentInstallationFile(a: IInstallKey, b: IInstallKey): boolean
{
    return a.version === b.version && a.architecture === b.architecture &&
    a.isGlobal === b.isGlobal && a.isRuntime === b.isRuntime
}

export function GenerateNewInstallKey(version: string, installRuntime: boolean, isGlobal : boolean, architecture : string) : IInstallKey
{
    return {
        installKey : DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(version, architecture),
        version : version,
        architecture : architecture,
        isGlobal : isGlobal,
        isRuntime : installRuntime,
    } as IInstallKey;
}


/**
 * @remarks
 * The string containing the extensionid of the extension which requested the install.
 * 'user' if the user installed it themselves.
 * null if we don't know because the install was done before we kept track of these things.
 */
export type InstallOwner = string | null;

/**
 * @remarks
 * Records to save between extension loads to know who owns what installs and which ones exist.
 * Some of the types exist due to a need to support existing installs before this type existed.
 * All discovered old installs should be replaced with the new type.
 */
export interface IInstallationRecord
{
    installKey: InstallKey;
    installingExtensions: InstallOwner[];
    installDirectory: string;
}

/**
 * @remarks
 * The record can be the type or it can be a 'legacy' record from old installs which is just a string with the install key.
 */
export type InstallRecord = IInstallationRecord | string;


/**
 * @remarks
 * The key can be a type containing all of the information or the 'legacy' key which is a string that contains all of the information.
 */
export type InstallKey = IInstallKey | string;


interface InProgressInstall
{
    installKey: InstallKey;
    installingPromise: Promise<string>;
}

function convertInstallKeyToLegacyKey(key : IInstallKey) : string
{
    return `${key.version}-${key.architecture}~${key.isGlobal}`;
}

export class InProgressInstallManager
{
    private inProgressInstalls: Set<InProgressInstall> = new Set<InProgressInstall>();

    public clear() : void
    {
        this.inProgressInstalls.clear();
    }

    public contains(key : InstallKey) : boolean
    {
        if (typeof key === 'string')
        {
            throw new Error(`When searching for in progress installs, use only the new type.`);
        }
        else
        {
            this.inProgressInstalls.forEach(x =>
            {
                if(typeof x === 'string')
                {
                    throw new Error(`In progress installed pointed to a string installation key: ${x}, which is unexpected. All managed installs should be the new type.`);
                }
                else
                {
                    const xAsKey = x.installKey as IInstallKey;
                    if(IsEquivalentInstallationFile(xAsKey, key))
                    {
                        return true;
                    }
                }
            });
        }

        return false;
    }

    public add(key : InstallKey, workingInstall : Promise<string>) : void
    {
        if (typeof key === 'string')
        {
            throw new Error(`When adding in progress installs, use only the new type.`);
        }

        this.inProgressInstalls.add({ installKey: key, installingPromise: workingInstall });
    }

    public remove(key : InstallKey) : void
    {
        if (typeof key === 'string')
        {
            throw new Error(`When completing in progress installs, use only the new type.`);
        }

        const resolvedInstall : InProgressInstall | undefined = [...this.inProgressInstalls].find(x => IsEquivalentInstallationFile(x.installKey as IInstallKey, key));
        if(!resolvedInstall)
        {
            // todo : event stream?
            return;
        }
        this.inProgressInstalls.delete(resolvedInstall);
    }
}