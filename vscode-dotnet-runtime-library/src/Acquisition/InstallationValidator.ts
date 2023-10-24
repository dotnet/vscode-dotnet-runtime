/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import {
    DotnetInstallationValidated,
    DotnetInstallationValidationError,
} from '../EventStream/EventStreamEvents';
import { IInstallationValidator } from './IInstallationValidator';

export class InstallationValidator extends IInstallationValidator {
    public validateDotnetInstall(installKey: string, dotnetPath: string, isDotnetFolder = false): void {
        const dotnetValidationFailed = `Validation of .dotnet installation for version ${installKey} failed:`;
        const folder = path.dirname(dotnetPath);

        if(!isDotnetFolder)
        {
            this.assertOrThrowError(fs.existsSync(folder),
            `${dotnetValidationFailed} Expected installation folder ${folder} does not exist.`, installKey, dotnetPath);

            this.assertOrThrowError(fs.existsSync(dotnetPath),
                `${dotnetValidationFailed} Expected executable does not exist at "${dotnetPath}"`, installKey, dotnetPath);

            this.assertOrThrowError(fs.lstatSync(dotnetPath).isFile(),
                `${dotnetValidationFailed} Expected executable file exists but is not a file: "${dotnetPath}"`, installKey, dotnetPath);
        }
        else
        {
            this.assertOrThrowError(fs.existsSync(folder),
            `${dotnetValidationFailed} Expected dotnet folder ${dotnetPath} does not exist.`, installKey, dotnetPath);

            this.assertOrThrowError(fs.readdirSync(folder).length !== 0,
            `${dotnetValidationFailed} The dotnet folder is empty "${dotnetPath}"`, installKey, dotnetPath);
        }

        this.eventStream.post(new DotnetInstallationValidated(installKey));
    }

    private assertOrThrowError(check: boolean, message: string, installKey: string, dotnetPath: string) {
        if (!check) {
            this.eventStream.post(new DotnetInstallationValidationError(new Error(message), installKey, dotnetPath));
            throw new Error(message);
        }
    }
}
