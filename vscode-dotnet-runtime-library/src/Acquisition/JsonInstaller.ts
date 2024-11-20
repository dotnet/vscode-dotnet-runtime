/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IEventStream } from "../EventStream/EventStream";
import { DotnetVSCodeExtensionChange, DotnetVSCodeExtensionFound, DotnetVSCodeExtensionHasInstallRequest } from "../EventStream/EventStreamEvents";
import { IDotnetAcquireContext } from "../IDotnetAcquireContext";
import { IVSCodeExtensionContext } from "../IVSCodeExtensionContext";
import { IJsonInstaller } from "./IJsonInstaller";

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

export class JsonInstaller extends IJsonInstaller
{
    constructor(protected readonly eventStream: IEventStream, protected readonly vscodeAccessor : IVSCodeExtensionContext)
    {
        super(eventStream, vscodeAccessor);
        // If a new extension is installed, we want to install .NET preemptively for it if specified
        vscodeAccessor.registerOnExtensionChange(() =>
        {
            this.eventStream.post(new DotnetVSCodeExtensionChange(vscodeAccessor.localize(`A change was detected in the extensions. Installing .NET for new extensions.`)));
            this.executeJSONRequests().catch( () => {});
        })

        // On startup, (our extension gets activated onStartupFinished() via 'activationEvents' in package.json) we want to install .NET preemptively
        // So other extensions can have a faster startup time if they so desire
        this.executeJSONRequests().catch( () => {});
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async executeJSONRequests(): Promise<void>
    {
        const extensions = this.vscodeAccessor.getExtensions();
        for(const extension of extensions)
        {
            const extensionPackage = extension?.packageJSON;
            this.eventStream.post(new DotnetVSCodeExtensionFound(`Checking extension ${extension?.id} for .NET installation requests`));

            if(extensionPackage['x-dotnet-acquire'])
            {
                this.eventStream.post(new DotnetVSCodeExtensionHasInstallRequest(`Installing .NET for extension ${extension.id}`));
                const jsonRequest = (extensionPackage as { "x-dotnet-acquire": Omit<IDotnetAcquireContext, "requestingExtensionId"> })["x-dotnet-acquire"];
                const apiRequest : IDotnetAcquireContext = { ...jsonRequest, requestingExtensionId: extension.id };
                this.vscodeAccessor.executeCommand('dotnet.acquire', apiRequest);
            }

        }
    }
}
