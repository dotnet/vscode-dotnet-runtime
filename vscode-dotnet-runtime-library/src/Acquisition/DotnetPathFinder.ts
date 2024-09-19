/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { find } from 'tslint/lib/utils';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetPathFinder } from './IDotnetPathFinder';

import * as os from 'os';
import { realpathSync } from 'fs';

export class DotnetPathFinder implements IDotnetPathFinder
{
    private finderCommand = os.platform() === 'win32' ? 'where' : 'which';

    public constructor(private readonly workerContext : IAcquisitionWorkerContext, private readonly utilityContext : IUtilityContext, private executor? : ICommandExecutor)
    {
        this.executor ??= new CommandExecutor(this.workerContext, this.utilityContext);
    }

    /**
     *
     * @returns The DOTNET_ROOT environment variable, which is the root path for the dotnet installation.
     * Some applications, such as `dotnet test`, prefer DOTNET_ROOT over the PATH setting.
     * DOTNET_ROOT is also not the only setting.
     * DOTNET_ROOT(x86) - Deprecated. Only used when running 32-bit executables. VS Code 32 bit is deprecated, so dont support this.
     * DOTNET_ROOT_X86 - The non deprecated version of the above variable, still ignore.
     * DOTNET_ROOT_X64 - Used when running 64-bit executables on an ARM64 OS.
     * Node only runs on x64 and not ARM, but that doesn't mean the .NET Application won't run on ARM.
     *
     * DOTNET_HOST_PATH may be set but this is owned by the host. Don't respect any user setting here.
     *
     * The VS Code Workspace environment may also be different from the System environment.
     */
    public async findDotnetRootPath() : Promise<string | undefined>
    {
        const path = process.env.DOTNET_ROOT;
        this.executor?.execute(CommandExecutor.makeCommand(`uname`, [`-p`]); // make get true arc function in utilities helper
        if(os.arch() == 'x64' && trueArchitecture().includes('arm'))
        {
            const emulationPath = process.env.DOTNET_ROOT_X64;
            if(emulationPath !== null && emulationPath !== undefined && emulationPath !== 'undefined')
            {
                return emulationPath;
            }
        }

        if(path !== null && path !== undefined && path !== 'undefined')
        {
            return path;
        }
        return undefined;
    }

    /**
     *
     * @returns The path environment variable for which or where dotnet, which may need to be converted to the actual path if it points to a polymorphic executable.
     * For example, `snap` installs dotnet to snap/bin/dotnet, which you can call --list-runtimes on.
     * The 'realpath' of that is 'usr/bin/snap', which you cannot invoke --list-runtimes on, because it is snap.
     * In this case, we need to use this polymorphic path to find the actual path later.
     *
     * In an install such as homebrew, the PATH is not indicative of all of the PATHs. So dotnet may be missing in the PATH even though it is found in an alternative shell.
     * The PATH can be discovered using path_helper on mac.
     */
    public async findRawPathEnvironmentSetting() : Promise<string | undefined>
    {
        const findCommand = CommandExecutor.makeCommand(this.finderCommand, ['dotnet']);
        const path = (await this.executor?.execute(findCommand))?.stdout.trim();
        if(path)
        {
            return path;
        }
        return undefined;
    }

    /**
     * @returns The 'realpath' or resolved path for dotnet from which or where dotnet.
     * Some installers, such as the Ubuntu install with the PMC Feed, the PATH is set to /usr/bin/dotnet which is a symlink to /usr/share/dotnet.
     * If we want to return the actual path, we need to use realpath.
     *
     * We can't use realpath on all paths, because some paths are polymorphic executables and the realpath is invalid.
     */
    public async findRealPathEnvironmentSetting() : Promise<string | undefined>
    {
        const path = await this.findRawPathEnvironmentSetting();
        if(path)
        {
            return realpathSync(path);
        }
        return undefined;
    }

}
