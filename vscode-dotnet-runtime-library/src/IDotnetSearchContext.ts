/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetInstallMode } from './Acquisition/DotnetInstallMode';
import { AcquireErrorConfiguration } from './Utils/ErrorHandler';

export interface IDotnetSearchContext
{
    /**
     * @remarks
     * An API request data structure used for us to find installs that the specified host (dotnet.exe) can use.
     *
     * @property dotnetExecutablePath : A path to the dotnet executable, otherwise known as the dotnet host.
     * A full path is preferred, as 'dotnet' will fail if 'which' or 'where' is corrupted.
     * This property is optional. If it is not used, the value of the PATH will be used. This is not recommended.
     * Instead, you should call 'dotnet.findPath' to find the host path that you'd like to use which contains the installs you want.
     * Or, you should only call this API when you already know the host path you want to use.
     *
     * @property requestingExtensionId - The Extension that relies on our extension to acquire the runtime or .NET SDK. It MUST be provided.
     *
     * @property errorConfiguration - An set of options for the desired treat as error and error verbosity behaviors of the extension.
     *
     * @property architecture - Optional: The architecture of the host path given: (accepts 'x64', 'x86', 'arm64') - Will default to the executable architecture if detectable, else the `os.arch()`
     *
     * @property mode - Whether the install should be of the sdk, runtime, or aspnetcore (runtime).
     * The 'runtime' modes will return both runtimes.
     */
    dotnetExecutablePath?: string;
    requestingExtensionId?: string;
    errorConfiguration?: AcquireErrorConfiguration;
    architecture?: string;
    mode: DotnetInstallMode;
}