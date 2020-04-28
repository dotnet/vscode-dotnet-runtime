/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export enum AcquireErrorConfiguration {
    DisplayAllErrorPopups = 0,
    DisableErrorPopups = 1,
}

export enum UninstallErrorConfiguration {
    DisplayAllErrorPopups = 0,
    DisableErrorPopups = 1,
}

export enum EnsureDependenciesErrorConfiguration {
    DisplayAllErrorPopups = 0,
    DisableErrorPopups = 1,
}

export type ErrorConfiguration = AcquireErrorConfiguration | UninstallErrorConfiguration | EnsureDependenciesErrorConfiguration;

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
