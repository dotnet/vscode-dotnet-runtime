/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IDotnetInstallationContext } from './IDotnetInstallationContext';

export abstract class IDistroDotnetSDKProvider {

    constructor() {
    }

    public abstract installDotnet(installContext: IDotnetInstallationContext): Promise<void>;

    public abstract getInstalledDotnetPathIfExists() : Promise<string | null>;

    public abstract getExpectedDotnetInstallationDirectory() : Promise<string>;

    public abstract dotnetPackageExistsOnSystem() : Promise<boolean>;

    public abstract isDotnetVersionSupported() : Promise<boolean>;

    public abstract upgradeDotnet(versionToUpgrade : string): Promise<boolean>;

    public abstract uninstallDotnet(versionToUninstall : string): Promise<boolean>;
}
