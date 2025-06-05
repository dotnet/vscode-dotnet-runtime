/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { CommandExecutor } from '../Utils/CommandExecutor';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetPathFinder } from './IDotnetPathFinder';

import * as lodash from 'lodash';
import * as os from 'os';
import * as path from 'path';
import
{
    DotnetFindPathHostFxrResolutionLookup,
    DotnetFindPathLookupPATH,
    DotnetFindPathLookupRealPATH,
    DotnetFindPathLookupRootPATH,
    DotnetFindPathNoHostOnFileSystem,
    DotnetFindPathNoHostOnRegistry,
    DotnetFindPathNoRuntimesOnHost,
    DotnetFindPathOnFileSystem,
    DotnetFindPathOnRegistry,
    DotnetFindPathPATHFound,
    DotnetFindPathRealPATHFound,
    DotnetFindPathRootEmulationPATHFound,
    DotnetFindPathRootPATHFound,
    DotnetFindPathRootUnderEmulationButNoneSet,
    FileDoesNotExist
} from '../EventStream/EventStreamEvents';
import { FileUtilities } from '../Utils/FileUtilities';
import { IFileUtilities } from '../Utils/IFileUtilities';
import { EnvironmentVariableIsDefined, getDotnetExecutable, getOSArch, getPathSeparator } from '../Utils/TypescriptUtilities';
import { DOTNET_INFORMATION_CACHE_DURATION_MS, SYS_CMD_SEARCH_CACHE_DURATION_MS } from './CacheTimeConstants';
import { DotnetConditionValidator } from './DotnetConditionValidator';
import { InstallRecordWithPath } from './InstallRecordWithPath';
import { InstallTrackerSingleton } from './InstallTrackerSingleton';
import { RegistryReader } from './RegistryReader';

export class DotnetPathFinder implements IDotnetPathFinder
{

    public constructor(private readonly workerContext: IAcquisitionWorkerContext, private readonly utilityContext: IUtilityContext, private executor?: ICommandExecutor, private file?: IFileUtilities)
    {
        this.executor ??= new CommandExecutor(this.workerContext, this.utilityContext);
        this.file ??= new FileUtilities();
    }

    /**
     *
     * @returns The DOTNET_ROOT environment variable, which is the root path for the dotnet installation.
     * Some applications, such as `dotnet test`, prefer DOTNET_ROOT over the PATH setting.
     * DOTNET_ROOT is also not the only setting.
     * DOTNET_ROOT(x86) - Deprecated. Only used when running 32-bit executables. VS Code 32 bit is deprecated, so don't support this.
     * DOTNET_ROOT_X86 - The non deprecated version of the above variable, still ignore.
     * DOTNET_ROOT_X64 - Used when running 64-bit executables on an ARM64 OS.
     * Node only runs on x64 and not ARM, but that doesn't mean the .NET Application won't run on ARM.
     *
     * DOTNET_HOST_PATH may be set but this is owned by the host. Don't respect any user setting here.
     *
     * The VS Code Workspace environment may also be different from the System environment.
     */
    public async findDotnetRootPath(requestedArchitecture: string): Promise<string | undefined>
    {
        this.workerContext.eventStream.post(new DotnetFindPathLookupRootPATH(`Looking up .NET on the root.`));

        if (requestedArchitecture === 'x64' && (this.executor !== undefined ? (await getOSArch(this.executor)).includes('arm') : false))
        {
            let dotnetOnRootEmulationPath = process.env.DOTNET_ROOT_X64;
            if (EnvironmentVariableIsDefined(dotnetOnRootEmulationPath))
            {
                // DOTNET_ROOT should be set to the directory containing the dotnet executable, not the executable itself.
                // https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-environment-variables
                dotnetOnRootEmulationPath = path.join(dotnetOnRootEmulationPath!, getDotnetExecutable());
                this.workerContext.eventStream.post(new DotnetFindPathRootEmulationPATHFound(`Under emulation and emulation root is set to ${dotnetOnRootEmulationPath}.`));
                return dotnetOnRootEmulationPath;
            }
            else
            {
                this.workerContext.eventStream.post(new DotnetFindPathRootUnderEmulationButNoneSet(`Under emulation but DOTNET_ROOT_X64 is not set.`));
            }
        }

        let dotnetOnRootPath = process.env.DOTNET_ROOT;
        if (EnvironmentVariableIsDefined(dotnetOnRootPath))
        {
            // DOTNET_ROOT should be set to the directory containing the dotnet executable, not the executable itself.
            dotnetOnRootPath = path.join(dotnetOnRootPath!, getDotnetExecutable());
            this.workerContext.eventStream.post(new DotnetFindPathRootPATHFound(`Found .NET on the root: ${dotnetOnRootPath}`));
            return dotnetOnRootPath;
        }
        return undefined;
    }

    public async findExtensionManagedRuntimes(): Promise<InstallRecordWithPath[]>
    {
        const installedVersions = await InstallTrackerSingleton.getInstance(this.workerContext.eventStream, this.workerContext.extensionState).getExistingInstalls(this.workerContext.installDirectoryProvider);
        const installedVersionRuntimeHostPaths = installedVersions.map(install => ({ installRecord: install, path: path.join(this.workerContext.installDirectoryProvider.getInstallDir(install.dotnetInstall.installId), getDotnetExecutable()) }));
        return installedVersionRuntimeHostPaths ?? [];
    }

    /**
     * @remarks This only checks dotnet --list-runtimes or --list-sdks, so it can be more performant for the base case.
     * This allows skipping which, where, and also does not rely on --info which is slower because it shells to the SDK instead of just being the host.
     * @returns The path to the dotnet executable, which may be a symlink to the actual executable.
     */
    public async findDotnetFastFromListOnly(requestedArchitecture: string | null): Promise<string[] | undefined>
    {
        const oldLookup = process.env.DOTNET_MULTILEVEL_LOOKUP;
        try
        {
            process.env.DOTNET_MULTILEVEL_LOOKUP = '0'; // make it so --list-runtimes only finds the runtimes on that path: https://learn.microsoft.com/en-us/dotnet/core/compatibility/deployment/7.0/multilevel-lookup#reason-for-change
            const finalPath = await this.getTruePath(['dotnet'], requestedArchitecture);
            return this.returnWithRestoringEnvironment(finalPath, 'DOTNET_MULTILEVEL_LOOKUP', oldLookup);
        }
        finally
        {
            process.env.DOTNET_MULTILEVEL_LOOKUP = oldLookup; // Ensure the environment variable is always restored
        }
    }

    /**
     *
     * @returns A set of the path environment variable(s) for which or where dotnet, which may need to be converted to the actual path if it points to a polymorphic executable.
     * For example, `snap` installs dotnet to snap/bin/dotnet, which you can call --list-runtimes on.
     * The 'realpath' of that is 'usr/bin/snap', which you cannot invoke --list-runtimes on, because it is snap.
     * In this case, we need to use this polymorphic path to find the actual path later.
     *
     * In an install such as homebrew, the PATH is not indicative of all of the PATHs. So dotnet may be missing in the PATH even though it is found in an alternative shell.
     * The PATH can be discovered using path_helper on mac.
     */
    public async findRawPathEnvironmentSetting(tryUseTrueShell = true, requestedArchitecture: string | null): Promise<string[] | undefined>
    {
        const oldLookup = process.env.DOTNET_MULTILEVEL_LOOKUP;
        process.env.DOTNET_MULTILEVEL_LOOKUP = '0'; // make it so --list-runtimes only finds the runtimes on that path: https://learn.microsoft.com/en-us/dotnet/core/compatibility/deployment/7.0/multilevel-lookup#reason-for-change

        const searchEnvironment = process.env; // this is the default, but sometimes it does not get picked up
        const options = tryUseTrueShell && os.platform() !== 'win32' ?
            {
                // Use /bin/bash as the default shell, but if it's not available try to use /bin/sh
                // Users may see different behavior due to this if they have a custom shell such as zsh but those shells may have unexpected behaviors.
                env: searchEnvironment, shell: process.env.SHELL === '/bin/bash' ? '/bin/bash' : '/bin/sh', dotnetInstallToolCacheTtlMs: SYS_CMD_SEARCH_CACHE_DURATION_MS
            }
            :
            {
                env: searchEnvironment, dotnetInstallToolCacheTtlMs: SYS_CMD_SEARCH_CACHE_DURATION_MS
            };

        // Log the PATH for diagnostic debugging via logs.
        this.workerContext.eventStream.post(new DotnetFindPathLookupPATH(`Looking up .NET on the path. Process.env.path: ${process.env.PATH}`));
        if (os.platform() === 'win32')
        {
            this.executor?.execute(CommandExecutor.makeCommand('echo', ['%PATH%']), { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false)
                .then((result) =>
                {
                    this.workerContext.eventStream.post(new DotnetFindPathLookupPATH(`Execution Path (Win): ${result?.stdout}`));
                })
                .catch(() => {});
        }

        else
        {
            this.executor?.execute(CommandExecutor.makeCommand('echo', ['$PATH']), { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false)

                .then((result) =>
                {
                    // Log the default shell state
                    this.workerContext.eventStream.post(new DotnetFindPathLookupPATH(`Execution Path (Unix-Default-Shell): ${result?.stdout}`));
                })
                .catch(() => {});

            if (!(options.shell === '/bin/bash'))
            {
                this.executor?.execute(CommandExecutor.makeCommand('echo', ['$PATH']), { shell: 'bin/bash', dotnetInstallToolCacheTtlMs: SYS_CMD_SEARCH_CACHE_DURATION_MS }, false)

                    .then((result) =>
                    {
                        this.workerContext.eventStream.post(new DotnetFindPathLookupPATH(`Execution Path (Unix Bash): ${result?.stdout}`));
                    })
                    .catch(() => {});
            }
        }

        let pathLocatorCommand = '';
        if (os.platform() === 'win32')
        {
            pathLocatorCommand = (await this.executor?.tryFindWorkingCommand([
                // We have to give the command an argument to return status 0, and the only thing its guaranteed to find is itself :)
                CommandExecutor.makeCommand('where', ['where']),
                CommandExecutor.makeCommand('where.exe', ['where.exe']),
                CommandExecutor.makeCommand('%SystemRoot%\\System32\\where.exe', ['%SystemRoot%\\System32\\where.exe']), // if PATH is corrupted
                CommandExecutor.makeCommand('C:\\Windows\\System32\\where.exe', ['C:\\Windows\\System32\\where.exe']) // in case SystemRoot is corrupted, best effort guess
            ], options))?.commandRoot ?? 'where';
        }
        else
        {
            pathLocatorCommand = (await this.executor?.tryFindWorkingCommand([
                CommandExecutor.makeCommand('which', ['which']),
                CommandExecutor.makeCommand('/usr/bin/which', ['/usr/bin/which']), // if PATH is corrupted
            ], options))?.commandRoot ?? 'which';
        }

        options.dotnetInstallToolCacheTtlMs = DOTNET_INFORMATION_CACHE_DURATION_MS;
        const findCommand = CommandExecutor.makeCommand(pathLocatorCommand, ['dotnet']);
        const dotnetsOnPATH = (await this.executor?.execute(findCommand, options, false))?.stdout.split('\n').map(x => x.trim()).filter(x => x !== '');
        if (dotnetsOnPATH && (dotnetsOnPATH?.length ?? 0) > 0)
        {
            this.workerContext.eventStream.post(new DotnetFindPathPATHFound(`Found.NET on the path: ${JSON.stringify(dotnetsOnPATH)}`));
            return this.returnWithRestoringEnvironment(await this.getTruePath(dotnetsOnPATH, requestedArchitecture), 'DOTNET_MULTILEVEL_LOOKUP', oldLookup);

        }
        else
        {
            const pathsOnPATH = process.env.PATH?.split(getPathSeparator());
            const validPathsOnPATH = [];
            if (pathsOnPATH && (pathsOnPATH?.length ?? 0) > 0)
            {
                const dotnetExecutable = getDotnetExecutable();
                for (const pathOnPATH of pathsOnPATH)
                {
                    const resolvedDotnetPath = path.join(pathOnPATH, dotnetExecutable);
                    if (await this.file!.exists(resolvedDotnetPath))
                    {
                        this.workerContext.eventStream.post(new DotnetFindPathLookupPATH(`Looking up.NET on the path by processing PATH string.resolved: ${resolvedDotnetPath}.`));
                        validPathsOnPATH.push(resolvedDotnetPath);
                    }
                }
            }

            if ((validPathsOnPATH?.length ?? 0) > 0)
            {
                return this.returnWithRestoringEnvironment(validPathsOnPATH, 'DOTNET_MULTILEVEL_LOOKUP', oldLookup);
            }
        }

        return this.returnWithRestoringEnvironment(undefined, 'DOTNET_MULTILEVEL_LOOKUP', oldLookup);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async returnWithRestoringEnvironment(returnValue: string[] | undefined, envVarToRestore: string, envResToRestore: string | undefined): Promise<string[] | undefined>
    {
        if (EnvironmentVariableIsDefined(envVarToRestore))
        {
            process.env[envVarToRestore] = envResToRestore;
        }
        else
        {
            delete process.env[envVarToRestore];
        }
        return returnValue;
    }

    /**
     * @returns The 'realpath' or resolved path for dotnet from which or where dotnet.
     * Some installers, such as the Ubuntu install with the PMC Feed, the PATH is set to /usr/bin/dotnet which is a symlink to /usr/share/dotnet.
     * If we want to return the actual path, we need to use realpath.
     *
     * We can't use realpath on all paths, because some paths are polymorphic executables and the realpath is invalid.
     */
    public async findRealPathEnvironmentSetting(tryUseTrueShell = true, requestedArchitecture: string | null): Promise<string[] | undefined>
    {
        this.workerContext.eventStream.post(new DotnetFindPathLookupRealPATH(`Looking up.NET on the real path.`));
        const dotnetsOnPATH = await this.findRawPathEnvironmentSetting(tryUseTrueShell, requestedArchitecture);
        const realPaths = [];

        for (const dotnetOnPATH of dotnetsOnPATH ?? [])
        {
            const resolvedPath = await this.file?.realpath(dotnetOnPATH);
            if (resolvedPath)
            {
                realPaths.push(resolvedPath);
            }
        }

        this.workerContext.eventStream.post(new DotnetFindPathRealPATHFound(`Found.NET on the path: ${JSON.stringify(dotnetsOnPATH)}, realpath: ${realPaths}`));
        if ((realPaths?.length ?? 0) > 0)
        {
            return undefined;
        }
        return this.getTruePath(realPaths, requestedArchitecture);
    }

    public async findHostInstallPaths(requestedArchitecture: string): Promise<string[] | undefined>
    {
        this.workerContext.eventStream.post(new DotnetFindPathHostFxrResolutionLookup(`Looking up .NET without checking the PATH.`));


        const oldLookup = process.env.DOTNET_MULTILEVEL_LOOKUP;
        process.env.DOTNET_MULTILEVEL_LOOKUP = '0';

        if (os.platform() === 'win32')
        {
            const registryReader = new RegistryReader(this.workerContext, this.utilityContext, this.executor);
            const hostPathWin = await registryReader.getHostLocation(requestedArchitecture);
            const realHostPathWin = hostPathWin ? await this.file?.realpath(hostPathWin) : null;
            const paths = [];
            if (hostPathWin)
            {
                paths.push(path.join(hostPathWin, getDotnetExecutable()));
            }
            if (realHostPathWin)
            {
                paths.push(path.join(realHostPathWin, getDotnetExecutable()));
            }
            if (paths.length > 0)
            {
                this.workerContext.eventStream.post(new DotnetFindPathOnRegistry(`The host could be found in the registry.${JSON.stringify(paths)}`));
            }
            else
            {
                this.workerContext.eventStream.post(new DotnetFindPathNoHostOnRegistry(`The host could not be found in the registry`));
            }
            return this.returnWithRestoringEnvironment(await this.getTruePath(lodash.uniq(paths), requestedArchitecture), 'DOTNET_MULTILEVEL_LOOKUP', oldLookup);
        }
        else
        {
            // Possible values for arch are: x86, x64, arm32, arm64
            // x86 and arm32 are not a concern since 32 bit vscode is out of support and not needed by other extensions

            // https://github.com/dotnet/designs/blob/main/accepted/2021/install-location-per-architecture.md#new-format

            const paths: string[] = [];
            const netSixAndAboveHostInstallSaveLocation = `/etc/dotnet/install_location_${requestedArchitecture}`;
            const netFiveAndNetSixAboveFallBackInstallSaveLocation = `/etc/dotnet/install_location`;

            paths.push(...(await this.getPathsFromEtc(netSixAndAboveHostInstallSaveLocation)));
            paths.push(...(await this.getPathsFromEtc(netFiveAndNetSixAboveFallBackInstallSaveLocation)));

            if (paths.length > 0)
            {
                this.workerContext.eventStream.post(new DotnetFindPathOnFileSystem(`The host could be found in the file system.${JSON.stringify(paths)}`));
            }
            else
            {
                this.workerContext.eventStream.post(new DotnetFindPathNoHostOnFileSystem(`The host could not be found in the file system.`));
            }

            return this.returnWithRestoringEnvironment(await this.getTruePath(lodash.uniq(paths), requestedArchitecture), 'DOTNET_MULTILEVEL_LOOKUP', oldLookup);
        }
    }

    private async getPathsFromEtc(etcLoc: string): Promise<Array<string>>
    {
        const paths: string[] = [];
        if (await this.file!.exists(etcLoc))
        {
            try
            {
                const installPath = (await this.file!.read(etcLoc)).trim();
                paths.push(path.join(installPath, getDotnetExecutable()));
                const realPath = await this.file?.realpath(installPath);
                if (realPath)
                {
                    paths.push(path.join(realPath, getDotnetExecutable()));
                }
            }
            catch (error: any) // eslint-disable-line @typescript-eslint/no-explicit-any
            {
                // readfile throws if the file gets deleted in between the existing check and now
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                this.workerContext.eventStream.post(new FileDoesNotExist(`The host was deleted after checking in the file system.${error?.message} ${etcLoc}`));
            }
        }
        else
        {
            this.workerContext.eventStream.post(new FileDoesNotExist(`The host save location never existed at ${etcLoc}`));
        }

        return paths;
    }

    /**
     *
     * @param tentativePaths Paths that may hold a dotnet executable.
     * @returns The actual physical location/path on disk where the executables lie for each of the paths.
     * Some of the symlinks etc resolve to a path which works but is still not the actual path.
     */
    public async getTruePath(tentativePaths: string[], requestedArchitecture: string | null): Promise<string[]>
    {
        const truePaths = [];

        for (const tentativePath of tentativePaths)
        {
            // This will even work if only the sdk is installed, list-runtimes on an sdk installed host would work
            const runtimeInfo = await new DotnetConditionValidator(this.workerContext, this.utilityContext, this.executor).getRuntimes(tentativePath, requestedArchitecture);
            if ((runtimeInfo?.length ?? 0) > 0)
            {
                // q.t. from @dibarbet on the C# Extension:
                // The .NET install layout is a well known structure on all platforms.
                // See https://github.com/dotnet/designs/blob/main/accepted/2020/install-locations.md#net-core-install-layout
                //
                // Therefore we know that the runtime path is always in <install root>/shared/<runtime name>
                // and the dotnet executable is always at <install root>/dotnet(.exe).
                //
                // Since dotnet --list-runtimes will always use the real assembly path to output the runtime folder (no symlinks!)
                // we know the dotnet executable will be two folders up in the install root.
                truePaths.push(path.join(path.dirname(path.dirname(runtimeInfo[0].directory)), getDotnetExecutable()));
            }
            else
            {
                this.workerContext.eventStream.post(new DotnetFindPathNoRuntimesOnHost(`The host: ${tentativePath} does not contain a .NET runtime installation.`));

            }
        }

        return (truePaths?.length ?? 0) > 0 ? truePaths : tentativePaths;
    }
}
