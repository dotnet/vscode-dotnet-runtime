/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IEventStream } from '../EventStream/EventStream';
import
{
    DotnetFeatureBandDoesNotExistError,
    DotnetInvalidRuntimePatchVersion,
    DotnetVersionParseEvent,
    DotnetVersionResolutionError,
    EventCancellationError,
    FeatureBandDoesNotExist
} from '../EventStream/EventStreamEvents';
import { getInstallFromContext } from '../Utils/InstallIdUtilities';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { BAD_VERSION } from './StringConstants';

const invalidFeatureBandErrorString = `A feature band couldn't be determined for the requested version: `;

/**
 * Parsed SDK version components.
 * SDK versions follow the format: major.minor.patchFull[-prerelease]
 * where patchFull = (featureBand * 100) + patch
 * e.g., 8.0.308 -> major=8, minor=0, featureBand=3, patch=8
 */
export interface ParsedSdkVersion
{
    major: number;
    minor: number;
    featureBand: number;
    patch: number;
    patchFull: number;
    isPrerelease: boolean;
    originalVersion: string;
}

/**
 * The rollForward policy from global.json that determines SDK version selection behavior.
 * Reference: https://learn.microsoft.com/en-us/dotnet/core/tools/global-json
 */
export type RollForwardPolicy = 'disable' | 'patch' | 'latestPatch' | 'feature' | 'latestFeature' | 'minor' | 'latestMinor' | 'major' | 'latestMajor';

/**
 * Parse SDK version string into its component parts.
 * Handles versions like "8.0.308", "9.0.100-preview.1", etc.
 * Uses the pure utility functions for consistency with other version parsing in this file.
 *
 * @param version The SDK version string
 * @returns Parsed version components
 */
export function parseSdkVersion(version: string): ParsedSdkVersion
{
    const baseVersion = version.split('-')[0];
    const majorMinor = getMajorMinorFromValidVersion(baseVersion);
    const majorMinorParts = majorMinor === BAD_VERSION ? ['0', '0'] : majorMinor.split('.');

    const major = parseInt(majorMinorParts[0], 10) || 0;
    const minor = parseInt(majorMinorParts[1], 10) || 0;
    const patchFull = getFullPatchFromVersionSimple(version) ?? 0;
    const featureBand = getFeatureBandFromVersionSimple(version) ?? 0;
    const patch = getPatchFromVersionSimple(version) ?? 0;
    const isPrerelease = isPreviewVersionSimple(version);

    return { major, minor, featureBand, patch, patchFull, isPrerelease, originalVersion: version };
}

/**
 * Check if an installed SDK version is compatible with a required version based on the rollForward policy.
 * This implements the global.json rollForward behavior as documented at:
 * https://learn.microsoft.com/en-us/dotnet/core/tools/global-json
 *
 * @param installedVersion The installed SDK version string
 * @param requiredVersion The required SDK version string (from global.json)
 * @param rollForward The rollForward policy (defaults to 'latestPatch' if not specified)
 * @returns true if the installed SDK satisfies the requirement
 */
export function isCompatibleSdkVersion(installedVersion: string, requiredVersion: string, rollForward: RollForwardPolicy = 'latestPatch'): boolean
{
    const inst = parseSdkVersion(installedVersion);
    const req = parseSdkVersion(requiredVersion);

    // Prerelease of same base version is considered less than release
    const instBase = installedVersion.split('-')[0];
    const reqBase = requiredVersion.split('-')[0];
    if (instBase === reqBase && inst.isPrerelease && !req.isPrerelease)
    {
        return false;
    }

    switch (rollForward)
    {
        case 'disable':
            // Exact match required
            return installedVersion === requiredVersion;

        case 'patch':
        case 'latestPatch':
            // Same major.minor.featureBand, patch >= required patch
            return inst.major === req.major &&
                   inst.minor === req.minor &&
                   inst.featureBand === req.featureBand &&
                   inst.patch >= req.patch;

        case 'feature':
        case 'latestFeature':
            // Same major.minor, featureBand >= required (can roll forward to higher feature band)
            return inst.major === req.major &&
                   inst.minor === req.minor &&
                   (inst.featureBand > req.featureBand ||
                    (inst.featureBand === req.featureBand && inst.patch >= req.patch));

        case 'minor':
        case 'latestMinor':
            // Same major, minor.featureBand.patch >= required
            return inst.major === req.major &&
                   (inst.minor > req.minor ||
                    (inst.minor === req.minor &&
                     (inst.featureBand > req.featureBand ||
                      (inst.featureBand === req.featureBand && inst.patch >= req.patch))));

        case 'major':
        case 'latestMajor':
            // Any version >= required
            return inst.major > req.major ||
                   (inst.major === req.major &&
                    (inst.minor > req.minor ||
                     (inst.minor === req.minor &&
                      (inst.featureBand > req.featureBand ||
                       (inst.featureBand === req.featureBand && inst.patch >= req.patch)))));

        default:
            // Unknown policy, fall back to latestPatch behavior
            return inst.major === req.major &&
                   inst.minor === req.minor &&
                   inst.featureBand === req.featureBand &&
                   inst.patch >= req.patch;
    }
}

/**
 * Filter a list of SDK versions to only those compatible with the required version and rollForward policy.
 *
 * @param installedVersions List of installed SDK version strings
 * @param requiredVersion The required SDK version
 * @param rollForward The rollForward policy
 * @returns List of compatible SDK versions
 */
export function getCompatibleSdkVersions(installedVersions: string[], requiredVersion: string, rollForward: RollForwardPolicy = 'latestPatch'): string[]
{
    if (!installedVersions || !requiredVersion)
    {
        return [];
    }
    return installedVersions.filter(v => isCompatibleSdkVersion(v, requiredVersion, rollForward));
}

/**
 * Compare two SDK versions to determine which is newer.
 *
 * @param versionA First version to compare
 * @param versionB Second version to compare
 * @returns negative if A < B, 0 if A == B, positive if A > B
 */
export function compareSdkVersions(versionA: string, versionB: string): number
{
    const a = parseSdkVersion(versionA);
    const b = parseSdkVersion(versionB);

    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    if (a.patchFull !== b.patchFull) return a.patchFull - b.patchFull;

    // Handle prerelease: release > prerelease of same version
    if (a.isPrerelease !== b.isPrerelease)
    {
        return a.isPrerelease ? -1 : 1;
    }

    return 0;
}

/**
 * Check if versionA is newer than versionB.
 *
 * @param versionA Version to check
 * @param versionB Version to compare against
 * @returns true if versionA is newer than versionB
 */
export function isNewerSdkVersion(versionA: string, versionB: string): boolean
{
    return compareSdkVersions(versionA, versionB) > 0;
}

/**
 *
 * @param fullySpecifiedVersion the fully specified version of the sdk, e.g. 7.0.301 to get the major from.
 * @returns the major in the form of '3', etc.
 */
export function getMajor(fullySpecifiedVersion: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): string
{
    // The called function will check that we can do the split, so we don't need to check again.
    return getMajorMinor(fullySpecifiedVersion, eventStream, context).split('.')[0];
}

/**
 *
 * @param fullySpecifiedVersion the fully specified version of the sdk, e.g. 7.0.301 to get the minor from.
 * @returns the major.minor in the form of '0', etc.
 */
export function getMinor(fullySpecifiedVersion: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): string
{
    // The called function will check that we can do the split, so we don't need to check again.
    return getMajorMinor(fullySpecifiedVersion, eventStream, context).split('.')[1];
}

// Returns constants.BAD_VERSION if the version is invalid.
export function getMajorMinorFromValidVersion(fullySpecifiedVersion: string)
{
    if (fullySpecifiedVersion.split('.').length < 2)
    {
        return BAD_VERSION;
    }

    const majorMinor = `${fullySpecifiedVersion.split('.').at(0)}.${fullySpecifiedVersion.split('.').at(1)}`;
    return majorMinor;
}

/**
 *
 * @param fullySpecifiedVersion the fully specified version, e.g. 7.0.301 to get the major minor from. Also accepts '8' and will assume a .0 minor.
 * @returns the major.minor in the form of '3.1', etc.
 */
export function getMajorMinor(fullySpecifiedVersion: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): string
{
    if (fullySpecifiedVersion.split('.').length < 2)
    {
        if (fullySpecifiedVersion.split('.').length === 0 && isValidNumber(fullySpecifiedVersion))
        {
            return `${fullySpecifiedVersion}.0`;
        }
        else if (fullySpecifiedVersion.split('.').length === 1 && isValidNumber(fullySpecifiedVersion.split('.')[0]))
        {
            return fullySpecifiedVersion;
        }

        const event = new DotnetVersionResolutionError(new EventCancellationError('DotnetVersionResolutionError',
            `The requested version ${fullySpecifiedVersion} is invalid.`),
            getInstallFromContext(context));
        eventStream.post(event);
        throw event.error;
    }

    return getMajorMinorFromValidVersion(fullySpecifiedVersion);
}

/**
 *
 * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
 * @returns a single string representing the band number, e.g. 3 in 7.0.301.
 * @remarks can return '' if no band exists in the fully specified version, and if considerErrorIfNoBand is false.
 */
export function getFeatureBandFromVersion(fullySpecifiedVersion: string, eventStream: IEventStream, context: IAcquisitionWorkerContext, considerErrorIfNoBand = true): string
{
    const band: string | undefined = fullySpecifiedVersion.split('.')?.[2]?.charAt(0);
    if (band === undefined)
    {
        if (considerErrorIfNoBand)
        {
            const event = new DotnetFeatureBandDoesNotExistError(new EventCancellationError('DotnetFeatureBandDoesNotExistError', `${invalidFeatureBandErrorString}${fullySpecifiedVersion}.`),
                getInstallFromContext(context));
            eventStream.post(event);
            throw event.error;
        }

        const nonErrEvent = new FeatureBandDoesNotExist(`${invalidFeatureBandErrorString}${fullySpecifiedVersion}.`);
        eventStream.post(nonErrEvent);
        return '';
    }
    return band;
}

/**
 *
 * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
 * @returns a single string representing the band patch version, e.g. 12 in 7.0.312.
 * @remarks can return '' if no band exists in the fully specified version, and if considerErrorIfNoBand is false.
 */
export function getFeatureBandPatchVersion(fullySpecifiedVersion: string, eventStream: IEventStream, context: IAcquisitionWorkerContext, considerErrorIfNoBand = true): string
{
    return Number(getSDKPatchVersionString(fullySpecifiedVersion, eventStream, context, considerErrorIfNoBand)).toString();
}

/**
 *
 * @remarks the logic for getFeatureBandPatchVersion, except that it returns '01' or '00' instead of the patch number.
 * Can return '' if no band exists in the fully specified version, and if considerErrorIfNoBand is false.
 * Not meant for public use.
 */
export function getSDKPatchVersionString(fullySpecifiedVersion: string, eventStream: IEventStream, context: IAcquisitionWorkerContext, considerErrorIfNoBand = true): string
{
    const patch = getSDKFeatureBandOrPatchFromFullySpecifiedVersion(fullySpecifiedVersion);
    if (patch === '' || !isValidNumber(patch))
    {
        if (considerErrorIfNoBand)
        {
            const event = new DotnetFeatureBandDoesNotExistError(new EventCancellationError('DotnetFeatureBandDoesNotExistError',
                `${invalidFeatureBandErrorString}${fullySpecifiedVersion}.`),
                getInstallFromContext(context));
            eventStream.post(event);
            throw event.error;
        }

        const nonErrEvent = new FeatureBandDoesNotExist(`${invalidFeatureBandErrorString}${fullySpecifiedVersion}.`);
        eventStream.post(nonErrEvent);
        return '';
    }
    return patch
}


export function getSDKFeatureBandOrPatchFromFullySpecifiedVersion(fullySpecifiedVersion: string): string
{
    const patch: string | undefined = fullySpecifiedVersion.split('.')?.[2]?.substring(1)?.split('-')?.[0];
    return patch ?? '';
}

/**
 *
 * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
 * @returns a single string representing the band and patch version, e.g. 312 in 7.0.312.
 * Returns null if the string is not fully specified.
 */
export function getSDKCompleteBandAndPatchVersionString(fullySpecifiedVersion: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): string | null
{
    try
    {
        const band = getFeatureBandFromVersion(fullySpecifiedVersion, eventStream, context, false);
        const patch = getSDKPatchVersionString(fullySpecifiedVersion, eventStream, context, false);
        return `${band}${patch}`;
    }
    catch (error: any)
    {
        // Catch failure for when version does not include a band, etc
    }
    return null;
}

/**
 * The runtime version doesn't have a feature band, unlike the SDK. We need to get the patch version from the runtime version.
 * It can contain any amount of text after the patch, such as 9.0.0-rc.2.24473.5. We don't process any of that extra text and should ignore it.
 * Needs to handle 8, 8.0, etc. This is why we don't use semver. We don't error if there isn't a patch but we should if the patch is invalid.
 * Returns null if no patch is in the string (e.g. 8.0).
 */
export function getRuntimePatchVersionString(fullySpecifiedVersion: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): string | null
{
    const patch: string | undefined = fullySpecifiedVersion.split('.')?.[2]?.split('-')?.[0];
    if (patch && !isValidNumber(patch))
    {
        const event = new DotnetInvalidRuntimePatchVersion(new EventCancellationError('DotnetInvalidRuntimePatchVersion',
            `The runtime patch version ${patch} from ${fullySpecifiedVersion} is NaN.`),
            getInstallFromContext(context));
        eventStream.post(event);
        throw event.error;
    }
    return patch ? patch : null;
}

/**
 *
 * @param fullySpecifiedVersion the requested version to analyze.
 * @returns true IFF version is of an expected length and format.
 */
export function isValidLongFormVersionFormat(fullySpecifiedVersion: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): boolean
{
    const numberOfPeriods = fullySpecifiedVersion.split('.').length - 1;
    // 9 is used to prevent bad versions (current expectation is 7 but we want to support .net 10 etc)
    if (numberOfPeriods === 2 && fullySpecifiedVersion.length < 11)
    {
        if (isNonSpecificFeatureBandedVersion(fullySpecifiedVersion) ||
            (
                getSDKPatchVersionString(fullySpecifiedVersion, eventStream, context).length <= 2 &&
                getSDKPatchVersionString(fullySpecifiedVersion, eventStream, context).length > 1
            )
        )
        {
            return true;
        }

        eventStream.post(new DotnetVersionParseEvent(`The version has a bad patch number: ${fullySpecifiedVersion}`));
    }

    eventStream.post(new DotnetVersionParseEvent(`The version has more or less than two periods, or it is too long: ${fullySpecifiedVersion}`));
    return false;
}

/**
 *
 * @param fullySpecifiedVersion the requested version to analyze.
 * @returns true IFF version is of an rc, preview, internal build, etc.
 * @remarks This is the eventStream-compatible version. For pure function usage, see isPreviewVersionSimple.
 */
export function isPreviewVersion(fullySpecifiedVersion: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): boolean
{
    return isPreviewVersionSimple(fullySpecifiedVersion);
}

/**
 *
 * @param version the requested version to analyze.
 * @returns true IFF version is a feature band with an unspecified sub-version was given e.g. 6.0.4xx or 6.0.40x
 */
export function isNonSpecificFeatureBandedVersion(version: string): boolean
{
    const numberOfPeriods = version.split('.').length - 1;
    return version.split('.').slice(0, 2).every(x => isValidNumber(x)) && version.endsWith('x') && numberOfPeriods === 2;
}

/**
 *
 * @param version the requested version to analyze.
 * @returns true IFF version is a specific version e.g. 7.0.301.
 */
export function isFullySpecifiedVersion(version: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): boolean
{
    return version.split('.').every(x => isValidNumber(x)) && isValidLongFormVersionFormat(version, eventStream, context) && !isNonSpecificFeatureBandedVersion(version);
}

/**
 *
 * @param version the requested version to analyze.
 * @returns true IFF a major release represented as an integer was given. e.g. 6, which we convert to 6.0, OR a major minor was given, e.g. 6.1.
 */
export function isNonSpecificMajorOrMajorMinorVersion(version: string): boolean
{
    const numberOfPeriods = version.split('.').length - 1;
    return isValidNumber(version) && numberOfPeriods >= 0 && numberOfPeriods < 2;
}

/**
 * Check if a string represents a valid number.
 * @param value the string to check and see if it's a valid number.
 * @returns true if it's a valid number.
 */
export function isValidNumber(value: string | number): boolean
{
    return (
        (value != null) &&
        (value !== '') &&
        !isNaN(Number(value.toString()))
    );
}

// #region Internal helper functions

/**
 * Simple check for prerelease versions. Returns true if version contains '-'.
 * @see isPreviewVersion for the version used in acquisition workflows that requires eventStream
 */
function isPreviewVersionSimple(version: string): boolean
{
    return version.includes('-');
}

/**
 * Gets the full patch field from an SDK version string (e.g., 308 from "8.0.308").
 * @returns The full patch number, or undefined if it cannot be extracted
 */
function getFullPatchFromVersionSimple(version: string): number | undefined
{
    // Remove prerelease suffix if present
    const dashIndex = version.indexOf('-');
    const versionWithoutPrerelease = dashIndex >= 0 ? version.substring(0, dashIndex) : version;

    const parts = versionWithoutPrerelease.split('.');
    if (parts.length < 3 || !isValidNumber(parts[2]))
    {
        return undefined;
    }

    return parseInt(parts[2], 10);
}

/**
 * Gets the feature band from an SDK version string (e.g., 3 from "8.0.308").
 * @returns The feature band number, or undefined if it cannot be extracted
 */
function getFeatureBandFromVersionSimple(version: string): number | undefined
{
    const patchFull = getFullPatchFromVersionSimple(version);
    if (patchFull === undefined)
    {
        return undefined;
    }
    return Math.floor(patchFull / 100);
}

/**
 * Gets the patch within the feature band from an SDK version string (e.g., 8 from "8.0.308").
 * @returns The patch number, or undefined if it cannot be extracted
 */
function getPatchFromVersionSimple(version: string): number | undefined
{
    const patchFull = getFullPatchFromVersionSimple(version);
    if (patchFull === undefined)
    {
        return undefined;
    }
    return patchFull % 100;
}

// #endregion