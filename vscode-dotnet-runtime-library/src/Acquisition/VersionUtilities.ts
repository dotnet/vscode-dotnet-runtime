/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IEventStream } from '../EventStream/EventStream';
import { DotnetFeatureBandDoesNotExistError, DotnetInvalidRuntimePatchVersion, DotnetVersionParseEvent, DotnetVersionResolutionError, EventCancellationError } from '../EventStream/EventStreamEvents';
import { getInstallFromContext } from '../Utils/InstallIdUtilities';

const invalidFeatureBandErrorString = `A feature band couldn't be determined for the requested version: `;

/**
 *
 * @param fullySpecifiedVersion the fully specified version of the sdk, e.g. 7.0.301 to get the major from.
 * @returns the major in the form of '3', etc.
 */
export function getMajor(fullySpecifiedVersion : string, eventStream : IEventStream, context : IAcquisitionWorkerContext) : string
{
    // The called function will check that we can do the split, so we don't need to check again.
    return getMajorMinor(fullySpecifiedVersion, eventStream, context).split('.')[0];
}

/**
 *
 * @param fullySpecifiedVersion the fully specified version of the sdk, e.g. 7.0.301 to get the minor from.
 * @returns the major.minor in the form of '0', etc.
 */
export function getMinor(fullySpecifiedVersion : string, eventStream : IEventStream, context : IAcquisitionWorkerContext) : string
{
    // The called function will check that we can do the split, so we don't need to check again.
    return getMajorMinor(fullySpecifiedVersion, eventStream, context).split('.')[1];
}


/**
 *
 * @param fullySpecifiedVersion the fully specified version, e.g. 7.0.301 to get the major minor from.
 * @returns the major.minor in the form of '3.1', etc.
 */
export function getMajorMinor(fullySpecifiedVersion : string, eventStream : IEventStream, context : IAcquisitionWorkerContext) : string
{
    if(fullySpecifiedVersion.split('.').length < 2)
    {
        const event = new DotnetVersionResolutionError(new EventCancellationError('DotnetVersionResolutionError',
            `The requested version ${fullySpecifiedVersion} is invalid.`),
            getInstallFromContext(context));
        eventStream.post(event);
        throw event.error;
    }

    const majorMinor = `${fullySpecifiedVersion.split('.').at(0)}.${fullySpecifiedVersion.split('.').at(1)}`;
    return majorMinor;
}

/**
 *
 * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
 * @returns a single string representing the band number, e.g. 3 in 7.0.301.
 */
export function getFeatureBandFromVersion(fullySpecifiedVersion : string, eventStream : IEventStream, context : IAcquisitionWorkerContext) : string
{
    const band : string | undefined = fullySpecifiedVersion.split('.')?.at(2)?.charAt(0);
    if(band === undefined)
    {
        const event = new DotnetFeatureBandDoesNotExistError(new EventCancellationError('DotnetFeatureBandDoesNotExistError', `${invalidFeatureBandErrorString}${fullySpecifiedVersion}.`),
            getInstallFromContext(context));
        eventStream.post(event);
        throw event.error;
    }
    return band;
}

/**
 *
 * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
 * @returns a single string representing the band patch version, e.g. 12 in 7.0.312.
 */
export function getFeatureBandPatchVersion(fullySpecifiedVersion : string, eventStream : IEventStream, context : IAcquisitionWorkerContext) : string
{
    return Number(getSDKPatchVersionString(fullySpecifiedVersion, eventStream, context)).toString();
}

/**
 *
 * @remarks the logic for getFeatureBandPatchVersion, except that it returns '01' or '00' instead of the patch number.
 * Not meant for public use.
 */
export function getSDKPatchVersionString(fullySpecifiedVersion : string, eventStream : IEventStream, context : IAcquisitionWorkerContext) : string
{
    const patch : string | undefined = fullySpecifiedVersion.split('.')?.at(2)?.substring(1)?.split('-')?.at(0);
    if(patch === undefined || !isNumber(patch))
    {
        const event = new DotnetFeatureBandDoesNotExistError(new EventCancellationError('DotnetFeatureBandDoesNotExistError',
            `${invalidFeatureBandErrorString}${fullySpecifiedVersion}.`),
            getInstallFromContext(context));
        eventStream.post(event);
        throw event.error;
    }
    return patch
}

/**
 *
 * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
 * @returns a single string representing the band and patch version, e.g. 312 in 7.0.312.
 */
export function getSDKCompleteBandAndPatchVersionString(fullySpecifiedVersion : string, eventStream : IEventStream, context : IAcquisitionWorkerContext) : string
{
    return `${getFeatureBandFromVersion(fullySpecifiedVersion, eventStream, context)}${getSDKPatchVersionString(fullySpecifiedVersion, eventStream, context)}`;
}

/**
 * The runtime version doesn't have a feature band, unlike the SDK. We need to get the patch version from the runtime version.
 * It can contain any amount of text after the patch, such as 9.0.0-rc.2.24473.5. We don't process any of that extra text and should ignore it.
 * Needs to handle 8, 8.0, etc. This is why we don't use semver. We don't error if there isn't a patch but we should if the patch is invalid.
 * Returns null if no patch is in the string (e.g. 8.0).
 */
export function getRuntimePatchVersionString(fullySpecifiedVersion : string, eventStream : IEventStream, context : IAcquisitionWorkerContext) : string | null
{
    const patch : string | undefined = fullySpecifiedVersion.split('.')?.at(2)?.split('-')?.at(0);
    if(patch && !isNumber(patch))
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
export function isValidLongFormVersionFormat(fullySpecifiedVersion : string, eventStream : IEventStream, context : IAcquisitionWorkerContext) : boolean
{
    const numberOfPeriods = fullySpecifiedVersion.split('.').length - 1;
    // 9 is used to prevent bad versions (current expectation is 7 but we want to support .net 10 etc)
    if(numberOfPeriods === 2 && fullySpecifiedVersion.length < 11)
    {
    if(isNonSpecificFeatureBandedVersion(fullySpecifiedVersion) ||
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
 */
export function isPreviewVersion(fullySpecifiedVersion : string, eventStream : IEventStream, context : IAcquisitionWorkerContext) : boolean
{
    return fullySpecifiedVersion.includes('-');
}

/**
 *
 * @param version the requested version to analyze.
 * @returns true IFF version is a feature band with an unspecified sub-version was given e.g. 6.0.4xx or 6.0.40x
 */
export function isNonSpecificFeatureBandedVersion(version : string) : boolean
{
    const numberOfPeriods = version.split('.').length - 1;
    return version.split('.').slice(0, 2).every(x => isNumber(x)) && version.endsWith('x') && numberOfPeriods === 2;
}

/**
 *
 * @param version the requested version to analyze.
 * @returns true IFF version is a specific version e.g. 7.0.301.
 */
export function isFullySpecifiedVersion(version : string, eventStream : IEventStream, context : IAcquisitionWorkerContext) : boolean
{
    return version.split('.').every(x => isNumber(x)) && isValidLongFormVersionFormat(version, eventStream, context) && !isNonSpecificFeatureBandedVersion(version);
}

/**
 *
 * @param version the requested version to analyze.
 * @returns true IFF a major release represented as an integer was given. e.g. 6, which we convert to 6.0, OR a major minor was given, e.g. 6.1.
 */
export function isNonSpecificMajorOrMajorMinorVersion(version : string) : boolean
{
    const numberOfPeriods = version.split('.').length - 1;
    return isNumber(version) && numberOfPeriods >= 0 && numberOfPeriods < 2;
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