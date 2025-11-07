/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { AUTOMATIC_UPDATE_EXTENSION_ID } from '../Acquisition/StringConstants';
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
    private hasContent = false;

    constructor(
        private readonly outputChannel: IOutputChannel,
        private readonly suppressOutput = false,
        private readonly highVerbosity = false,
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

                this.appendOutput(`${acquisitionStarted.requestingExtensionId} requested to download the ${acquisitionStarted.install.installMode === 'sdk' ? '.NET SDK' :
                    acquisitionStarted.install.installMode === 'runtime' ? '.NET Runtime' :
                        'ASP.NET Core'
                    }.`);

                this.appendOutputLine('');

                if ((this.inProgressDownloads?.length ?? 0) > 1)
                {
                    // Already a download in progress
                    this.appendOutputLine(` -- Concurrent download of '${acquisitionStarted.install.installId}' started!`);
                    this.appendOutputLine('');
                }
                else
                {
                    this.startDownloadIndicator();
                }

                const startVersionString = this.inProgressDownloads.join(', ');
                this.appendOutput(`Downloading .NET version(s) ${startVersionString} ...`);
                break;
            case EventType.DotnetAcquisitionCompleted:
                const acquisitionCompleted = event as DotnetAcquisitionCompleted;
                this.appendOutputLine(' Done!');
                this.appendOutputLine(`.NET ${acquisitionCompleted.install.installId} executable path: ${acquisitionCompleted.dotnetPath}`);
                this.appendOutputLine('');

                this.inProgressVersionDone(acquisitionCompleted.install.installId);

                if ((this.inProgressDownloads?.length ?? 0) > 0)
                {
                    const completedVersionString = `'${this.inProgressDownloads.join('\', \'')}'`;
                    this.appendOutput(`Still downloading .NET version(s) ${completedVersionString} ...`);
                }
                else
                {
                    this.stopDownloadIndicator();
                }
                break;
            case EventType.DotnetAcquisitionSuccessEvent:
                if (event instanceof DotnetExistingPathResolutionCompleted)
                {
                    this.appendOutput(`Using configured .NET path: ${(event as DotnetExistingPathResolutionCompleted).resolvedPath}\n`);
                }
                break;
            case EventType.DotnetVisibleWarning:
                this.appendOutputLine('');
                this.appendOutputLine((event as DotnetVisibleWarningEvent).eventMessage);
                this.appendOutputLine('');
                break;
            case EventType.DotnetAcquisitionAlreadyInstalled:
                if (event instanceof DotnetAcquisitionAlreadyInstalled)
                {
                    const extensionId = (event as DotnetAcquisitionAlreadyInstalled).requestingExtensionId;
                    if (extensionId !== AUTOMATIC_UPDATE_EXTENSION_ID) // automatic update will try to update existing installs - no need to print the message.
                    {
                        this.appendOutput(`${extensionId}: Trying to install .NET ${(event as DotnetAcquisitionAlreadyInstalled).install.installId
                            } but it already exists. No downloads or changes were made.\n`);
                    }
                }
                break;
            case EventType.DotnetAcquisitionInProgress:
                if (event instanceof DotnetAcquisitionInProgress)
                {
                    this.appendOutput(`${(event as DotnetAcquisitionInProgress).requestingExtensionId
                        } tried to install .NET ${(event as DotnetAcquisitionInProgress).install.installId
                        } but that install had already been requested. No downloads or changes were made.\n`);
                }
                break;
            case EventType.DotnetAcquisitionError, EventType.DotnetAcquisitionFinalError:
                const error = event as DotnetAcquisitionError;
                this.appendOutputLine(`\nError : (${error?.eventName ?? ''})`);

                if (this.inProgressDownloads.includes(error?.install?.installId ?? ''))
                {
                    this.appendOutputLine(`Failed to download .NET ${error?.install?.installId}:`);
                    this.appendOutputLine(error?.error?.message);
                    this.appendOutputLine('');

                    this.updateDownloadIndicators(error.install?.installId);
                }

                break;
            case EventType.DotnetInstallExpectedAbort:
                const abortEvent = event as DotnetInstallExpectedAbort;
                this.appendOutputLine(`Cancelled Installation of .NET ${abortEvent.install?.installId}.`);
                this.appendOutputLine(abortEvent.error.message);

                this.updateDownloadIndicators(abortEvent.install?.installId);
                break;
            case EventType.DotnetUpgradedEvent:
                const upgradeMessage = event as DotnetUpgradedEvent;
                this.appendOutputLine(`${upgradeMessage.eventMessage}:`);
                break;
            case EventType.OfflineInstallUsed:
                const offlineUsedMsg = event as DotnetOfflineInstallUsed;
                this.appendOutputLine(offlineUsedMsg.eventMessage);
                break;
            case EventType.OfflineWarning:
                const offlineWarning = event as DotnetOfflineWarning;
                this.appendOutputLine(offlineWarning.eventMessage);
                break;
            case EventType.DotnetUninstallMessage:
                const uninstallMessage = event as DotnetCustomMessageEvent;
                this.appendOutputLine(uninstallMessage.eventMessage);
                break;
            case EventType.FeedInjectionMessage:
                const feedMessage = event as DotnetCustomMessageEvent;
                this.appendOutputLine(feedMessage.eventMessage);
                break;
        }
    }

    private appendOutput(output: string)
    {
        this.outputChannel.append(output);
        this.hasContent = true;
    }

    private appendOutputLine(output: string)
    {
        this.outputChannel.appendLine(output);
        this.hasContent = true;
    }

    public showOutput(preserveFocus = true): void
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
            this.appendOutput(`Still downloading .NET version(s) ${errorVersionString} ...`);
        }
        else
        {
            this.stopDownloadIndicator();
        }
    }

    private startDownloadIndicator()
    {
        this.downloadProgressInterval = setInterval(() => this.appendOutput('.'), 3000);
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
