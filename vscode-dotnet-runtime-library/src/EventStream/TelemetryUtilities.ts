 /*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { TextEncoder } from 'util';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { IEventStream } from './EventStream';
import { DotnetTelemetrySettingEvent } from './EventStreamEvents';
import { IUtilityContext } from '../Utils/IUtilityContext';

export class TelemetryUtilities
{
    public static HashData(dataToHash: string | null) : string
    {
        if(!dataToHash)
        {
            return '';
        }

        const hasher = crypto.createHash('sha256');
        const utf8Bytes = new TextEncoder().encode(dataToHash.toUpperCase());
        const hashedData = hasher.update(utf8Bytes).digest('hex').toLowerCase();
        return hashedData;
    }

    /**
     *
     * @param stringWithPaths The string that may contain paths to hash.
     * @returns The same string but with all paths in it hashed.
     * @remarks Will not hash a filename as it is a leaf file system object. It needs to be a path with at least one directory.
     * That's what we'd like to hash. (E.g. dotnet-install.ps1 is not needed to hash.)
     */
    public static HashAllPaths(stringWithPaths : string) : string
    {
        let hashedPathsString = ``;
        stringWithPaths.split(' ').forEach(word =>
        {
            const convertedLine = word !== path.basename(word) && fs.existsSync(word) && (fs.lstatSync(word).isFile() || fs.lstatSync(word).isDirectory())
                ? TelemetryUtilities.HashData(word) : word;
            hashedPathsString = `${hashedPathsString} ${convertedLine}`;
            return hashedPathsString;
        });
        return hashedPathsString;
    }

    static async setDotnetSDKTelemetryToMatch(isExtensionTelemetryEnabled : boolean, extensionContext : IVSCodeExtensionContext, eventStream : IEventStream, utilityContext : IUtilityContext)
    {
        if(!TelemetryUtilities.isTelemetryEnabled(isExtensionTelemetryEnabled, utilityContext))
        {
            TelemetryUtilities.logTelemetryChange(`Before disabling .NET SDK telemetry:`, isExtensionTelemetryEnabled, eventStream, utilityContext);

            await new CommandExecutor(eventStream, utilityContext).setEnvironmentVariable(
                'DOTNET_CLI_TELEMETRY_OPTOUT',
                'true',
                extensionContext,

`Telemetry is disabled for the .NET Install Tool, but we were unable to turn off the .NET SDK telemetry.
Please verify that .NET SDK telemetry is disabled as well by setting the environment variable DOTNET_CLI_TELEMETRY_OPTOUT to true.`,

`The .NET Install Tool will not collect telemetry. However, the .NET SDK does collect telemetry.
To disable .NET SDK telemetry, please set the environment variable DOTNET_CLI_TELEMETRY_OPTOUT to true.`);

            TelemetryUtilities.logTelemetryChange(`After disabling .NET SDK telemetry:`, isExtensionTelemetryEnabled, eventStream, utilityContext);
        }
        else
        {
            TelemetryUtilities.logTelemetryChange(`Unchanged Telemetry Settings.`, isExtensionTelemetryEnabled, eventStream, utilityContext);
        }
    }

    static isDotnetSDKTelemetryDisabled()
    {
        const optOut = process.env.DOTNET_CLI_TELEMETRY_OPTOUT;
        return optOut && optOut !== 'false' && optOut !== '0';
    }

    static isTelemetryEnabled(isExtensionTelemetryEnabled : boolean, utilityContext : IUtilityContext)
    {
        const isVSCodeTelemetryEnabled = utilityContext.vsCodeEnv.isTelemetryEnabled();
        return isVSCodeTelemetryEnabled && isExtensionTelemetryEnabled;
    }

    static logTelemetryChange(changeMessage : string, isExtensionTelemetryEnabled : boolean, eventStream : IEventStream, utilityContext : IUtilityContext) : void
    {
        eventStream.post(new DotnetTelemetrySettingEvent(`Telemetry Setting Change: ${changeMessage}
.NET SDK Setting: ${!TelemetryUtilities.isDotnetSDKTelemetryDisabled()},
Extension Setting: ${isExtensionTelemetryEnabled}
VS Code Setting: ${utilityContext.vsCodeEnv.isTelemetryEnabled()}.`))
    }
}