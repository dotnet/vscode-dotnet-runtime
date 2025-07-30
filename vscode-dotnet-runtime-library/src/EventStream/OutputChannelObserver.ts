/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import
{
    DotnetAcquisitionAlreadyInstalled,
    DotnetAcquisitionCompleted,
    DotnetAcquisitionError,
    DotnetAcquisitionInProgress,
    DotnetAcquisitionStarted,
    DotnetCustomMessageEvent,
    DotnetExistingPathResolutionCompleted,
    DotnetInstallExpectedAbort,
    DotnetOfflineInstallUsed,
    DotnetOfflineWarning,
    DotnetUpgradedEvent,
    DotnetVisibleWarningEvent
} from './EventStreamEvents';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';
import { IOutputChannel } from './IOutputChannel';

export class OutputChannelObserver implements IEventStreamObserver
{
    private readonly inProgressDownloads: string[] = [];
    private downloadProgressInterval: NodeJS.Timeout | undefined;
    private hasContent: boolean = false;

    constructor(
        private readonly outputChannel: IOutputChannel,
        private readonly suppressOutput: boolean = false,
        private readonly highVerbosity: boolean = false,
    )
    {
    }


    public post(event: IEvent): void
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (this.suppressOutput || ((event as any)?.verboseOutputOnly && !this.highVerbosity))
        {
            return;
        }

        switch (event.type)
        {
            case EventType.DotnetAcquisitionStart:
                const acquisitionStarted = event as DotnetAcquisitionStarted;

                this.inProgressDownloads.push(acquisitionStarted.install.installId);

                this.writeOutput(`${acquisitionStarted.requestingExtensionId} requested to download the ${acquisitionStarted.install.installMode === 'sdk' ? '.NET SDK' :
                    acquisitionStarted.install.installMode === 'runtime' ? '.NET Runtime' :
                        '.NET ASP.NET Runtime'
                    }.`);

                this.writeOutputWithLine('');

                if ((this.inProgressDownloads?.length ?? 0) > 1)
                {
                    // Already a download in progress
                    this.writeOutputWithLine(` -- Concurrent download of '${acquisitionStarted.install.installId}' started!`);
                    this.writeOutputWithLine('');
                }
                else
                {
                    this.startDownloadIndicator();
                }

                const startVersionString = this.inProgressDownloads.join(', ');
                this.writeOutput(`Downloading .NET version(s) ${startVersionString} ...`);
                break;
            case EventType.DotnetAcquisitionCompleted:
                const acquisitionCompleted = event as DotnetAcquisitionCompleted;
                this.writeOutputWithLine(' Done!');
                this.writeOutputWithLine(`.NET ${acquisitionCompleted.install.installId} executable path: ${acquisitionCompleted.dotnetPath}`);
                this.writeOutputWithLine('');

                this.inProgressVersionDone(acquisitionCompleted.install.installId);

                if ((this.inProgressDownloads?.length ?? 0) > 0)
                {
                    const completedVersionString = `'${this.inProgressDownloads.join('\', \'')}'`;
                    this.writeOutput(`Still downloading .NET version(s) ${completedVersionString} ...`);
                }
                else
                {
                    this.stopDownloadIndicator();
                }
                break;
            case EventType.DotnetAcquisitionSuccessEvent:
                if (event instanceof DotnetExistingPathResolutionCompleted)
                {
                    this.writeOutput(`Using configured .NET path: ${(event as DotnetExistingPathResolutionCompleted).resolvedPath}\n`);
                }
                break;
            case EventType.DotnetVisibleWarning:
                this.writeOutputWithLine('');
                this.writeOutputWithLine((event as DotnetVisibleWarningEvent).eventMessage);
                this.writeOutputWithLine('');
                break;
            case EventType.DotnetAcquisitionAlreadyInstalled:
                if (event instanceof DotnetAcquisitionAlreadyInstalled)
                {
                    this.writeOutput(`${(event as DotnetAcquisitionAlreadyInstalled).requestingExtensionId
                        }: Trying to install .NET ${(event as DotnetAcquisitionAlreadyInstalled).install.installId
                        } but it already exists. No downloads or changes were made.\n`);
                }
                break;
            case EventType.DotnetAcquisitionInProgress:
                if (event instanceof DotnetAcquisitionInProgress)
                {
                    this.writeOutput(`${(event as DotnetAcquisitionInProgress).requestingExtensionId
                        } tried to install .NET ${(event as DotnetAcquisitionInProgress).install.installId
                        } but that install had already been requested. No downloads or changes were made.\n`);
                }
                break;
            case EventType.DotnetAcquisitionError, EventType.DotnetAcquisitionFinalError:
                const error = event as DotnetAcquisitionError;
                this.writeOutputWithLine(`\nError : (${error?.eventName ?? ''})`);

                if (this.inProgressDownloads.includes(error?.install?.installId ?? ''))
                {
                    this.writeOutputWithLine(`Failed to download .NET ${error?.install?.installId}:`);
                    this.writeOutputWithLine(error?.error?.message);
                    this.writeOutputWithLine('');

                    this.updateDownloadIndicators(error.install?.installId);
                }

                break;
            case EventType.DotnetInstallExpectedAbort:
                const abortEvent = event as DotnetInstallExpectedAbort;
                this.writeOutputWithLine(`Cancelled Installation of .NET ${abortEvent.install?.installId}.`);
                this.writeOutputWithLine(abortEvent.error.message);

                this.updateDownloadIndicators(abortEvent.install?.installId);
                break;
            case EventType.DotnetUpgradedEvent:
                const upgradeMessage = event as DotnetUpgradedEvent;
                this.writeOutputWithLine(`${upgradeMessage.eventMessage}:`);
                break;
            case EventType.OfflineInstallUsed:
                const offlineUsedMsg = event as DotnetOfflineInstallUsed;
                this.writeOutputWithLine(offlineUsedMsg.eventMessage);
                break;
            case EventType.OfflineWarning:
                const offlineWarning = event as DotnetOfflineWarning;
                this.writeOutputWithLine(offlineWarning.eventMessage);
                break;
            case EventType.DotnetUninstallMessage:
                const uninstallMessage = event as DotnetCustomMessageEvent;
                this.writeOutputWithLine(uninstallMessage.eventMessage);
                break;
            case EventType.FeedInjectionMessage:
                const feedMessage = event as DotnetCustomMessageEvent;
                this.writeOutputWithLine(feedMessage.eventMessage);
                break;
        }
    }

    private writeOutput(output: string)
    {
        this.outputChannel.append(output);
        this.hasContent = true;
    }

    private writeOutputWithLine(output: string)
    {
        this.outputChannel.appendLine(output);
        this.hasContent = true;
    }

    public showOutputIfHasContent(preserveFocus: boolean = true): void
    {
        if (this.hasContent)
        {
            this.outputChannel.show(preserveFocus);
        }
    }

    public dispose(): void
    {
        // Nothing to dispose
    }

    private updateDownloadIndicators(installId: string | null | undefined)
    {
        if (installId && installId !== 'null')
        {
            this.inProgressVersionDone(installId);
        }

        if ((this.inProgressDownloads?.length ?? 0) > 0)
        {
            const errorVersionString = this.inProgressDownloads.join(', ');
            this.writeOutput(`Still downloading .NET version(s) ${errorVersionString} ...`);
        }
        else
        {
            this.stopDownloadIndicator();
        }
    }

    private startDownloadIndicator()
    {
        this.downloadProgressInterval = setInterval(() => this.writeOutput('.'), 3000);
    }

    private stopDownloadIndicator()
    {
        if (this.downloadProgressInterval)
        {
            clearTimeout(this.downloadProgressInterval);
            this.downloadProgressInterval = undefined;
        }
    }

    private inProgressVersionDone(version: string)
    {
        const index = this.inProgressDownloads.indexOf(version);
        this.inProgressDownloads.splice(index, 1);
    }
}
