/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

// Extension Configuration
export const commandPrefix = 'dotnet'; // Prefix for commands

export namespace commandKeys {
    export const acquire = 'acquire';
    export const uninstallAll = 'uninstallAll';
    export const showAcquisitionLog = 'showAcquisitionLog';
    export const ensureDotnetDependencies = 'ensureDotnetDependencies';
    export const reportIssue = 'reportIssue';
}

export const configPrefix = 'dotnetAcquisitionExtension'; // Prefix for user settings

export namespace configKeys {
    export const installTimeoutValue = 'installTimeoutValue';
    export const enableTelemetry = 'enableTelemetry';
}

// String Constants
export namespace errorConstants {
    export const errorMessage = 'An error occurred while installing .NET';
    export const reportOption = 'Report an issue';
    export const hideOption = 'Don\'t show again';
}

export namespace timeoutConstants {
    export const timeoutMessage = '.NET installation timed out.';
    export const moreInfoOption = 'More information';
    export const timeoutInfoUrl = 'https://github.com/dotnet/vscode-dotnet-runtime/blob/master/Documentation/troubleshooting.md#install-script-timeouts';
}
