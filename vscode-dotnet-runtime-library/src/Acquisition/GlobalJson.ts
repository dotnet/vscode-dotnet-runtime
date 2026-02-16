/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { RollForwardPolicy } from './VersionUtilities';

/**
 * Represents the structure of a global.json file.
 * Only includes officially supported properties per:
 * https://learn.microsoft.com/dotnet/core/tools/global-json
 */
export interface GlobalJson
{
    sdk?: GlobalJsonSdk;
    'msbuild-sdks'?: Record<string, string>;
}

/**
 * The SDK section of a global.json file.
 */
export interface GlobalJsonSdk
{
    /**
     * The SDK version to use.
     * Can be a specific version (e.g., "8.0.308") or a feature band pattern (e.g., "8.0.3xx").
     */
    version?: string;

    /**
     * Whether to allow prerelease SDK versions.
     * Defaults to false when version is specified, true otherwise.
     */
    allowPrerelease?: boolean;

    /**
     * The roll-forward policy for SDK version selection.
     * Defaults to 'latestPatch' when version is specified, 'latestMajor' otherwise.
     */
    rollForward?: RollForwardPolicy;

    /**
     * Additional paths to search for SDKs (.NET 10+).
     */
    paths?: string[];

    /**
     * Custom error message when SDK requirements cannot be satisfied (.NET 10+).
     */
    errorMessage?: string;
}

/**
 * Requirements extracted from a global.json file, with the file path included.
 */
export interface GlobalJsonRequirements
{
    /** Path to the global.json file */
    filePath: string;
    /** SDK version required */
    sdkVersion?: string;
    /** Whether prerelease SDKs are allowed */
    allowPrerelease?: boolean;
    /** Roll-forward policy */
    rollForward?: RollForwardPolicy;
}

/**
 * Parses a global.json content string and returns its contents.
 * @param content The JSON content of the global.json file.
 * @returns Parsed global.json contents, or undefined if the content is invalid.
 */
export function parseGlobalJsonContent(content: string): GlobalJson | undefined
{
    try
    {
        return JSON.parse(content) as GlobalJson;
    }
    catch
    {
        return undefined;
    }
}

/**
 * Extracts SDK requirements from a parsed global.json object.
 * @param globalJson The parsed global.json object.
 * @param filePath The path to the global.json file (for reference in the result).
 * @returns Extracted requirements.
 */
export function getRequirementsFromGlobalJson(globalJson: GlobalJson, filePath: string): GlobalJsonRequirements
{
    return {
        filePath,
        sdkVersion: globalJson.sdk?.version,
        allowPrerelease: globalJson.sdk?.allowPrerelease,
        rollForward: globalJson.sdk?.rollForward,
    };
}

/**
 * Parses global.json content and extracts SDK requirements in one step.
 * @param content The JSON content of the global.json file.
 * @param filePath The path to the global.json file (for reference in the result).
 * @returns Extracted requirements, or undefined if the content is invalid.
 */
export function parseGlobalJsonRequirements(content: string, filePath: string): GlobalJsonRequirements | undefined
{
    const globalJson = parseGlobalJsonContent(content);
    if (!globalJson)
    {
        return undefined;
    }
    return getRequirementsFromGlobalJson(globalJson, filePath);
}

/**
 * Gets the effective roll-forward policy from global.json requirements.
 * If not specified, returns the default policy based on whether a version is specified.
 * @param requirements The global.json requirements.
 * @returns The effective roll-forward policy.
 */
export function getEffectiveRollForward(requirements: GlobalJsonRequirements): RollForwardPolicy
{
    if (requirements.rollForward)
    {
        return requirements.rollForward;
    }
    // Default is 'latestPatch' when version is specified, 'latestMajor' otherwise
    return requirements.sdkVersion ? 'latestPatch' : 'latestMajor';
}

/**
 * Gets the effective allowPrerelease setting from global.json requirements.
 * If not specified, returns the default based on whether a version is specified.
 * @param requirements The global.json requirements.
 * @returns The effective allowPrerelease setting.
 */
export function getEffectiveAllowPrerelease(requirements: GlobalJsonRequirements): boolean
{
    if (requirements.allowPrerelease !== undefined)
    {
        return requirements.allowPrerelease;
    }
    // Default is false when version is specified, true otherwise
    return !requirements.sdkVersion;
}
