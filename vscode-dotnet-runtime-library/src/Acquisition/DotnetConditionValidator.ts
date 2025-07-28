/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { DotnetConditionsValidated, DotnetFindPathDidNotMeetCondition } from '../EventStream/EventStreamEvents';
import { IDotnetFindPathContext } from '../IDotnetFindPathContext';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { FileUtilities } from '../Utils/FileUtilities';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { DotnetResolver } from './DotnetResolver';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetConditionValidator } from './IDotnetConditionValidator';
import { IDotnetResolver } from './IDotnetResolver';
import { InstallRecordWithPath } from './InstallRecordWithPath';
import * as versionUtils from './VersionUtilities';

type simplifiedVersionSpec = 'equal' | 'greater_than_or_equal' | 'less_than_or_equal' |
    'latestPatch' | 'latestFeature';

export class DotnetConditionValidator implements IDotnetConditionValidator
{
    private resolver: IDotnetResolver;

    public constructor(private readonly workerContext: IAcquisitionWorkerContext, private readonly utilityContext: IUtilityContext, private executor?: ICommandExecutor)
    {
        this.executor ??= new CommandExecutor(this.workerContext, this.utilityContext);
        this.resolver ??= new DotnetResolver(this.workerContext, this.utilityContext, this.executor);
    }

    public async dotnetMeetsRequirement(dotnetExecutablePath: string, requirement: IDotnetFindPathContext): Promise<boolean>
    {
        const availableInstalls = await this.resolver.getDotnetInstalls(dotnetExecutablePath, requirement.acquireContext.mode ?? 'runtime', requirement.acquireContext.architecture);
        // Assumption : All APIs we call return only one architecture in the group of installs we get (currently a true assumption)
        const determinedInstallArchitecture = availableInstalls.at(0)?.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture();

        if (requirement.acquireContext.mode === 'sdk')
        {
            if (availableInstalls.some((sdk) =>
            {
                return this.stringArchitectureMeetsRequirement(determinedInstallArchitecture, requirement.acquireContext.architecture) &&
                    this.stringVersionMeetsRequirement(sdk.version, requirement.acquireContext.version, requirement) && this.allowPreview(sdk.version, requirement);
            }))
            {
                this.workerContext.eventStream.post(new DotnetConditionsValidated(`${dotnetExecutablePath} satisfies the conditions.`));
                return true;
            }
        }
        else
        {
            if (availableInstalls.some((runtime) =>
            {
                return runtime.mode === requirement.acquireContext.mode && this.stringArchitectureMeetsRequirement(determinedInstallArchitecture, requirement.acquireContext.architecture) &&
                    this.stringVersionMeetsRequirement(runtime.version, requirement.acquireContext.version, requirement) && this.allowPreview(runtime.version, requirement);
            }))
            {
                this.workerContext.eventStream.post(new DotnetConditionsValidated(`${dotnetExecutablePath} satisfies the conditions.`));
                return true;
            }
        }

        this.workerContext.eventStream.post(new DotnetFindPathDidNotMeetCondition(`${dotnetExecutablePath} did NOT satisfy the conditions: hostArch: ${determinedInstallArchitecture}, requiredArch: ${requirement.acquireContext.architecture},
            required version: ${requirement.acquireContext.version}, required mode: ${requirement.acquireContext.mode}`));

        return false;
    }




    public stringVersionMeetsRequirement(availableVersion: string, requestedVersion: string, requirement: IDotnetFindPathContext): boolean
    {
        const availableMajor = Number(versionUtils.getMajor(availableVersion, this.workerContext.eventStream, this.workerContext));
        const requestedMajor = Number(versionUtils.getMajor(requestedVersion, this.workerContext.eventStream, this.workerContext));
        const requestedPatchStr: string | null = requirement.acquireContext.mode !== 'sdk' ? versionUtils.getRuntimePatchVersionString(requestedVersion, this.workerContext.eventStream, this.workerContext)
            : versionUtils.getSDKCompleteBandAndPatchVersionString(requestedVersion, this.workerContext.eventStream, this.workerContext);
        const requestedPatch = requestedPatchStr ? Number(requestedPatchStr) : null;

        const adjustedVersionSpec: simplifiedVersionSpec = [requirement.versionSpecRequirement].map(x =>
        {
            switch (x)
            {
                case 'latestMajor':
                    return 'greater_than_or_equal';
                case 'disable':
                    return 'equal';
                default:
                    return x;
            }
        }).at(0)!;

        if (availableMajor === requestedMajor)
        {
            const availableMinor = Number(versionUtils.getMinor(availableVersion, this.workerContext.eventStream, this.workerContext));
            const requestedMinor = Number(versionUtils.getMinor(requestedVersion, this.workerContext.eventStream, this.workerContext));

            if (availableMinor === requestedMinor && requestedPatch)
            {
                const availablePatch = this.getPatchOrFeatureBandWithPatch(availableVersion, requirement);

                switch (adjustedVersionSpec)
                {
                    // the 'availablePatch' must exist, since the version is from --list-runtimes or --list-sdks, or our internal tracking of installs.
                    case 'equal':
                        return availablePatch === requestedPatch;
                    case 'greater_than_or_equal':
                    case 'latestFeature':
                        return availablePatch! >= requestedPatch;
                    case 'less_than_or_equal':
                        return availablePatch! <= requestedPatch;
                    case 'latestPatch':
                        const availableBand = this.getFeatureBand(availableVersion, requirement);
                        const requestedBandStr = requirement.acquireContext.mode === 'sdk' ? versionUtils.getFeatureBandFromVersion(requestedVersion, this.workerContext.eventStream, this.workerContext, false) ?? null : null;
                        const requestedBand = requestedBandStr ? Number(requestedBandStr) : null;
                        return availablePatch! >= requestedPatch && (availableBand ? availableBand === requestedBand : true);
                }
            }
            else
            {
                switch (adjustedVersionSpec)
                {
                    case 'equal':
                        return availableMinor === requestedMinor;
                    case 'greater_than_or_equal':
                        return availableMinor >= requestedMinor;
                    case 'less_than_or_equal':
                        return availableMinor <= requestedMinor;
                    case 'latestPatch':
                    case 'latestFeature':
                        const availableBand = this.getFeatureBand(availableVersion, requirement);
                        const requestedBandStr = requirement.acquireContext.mode === 'sdk' ? versionUtils.getFeatureBandFromVersion(requestedVersion, this.workerContext.eventStream, this.workerContext, false) ?? null : null;
                        const requestedBand = requestedBandStr ? Number(requestedBandStr) : null;
                        return availableMinor === requestedMinor && (availableBand ? availableBand === requestedBand : true);
                }
            }
        }
        else
        {
            switch (adjustedVersionSpec)
            {
                case 'equal':
                    return false;
                case 'greater_than_or_equal':
                    return availableMajor >= requestedMajor;
                case 'less_than_or_equal':
                    return availableMajor <= requestedMajor;
                case 'latestPatch':
                case 'latestFeature':
                    return false
            }
        }
    }

    private getFeatureBand(availableVersion: string, requirement: IDotnetFindPathContext): number | null
    {
        const availableBandStr: string | null = requirement.acquireContext.mode === 'sdk' ?
            (() =>
            {
                const featureBand = versionUtils.getFeatureBandFromVersion(availableVersion, this.workerContext.eventStream, this.workerContext, false);
                if (featureBand)
                {
                    return featureBand;
                }
                return null;
            })() : null;
        return availableBandStr ? Number(availableBandStr) : null;
    }

    private getPatchOrFeatureBandWithPatch(availableVersion: string, requirement: IDotnetFindPathContext): number | null
    {
        const availablePatchStr: string | null = requirement.acquireContext.mode !== 'sdk' ?
            versionUtils.getRuntimePatchVersionString(availableVersion, this.workerContext.eventStream, this.workerContext)
            :
            (() =>
            {
                const band = versionUtils.getSDKCompleteBandAndPatchVersionString(availableVersion, this.workerContext.eventStream, this.workerContext);
                if (band)
                {
                    return band;
                }
                return null;
            })();

        const availablePatch = availablePatchStr ? Number(availablePatchStr) : null;
        return availablePatch;
    }

    public filterValidPaths(recordPaths: InstallRecordWithPath[], requirement: IDotnetFindPathContext): InstallRecordWithPath[]
    {
        return recordPaths.filter(installInfo => this.stringVersionMeetsRequirement(installInfo.installRecord.dotnetInstall.version, requirement.acquireContext.version, requirement));
    }

    private stringArchitectureMeetsRequirement(outputArchitecture: string, requiredArchitecture: string | null | undefined): boolean
    {
        return !requiredArchitecture || !outputArchitecture || FileUtilities.dotnetInfoArchToNodeArch(outputArchitecture, this.workerContext.eventStream) === requiredArchitecture;
    }

    private allowPreview(availableVersion: string, requirement: IDotnetFindPathContext): boolean
    {
        if (requirement.rejectPreviews === true)
        {
            return !versionUtils.isPreviewVersion(availableVersion, this.workerContext.eventStream, this.workerContext);
        }
        return true;
    }


}