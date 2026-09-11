/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
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
// Historical evidence for each accepted suffix family is documented in Documentation/version-suffixes.md.
const historicalDotnetPreReleaseSuffixPattern = /^(?:preview|rc)(?:(?:\.\d+)+|\d+(?:\.\d+)*(?:-(?:\d+(?:-\d+)*|final))?|-\d+(?:-\d+)*)?$/i;

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
        // A bare major version (e.g. '8') has a single segment; assume a '.0' minor per this function's contract.
        if (fullySpecifiedVersion.split('.').length === 1 && isNumber(fullySpecifiedVersion))
        {
            return `${fullySpecifiedVersion}.0`;
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
    if (patch === '' || !isNumber(patch))
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


/**
 *
 * FullySpecifiedVersion is expected to be a fully specified version, but may be a preview version.
 */
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
    if (patch && !isNumber(patch))
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
 * @param version the version string to analyze.
 * @returns true IFF the version has a non-empty pre-release suffix. This function does not validate the version.
 */
export function hasPreReleaseSuffix(version: string): boolean
{
    return getPreReleaseSuffix(version).length > 0;
}

/**
 *
 * @param version the requested version to analyze.
 * @returns true IFF version is a feature band with an unspecified sub-version was given e.g. 6.0.4xx or 6.0.40x
 */
export function isNonSpecificFeatureBandedVersion(version: string): boolean
{
    const numberOfPeriods = version.split('.').length - 1;
    return version.split('.').slice(0, 2).every(x => isNumber(x)) && version.endsWith('x') && numberOfPeriods === 2;
}

/**
 *
 * @param version a version string that may carry a pre-release suffix, e.g. 11.0.100-preview.6.26352.110.
 * @returns the portion of the version before any pre-release suffix, e.g. 11.0.100. Returns the input unchanged
 * when no pre-release suffix is present.
 */
export function getVersionWithoutPreReleaseSuffix(version: string): string
{
    const dashIndex = getPreReleaseSuffixStartIndex(version);
    return dashIndex === -1 ? version : version.substring(0, dashIndex);
}

/**
 *
 * @param version a version string that may carry a pre-release suffix, e.g. 11.0.100-preview.6.26352.110.
 * @returns the pre-release suffix (the portion after the first '-'), e.g. preview.6.26352.110, or '' when the
 * version has no pre-release suffix. Two versions represent the exact same release iff their numeric parts and
 * this suffix both match.
 */
export function getPreReleaseSuffix(version: string): string
{
    const dashIndex = getPreReleaseSuffixStartIndex(version);
    return dashIndex === -1 ? '' : version.substring(dashIndex + 1);
}

function getPreReleaseSuffixStartIndex(version: string): number
{
    return version.indexOf('-');
}

/**
 *
 * @param version the requested version to analyze.
 * @returns true IFF version is a fully specified SDK version that also carries a pre-release suffix, e.g.
 * 11.0.100-preview.6.26352.110 or 8.0.100-rc.2.24473.5. The portion before the '-' must itself be a fully
 * specified version (e.g. 11.0.100) and the suffix must match a historically published .NET format.
 */
export function isFullySpecifiedPreviewVersion(version: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): boolean
{
    return isHistoricalDotnetPreReleaseSuffix(getPreReleaseSuffix(version)) &&
        isFullySpecifiedVersion(getVersionWithoutPreReleaseSuffix(version), eventStream, context);
}

function isHistoricalDotnetPreReleaseSuffix(suffix: string): boolean
{
    return historicalDotnetPreReleaseSuffixPattern.test(suffix);
}

/**
 *
 * @param version the requested version to analyze.
 * @returns true IFF version is a specific version e.g. 7.0.301, including fully specified pre-release builds such
 * as 11.0.100-preview.6.26352.110.
 */
export function isFullySpecifiedVersion(version: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): boolean
{
    // A fully specified pre-release build (e.g. 11.0.100-preview.6.26352.110) is also fully specified; validate its
    // numeric base (11.0.100) and short-circuit before the strictly-numeric checks below, which reject the suffix.
    if (isFullySpecifiedPreviewVersion(version, eventStream, context))
    {
        return true;
    }
    return version.split('.').every(x => isNumber(x)) && isValidLongFormVersionFormat(version, eventStream, context) && !isNonSpecificFeatureBandedVersion(version);
}

export function isFullySpecifiedRuntimeVersion(version: string): boolean
{
    const numericVersion = getVersionWithoutPreReleaseSuffix(version);
    const numericParts = numericVersion.split('.');
    if (numericParts.length !== 3 || !numericParts.every(x => isNumber(x)))
    {
        return false;
    }

    const suffix = getPreReleaseSuffix(version);
    return suffix === '' || isHistoricalDotnetPreReleaseSuffix(suffix);
}

/**
 *
 * @remarks Compares two fully specified SDK versions that share the same major.minor and feature band, ordering them
 * by feature-band patch and then by any pre-release suffix. Returns a negative number if versionA is older than
 * versionB, 0 if they are equivalent, and a positive number if versionA is newer. Pre-release builds (e.g.
 * -preview.6) sort older than the corresponding stable release and older than higher-numbered pre-releases, matching
 * semver ordering. This lets callers distinguish e.g. 11.0.100-preview.5 from 11.0.100-preview.6, which have the same
 * numeric feature-band patch.
 * @remarks These comparison functions do not validate supported .NET suffixes. Do not use their result to infer
 * support for arbitrary SemVer suffixes such as -ci; validate versions with isFullySpecifiedVersion first.
 */
export function compareSDKPatchOrPreRelease(versionA: string, versionB: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): number
{
    const patchA = Number(getFeatureBandPatchVersion(versionA, eventStream, context));
    const patchB = Number(getFeatureBandPatchVersion(versionB, eventStream, context));
    if (patchA !== patchB)
    {
        return patchA - patchB;
    }

    // Feature-band patches are equal; disambiguate using any pre-release suffix. A stable release outranks a
    // pre-release, and higher-numbered pre-releases outrank lower ones (semver ordering).
    const semverA = semver.parse(versionA) ?? semver.coerce(versionA);
    const semverB = semver.parse(versionB) ?? semver.coerce(versionB);
    if (semverA && semverB)
    {
        return semver.compare(semverA, semverB);
    }

    // If semver cannot parse either version (e.g. an unusual internal build string), treat them as equivalent so
    // callers fall back to their prior "already installed" behavior rather than performing an unnecessary reinstall.
    return 0;
}

/**
 *
 * @remarks Compares two versions that share the same major.minor, ordering by their remaining components (a runtime
 * patch like 8.0.19 or an SDK feature-band patch like 8.0.301) and then by any pre-release suffix, using semver
 * semantics (a stable release outranks its pre-release; higher-numbered pre-releases outrank lower ones). Unlike
 * compareSDKPatchOrPreRelease this works for BOTH runtime and SDK versions because both are valid semver. Returns a
 * negative number if versionA is older than versionB, 0 if equivalent, and a positive number if versionA is newer.
 * Falls back to 0 when neither version can be parsed by semver. This does not make arbitrary SemVer suffixes (for
 * example, -ci) supported .NET versions; validate versions with isFullySpecifiedVersion before comparing them.
 */
export function compareVersionsIncludingPreRelease(versionA: string, versionB: string): number
{
    const semverA = semver.parse(versionA) ?? semver.coerce(versionA);
    const semverB = semver.parse(versionB) ?? semver.coerce(versionB);
    if (semverA && semverB)
    {
        return semver.compare(semverA, semverB);
    }
    return 0;
}

/**
 *
 * @param version the requested version to analyze.
 * @returns true IFF a major release represented as an integer was given. e.g. 6, which we convert to 6.0, OR a major minor was given, e.g. 6.1.
 */
export function isNonSpecificMajorOrMajorMinorVersion(version: string): boolean
{
    const numberOfPeriods = version.split('.').length - 1;
    return isNumber(version) && numberOfPeriods >= 0 && numberOfPeriods < 2;
}

/**
 *
 * @param version the requested version, which may be only a major (e.g. '8') or major.minor (e.g. '8.0').
 * @returns the version normalized to the major.minor.1xx feature band (e.g. '8.0.1xx') when only a major or
 * major.minor was given; otherwise the version is returned unchanged.
 * @remarks Most Linux distro package managers only expose the .1xx (100) feature band, so a non-specific
 * major / major.minor request must be normalized to that band before it is handed to the package manager.
 */
export function convertToLinuxPackageManagerSupportedVersion(version: string, eventStream: IEventStream, context: IAcquisitionWorkerContext): string
{
    if (isNonSpecificMajorOrMajorMinorVersion(version))
    {
        return `${getMajorMinor(version, eventStream, context)}.1xx`;
    }
    return version;
}

/**
 *
 * @param value the string to check and see if it's a valid number.
 * @returns true if it's a valid number.
 */
function isNumber(value: string | number): boolean
{
    return (
        (value != null) &&
        (value !== '') &&
        !isNaN(Number(value.toString()))
    );
}