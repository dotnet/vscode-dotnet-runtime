/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { DotnetInstall, installKeyStringToDotnetInstall, IsEquivalentInstallationFile } from './IInstallationRecord';

interface LocalDotnetInstall
{
    dotnetInstall: DotnetInstall;
    // The string is the path of the install once completed.
    path: string;
}

type LegacyGraveyardOrModernGraveyard = { [installKeys: string]: string } | Set<LocalDotnetInstall>

export class InstallationGraveyard
{
    // The 'graveyard' includes failed uninstall paths and their install key.
    // These will become marked for attempted 'garbage collection' at the end of every acquisition.
    private readonly installPathsGraveyardKey = 'installPathsGraveyard';

    constructor(private readonly context : IAcquisitionWorkerContext)
    {

    }

    protected async getGraveyard() : Promise<Set<LocalDotnetInstall>>
    {
        let graveyard = this.context.extensionState.get<LegacyGraveyardOrModernGraveyard>(this.installPathsGraveyardKey, new Set<LocalDotnetInstall>());
        if(!(graveyard instanceof Set))
        {
            graveyard = new Set<LocalDotnetInstall>(
                Object.entries(graveyard).map(([key, path]) => ({ dotnetInstall: installKeyStringToDotnetInstall(key), path }) as LocalDotnetInstall)
            );
        }

        await this.context.extensionState.update(this.installPathsGraveyardKey, graveyard);
        return graveyard;
    }

    public async get() : Promise<Set<DotnetInstall>>
    {
        let graveyard = await this.getGraveyard();
        return new Set([...graveyard].map(x => x.dotnetInstall));
    }

    public async add(installKey : DotnetInstall, newPath : string)
    {
        let graveyard = await this.getGraveyard();
        const newGraveyard = graveyard.add({ dotnetInstall: installKey, path: newPath } as LocalDotnetInstall);
        await this.context.extensionState.update(this.installPathsGraveyardKey, newGraveyard);
    }

    public async remove(installKey : DotnetInstall)
    {
        let graveyard = await this.getGraveyard();
        const newGraveyard : Set<LocalDotnetInstall> = new Set([...graveyard].filter(x => !IsEquivalentInstallationFile(x.dotnetInstall, installKey)));
        await this.context.extensionState.update(this.installPathsGraveyardKey, newGraveyard);
    }

}