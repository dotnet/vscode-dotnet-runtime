/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { DotnetCoreAcquisitionWorker } from "./DotnetCoreAcquisitionWorker";

/**
 * @remarks
 * A string representing the installation of either a .NET runtime or .NET SDK.
 */
export interface DotnetInstall
{
    installKey: string;
    version: string;
    architecture: string;
    isGlobal: boolean;
    isRuntime: boolean;
}

export function IsEquivalentInstallationFile(a: DotnetInstall, b: DotnetInstall): boolean
{
    return a.version === b.version && a.architecture === b.architecture &&
    a.isGlobal === b.isGlobal && a.isRuntime === b.isRuntime
}

export function InstallToStrings(key : DotnetInstall | null)
{
    if(!key)
    {
        return { installKey: '', version: '', architecture: '', isGlobal: '', isRuntime: '' };
    }

    return {
        installKey: key.installKey,
        version: key.version,
        architecture: key.architecture,
        isGlobal: key.isGlobal.toString(),
        isRuntime: key.isRuntime.toString()
    }
}

export function getArchFromLegacyInstallKey(installKey : string) : string | undefined
{
    const splitKey = installKey.split('~');
    if(splitKey.length === 2)
    {
        return splitKey[1];
    }
    return undefined;
}

export function getVersionFromLegacyInstallKey(installKey : string) : string
{
    if(isGlobalLegacyInstallKey(installKey))
    {
        const splitKey = installKey.split('-');
        return splitKey[0];
    }
    else if(installKey.includes('~'))
    {
        const splitKey = installKey.split('~');
        return splitKey[0];
    }
    else // legacy, legacy install key (before it included the arch)
    {
        return installKey;
    }
}

export function looksLikeRuntimeVersion(version : string) : boolean
{
    const band : string | undefined = version.split('.')?.at(2);
    return !band || band.length <= 2; // assumption : there exists no runtime version at this point over 99 sub versions
}

export function isRuntimeInstallKey(installKey : string) : boolean
{
    const installKeyVersion = getVersionFromLegacyInstallKey(installKey);
    return !installKey.includes('sdk') && looksLikeRuntimeVersion(installKeyVersion);
}

export function isGlobalLegacyInstallKey(installKey : string) : boolean
{
    return installKey.toLowerCase().includes('global');
}

export function GetDotnetInstallInfo(version: string, installRuntime: boolean, isGlobal : boolean, architecture : string) : DotnetInstall
{
    return {
        installKey : DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(version, architecture),
        version : version,
        architecture : architecture,
        isGlobal : isGlobal,
        isRuntime : installRuntime,
    } as DotnetInstall;
}

export function installKeyStringToDotnetInstall(installKey : string) : DotnetInstall
{
    return {
        installKey: installKey,
        version: getVersionFromLegacyInstallKey(installKey),
        architecture: getArchFromLegacyInstallKey(installKey) ?? os.arch(),
        isGlobal: isGlobalLegacyInstallKey(installKey),
        isRuntime: isRuntimeInstallKey(installKey)
    }
}
/**
 * @remarks
 * The string containing the extensionid of the extension which requested the install.
 * 'user' if the user installed it themselves.
 * null if we don't know because the install was done before we kept track of these things.
 * It can also be null if the install was done by an external source ...
 * including a different user on the machine through our extension. (they should manage it.)
 */
export type InstallOwner = string | null;

/**
 * @remarks
 * Records to save between extension loads to know who owns what installs and which ones exist.
 * Some of the types exist due to a need to support existing installs before this type existed.
 * All discovered old installs should be replaced with the new type.
 */
export interface InstallRecord
{
    dotnetInstall: DotnetInstall;
    installingExtensions: InstallOwner[];
}


// we might be able to get rid of this
/**
 * @remarks
 * The record can be the type or it can be a 'legacy' record from old installs which is just a string with the install key.
 */
export type InstallRecordOrStr = InstallRecord | string;


/**
 * @remarks
 * The key can be a type containing all of the information or the 'legacy' key which is a string that contains all of the information.
 */
export type DotnetInstallOrStr = DotnetInstall | string;


interface InProgressInstall
{
    dotnetInstall: DotnetInstall;
    // The string is the path of the install once completed.
    installingPromise: Promise<string>;
}

export class InProgressInstallManager
{
    private inProgressInstalls: Set<InProgressInstall> = new Set<InProgressInstall>();

    public clear() : void
    {
        this.inProgressInstalls.clear();
    }

    /**
     *
     * @param key the install key to get a working install promise for.
     * @returns null if there is no promise for this install, otherwise the promise.
     */
    public getPromise(key : DotnetInstallOrStr) : Promise<string> | null
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
                    const xAsKey = x.dotnetInstall as DotnetInstall;
                    if(IsEquivalentInstallationFile(xAsKey, key))
                    {
                        return x.installingPromise;
                    }
                }
            });
        }

        return null;
    }

    public add(key : DotnetInstallOrStr, workingInstall : Promise<string>) : void
    {
        if (typeof key === 'string')
        {
            throw new Error(`When adding in progress installs, use only the new type.`);
        }

        this.inProgressInstalls.add({ dotnetInstall: key, installingPromise: workingInstall });
    }

    public remove(key : DotnetInstallOrStr) : void
    {
        if (typeof key === 'string')
        {
            throw new Error(`When completing in progress installs, use only the new type.`);
        }

        const resolvedInstall : InProgressInstall | undefined = [...this.inProgressInstalls].find(x => IsEquivalentInstallationFile(x.dotnetInstall as DotnetInstall, key));
        if(!resolvedInstall)
        {
            // todo : event stream?
            return;
        }
        this.inProgressInstalls.delete(resolvedInstall);
    }
}