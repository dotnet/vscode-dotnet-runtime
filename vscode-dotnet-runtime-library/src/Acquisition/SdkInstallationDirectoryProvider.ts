/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IInstallationDirectoryProvider } from './IInstallationDirectoryProvider';

export class SdkInstallationDirectoryProvider extends IInstallationDirectoryProvider {
    public getInstallDir(installId: string): string {
        return this.getStoragePath();
    }
}
