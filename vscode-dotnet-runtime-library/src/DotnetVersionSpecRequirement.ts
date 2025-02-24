/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
/**
 * @remarks A condition to be met when searching for .NET. This refers to the major.minor of .NET versions.
 * When this condition is used, the available version is compared to the required version.
 * For example, if the request is made looking for 8.0 and allowing 'greater_than_or_equal', then 10.0 would be accepted,
 * because 10.0 >= 8.0.
 *
 * In addition, certain values from globalJson's rollForward property are allowed.

latestPatch - Uses the latest installed patch level that matches the requested major, minor, and feature band with a patch level that's greater than or equal to the specified value.
If not found, fails. (in other words, 200 is not ok if we want 102.)

latestFeature	Uses the highest installed feature band and patch level that matches the requested major and minor with a feature band and patch level that's greater than or equal to the specified value.
If not found, fails. (in other words, 200 is ok if we want 102, but 101 is not)

latestMajor	This is the same as greater_than_or_equal.

disable - this is the same as equal.
 */
export type DotnetVersionSpecRequirement = 'equal' | 'greater_than_or_equal' | 'less_than_or_equal' |
    'latestPatch' | 'latestFeature' | 'latestMajor' | 'disable'; // latestMinor not implemented since minor has not been used since 3.1

