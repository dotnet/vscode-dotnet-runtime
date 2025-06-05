/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { DotnetConditionsValidated, DotnetFindPathDidNotMeetCondition, DotnetUnableToCheckPATHArchitecture } from '../EventStream/EventStreamEvents';
import { IDotnetFindPathContext } from '../IDotnetFindPathContext';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { FileUtilities } from '../Utils/FileUtilities';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { DOTNET_INFORMATION_CACHE_DURATION_MS } from './CacheTimeConstants';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetConditionValidator } from './IDotnetConditionValidator';
import { IDotnetListInfo } from './IDotnetListInfo';
import { InstallRecordWithPath } from './InstallRecordWithPath';
import * as versionUtils from './VersionUtilities';

type simplifiedVersionSpec = 'equal' | 'greater_than_or_equal' | 'less_than_or_equal' |
    'latestPatch' | 'latestFeature';

export class DotnetConditionValidator implements IDotnetConditionValidator
{
    public constructor(private readonly workerContext: IAcquisitionWorkerContext, private readonly utilityContext: IUtilityContext, private executor?: ICommandExecutor)
    {
        this.executor ??= new CommandExecutor(this.workerContext, this.utilityContext);
    }

    public async dotnetMeetsRequirement(dotnetExecutablePath: string, requirement: IDotnetFindPathContext): Promise<boolean>
    {
        let hostArch = '';

        if (requirement.acquireContext.mode === 'sdk')
        {
            const availableSDKs = await this.getSDKs(dotnetExecutablePath, requirement.acquireContext.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture());
            hostArch = availableSDKs?.at(0)?.architecture ?? await this.getHostArchitecture(dotnetExecutablePath, requirement);
            if (availableSDKs.some((sdk) =>
            {
                return this.stringArchitectureMeetsRequirement(hostArch, requirement.acquireContext.architecture) &&
                    this.stringVersionMeetsRequirement(sdk.version, requirement.acquireContext.version, requirement) && this.allowPreview(sdk.version, requirement);
            }))
            {
                this.workerContext.eventStream.post(new DotnetConditionsValidated(`${dotnetExecutablePath} satisfies the conditions.`));
                return true;
            }
        }
        else
        {
            // No need to consider SDKs when looking for runtimes as all the runtimes installed with the SDKs will be included in the runtimes list.
            const availableRuntimes = await this.getRuntimes(dotnetExecutablePath, requirement.acquireContext.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture());
            hostArch = availableRuntimes?.at(0)?.architecture ?? await this.getHostArchitecture(dotnetExecutablePath, requirement);
            if (availableRuntimes.some((runtime) =>
            {
                return runtime.mode === requirement.acquireContext.mode && this.stringArchitectureMeetsRequirement(hostArch, requirement.acquireContext.architecture) &&
                    this.stringVersionMeetsRequirement(runtime.version, requirement.acquireContext.version, requirement) && this.allowPreview(runtime.version, requirement);
            }))
            {
                this.workerContext.eventStream.post(new DotnetConditionsValidated(`${dotnetExecutablePath} satisfies the conditions.`));
                return true;
            }
        }

        this.workerContext.eventStream.post(new DotnetFindPathDidNotMeetCondition(`${dotnetExecutablePath} did NOT satisfy the conditions: hostArch: ${hostArch}, requiredArch: ${requirement.acquireContext.architecture},
            required version: ${requirement.acquireContext.version}, required mode: ${requirement.acquireContext.mode}`));

        return false;
    }

    /**
     *
     * @param hostPath The path to the dotnet executable
     * @returns The architecture of the dotnet host from the PATH, in dotnet info string format
     * The .NET Host will only list versions of the runtime and sdk that match its architecture.
     * Thus, any runtime or sdk that it prints out will be the same architecture as the host.
     * This information is not always accurate as dotnet info is subject to change.
     *
     * @remarks Will return '' if the architecture cannot be determined for some peculiar reason (e.g. dotnet --info is broken or changed).
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    private async getHostArchitecture(hostPath: string, requirement: IDotnetFindPathContext): Promise<string>
    {
        // dotnet --info is not machine-readable and subject to breaking changes. See https://github.com/dotnet/sdk/issues/33697 and https://github.com/dotnet/runtime/issues/98735/
        // Unfortunately even with a new API, that might not go in until .NET 10 and beyond, so we have to rely on dotnet --info for now.*/

        if (!hostPath || hostPath === '""')
        {
            return '';
        }

        const infoCommand = CommandExecutor.makeCommand(`"${hostPath}"`, ['--info']);
        const envWithForceEnglish = process.env;
        envWithForceEnglish.DOTNET_CLI_UI_LANGUAGE = 'en-US';
        // System may not have english installed, but CDK already calls this without issue -- the .NET SDK language invocation is also wrapped by a runtime library and natively includes english assets
        const hostArch = await (this.executor!).execute(infoCommand, { env: envWithForceEnglish, dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false).then((result) =>
        {
            const lines = result.stdout.split('\n').map((line) => line.trim()).filter((line) => (line?.length ?? 0) > 0);
            // This is subject to change but there is no good alternative to do this
            const archLine = lines.find((line) => line.startsWith('Architecture:'));
            if (archLine === undefined)
            {
                this.workerContext.eventStream.post(new DotnetUnableToCheckPATHArchitecture(`Could not find the architecture of the dotnet host ${hostPath}. If this host does not match the architecture ${requirement.acquireContext.architecture}:
Please set the PATH to a dotnet host that matches the architecture ${requirement.acquireContext.architecture}. An incorrect architecture will cause instability for the extension ${requirement.acquireContext.requestingExtensionId}.`));
                if (process.env.DOTNET_INSTALL_TOOL_DONT_ACCEPT_UNKNOWN_ARCH === '1')
                {
                    return 'unknown'; // Bad value to cause failure mismatch, which will become 'auto'
                }
                else
                {
                    return '';
                }
            }
            const arch = archLine.split(' ')[1];
            return arch;
        });

        return hostArch;
    }

    public async getSDKs(existingPath: string, requestedArchitecture: string): Promise<IDotnetListInfo[]>
    {
        if (!existingPath || existingPath === '""')
        {
            return [];
        }

        const findSDKsCommand = CommandExecutor.makeCommand(`"${existingPath}"`, ['--list-sdks', '--arch', requestedArchitecture]);

        const sdkInfo = await (this.executor!).execute(findSDKsCommand, { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false).then(async (result) =>
        {
            if (result.status !== '0')
            {
                return [];
            }

            const hostSupportsArchFlag = await this.hostSupportsArchFlag(existingPath, result.stdout);
            const sdks = result.stdout.split('\n').map((line) => line.trim()).filter((line) => (line?.length ?? 0) > 0);
            const sdkInfos: IDotnetListInfo[] = sdks.map((sdk) =>
            {
                const parts = sdk.split(' ', 2);
                return {
                    mode: 'sdk',
                    version: parts[0],
                    directory: sdk.split(' ').slice(1).join(' ').slice(1, -1), // need to remove the brackets from the path [path],
                    architecture: hostSupportsArchFlag ? requestedArchitecture : null
                } as IDotnetListInfo;
            }).filter(x => x !== null) as IDotnetListInfo[];

            return sdkInfos;
        });

        return sdkInfo;
    }

    private async hostSupportsArchFlag(dotnetExecutablePath: string, listDotnetInstallsStdout: string): Promise<boolean>
    {
        // https://github.com/dotnet/runtime/pull/116078 --arch was not added until .NET 10 to allow us to skip calling dotnet --info because that is slow, as it is not native code.
        // However, --arch gets ignored if the host does not support it. The output is also identical with or without --arch.
        // After discussion with the runtime team, the best way to determine if the host supports --arch is to call it with an invalid arch to see if it fails, because that only happens when --arch is supported.

        // The --arch flag was added in the middle of .NET 10, so we can assume it is supported if the version is 10.0 or later.
        // We don't want to slow down the current common case for people without .NET 10 by adding another process spawn check.
        // We don't check that the version is 10.0 or later after 2026 when .NET 11 starts rolling out, as It will be slower to check all of the numbers in the output for versions >= 10.
        const hostMaySupportArchFlag = listDotnetInstallsStdout.includes("10.0") || listDotnetInstallsStdout.includes("11.0") || Date.now() >= new Date('2026-03-01').getTime();
        // Use runtimes instead of sdks, as sdks will always have a runtime, and runtime search can be cached across both mode calls.
        const findInvalidCommand = CommandExecutor.makeCommand(`"${dotnetExecutablePath}"`, ['--list-runtimes', '--arch', 'invalid-arch']);
        const hostSupportsArchFlag = hostMaySupportArchFlag ? (await (this.executor!).execute(findInvalidCommand, { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false)).status !== '0' : false;
        return hostSupportsArchFlag;
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

    public async getRuntimes(existingPath: string, requestedArchitecture: string | null): Promise<IDotnetListInfo[]>
    {
        if (!existingPath || existingPath === '""')
        {
            return [];
        }

        requestedArchitecture ??= DotnetCoreAcquisitionWorker.defaultArchitecture()
        const findRuntimesCommand = CommandExecutor.makeCommand(`"${existingPath}"`, ['--list-runtimes', '--arch', requestedArchitecture]);

        const windowsDesktopString = 'Microsoft.WindowsDesktop.App';
        const aspnetCoreString = 'Microsoft.AspNetCore.App';
        const runtimeString = 'Microsoft.NETCore.App';

        const runtimeInfo = await (this.executor!).execute(findRuntimesCommand, { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false).then(async (result) =>
        {
            if (result.status !== '0')
            {
                return [];
            }

            const hostSupportsArchFlag = await this.hostSupportsArchFlag(existingPath, result.stdout);
            const runtimes = result.stdout.split('\n').map((line) => line.trim()).filter((line) => (line?.length ?? 0) > 0);
            const runtimeInfos: IDotnetListInfo[] = runtimes.map((runtime) =>
            {
                const parts = runtime.split(' ', 3); // account for spaces in PATH, no space should appear before then and luckily path is last
                return {
                    mode: parts[0] === aspnetCoreString ? 'aspnetcore' : parts[0] === runtimeString ? 'runtime' : 'sdk', // sdk is a placeholder for windows desktop, will never match since this is for runtime search only
                    version: parts[1],
                    directory: runtime.split(' ').slice(2).join(' ').slice(1, -1), // account for spaces in PATH, no space should appear before then and luckily path is last.
                    // the 2nd slice needs to remove the brackets from the path [path]
                    architecture: hostSupportsArchFlag ? requestedArchitecture : null
                } as IDotnetListInfo;
            }).filter(x => x !== null) as IDotnetListInfo[];

            return runtimeInfos;
        });

        return runtimeInfo;
    }
}