/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { NoMatchingInstallToStopTracking } from '../EventStream/EventStreamEvents';
import {
    DotnetInstall,
    IsEquivalentInstallation,
    IsEquivalentInstallationFile
} from './DotnetInstall';


interface InProgressInstall
{
    dotnetInstall: DotnetInstall;
    // The string is the path of the install once completed.
    installingPromise: Promise<string>;
}


export class InProgressInstallManager
{
    private inProgressInstalls: Set<InProgressInstall> = new Set<InProgressInstall>();

    public constructor(private readonly context : IAcquisitionWorkerContext)
    {

    }

    public clear() : void
    {
        this.inProgressInstalls.clear();
    }

    /**
     *
     * @param key the install key to get a working install promise for.
     * @returns null if there is no promise for this install, otherwise the promise.
     */
    public getPromise(key : DotnetInstall) : Promise<string> | null
    {
        this.inProgressInstalls.forEach(x =>
        {
            const xAsKey = x.dotnetInstall as DotnetInstall;
            if(IsEquivalentInstallationFile(xAsKey, key))
            {
                return x.installingPromise;
            }
        })

        return null;
    }

    public add(key : DotnetInstall, workingInstall : Promise<string>) : void
    {
        this.inProgressInstalls.add({ dotnetInstall: key, installingPromise: workingInstall });
    }

    public remove(key : DotnetInstall) : void
    {
        const resolvedInstall : InProgressInstall | undefined = [...this.inProgressInstalls].find(x => IsEquivalentInstallation(x.dotnetInstall as DotnetInstall, key));
        if(!resolvedInstall)
        {
            this.context.eventStream.post(new NoMatchingInstallToStopTracking(`No matching install to stop tracking for ${key.installKey}.
Installs: ${[...this.inProgressInstalls].map(x => x.dotnetInstall.installKey).join(', ')}`));
            return;
        }
        this.inProgressInstalls.delete(resolvedInstall);
    }
}