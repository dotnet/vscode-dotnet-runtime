/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import {
    DotnetInstallationValidated,
    DotnetInstallationValidationError,
    EventBasedError,
    DotnetInstallationValidationMissed
} from '../EventStream/EventStreamEvents';
import { IInstallationValidator } from './IInstallationValidator';
import { DotnetInstall } from './DotnetInstall';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { IDotnetAcquireContext } from '..';

export class InstallationValidator extends IInstallationValidator {
    public validateDotnetInstall(install: DotnetInstall, dotnetPath: string, isDotnetFolder = false, failOnErr = true, sdkInstallationToRetry = undefined, vscodeAccessor = undefined): void {
        const dotnetValidationFailed = `Validation of .dotnet installation for version ${JSON.stringify(install)} failed:`;
        const folder = path.dirname(dotnetPath);

        if(!isDotnetFolder)
        {
            try
            {
                this.assertOrThrowError(failOnErr, fs.existsSync(folder),
                `${dotnetValidationFailed} Expected installation folder ${folder} does not exist.`, install, dotnetPath);

                this.assertOrThrowError(failOnErr, fs.existsSync(dotnetPath),
                    `${dotnetValidationFailed} Expected executable does not exist at "${dotnetPath}"`, install, dotnetPath);

                this.assertOrThrowError(failOnErr, fs.lstatSync(dotnetPath).isFile(),
                    `${dotnetValidationFailed} Expected executable file exists but is not a file: "${dotnetPath}"`, install, dotnetPath);
            }
            catch(error : any)
            {
                if(sdkInstallationToRetry && vscodeAccessor)
                {
                    const yes = validationPromptConstants.allowOption;
                    const no = validationPromptConstants.cancelOption;
                    const message = validationPromptConstants.noSignatureMessage;

                    const pick = await this.utilityContext.ui.getModalWarningResponse(message, no, yes);
                    const userConsentsToContinue = pick === yes;
                    if(userConsentsToContinue)
                    {
                        (vscodeAccessor as IVSCodeExtensionContext).executeCommand('dotnet.acquireGlobalSDK', (sdkInstallationToRetry as IDotnetAcquireContext));
                    }
                    return;
                }
                else
                {
                    throw error;
                }
            }
        }
        else
        {
            try
            {
                this.assertOrThrowError(failOnErr, fs.existsSync(folder),
                `${dotnetValidationFailed} Expected dotnet folder ${dotnetPath} does not exist.`, install, dotnetPath);

                this.assertOrThrowError(failOnErr, fs.readdirSync(folder).length !== 0,
                `${dotnetValidationFailed} The dotnet folder is empty "${dotnetPath}"`, install, dotnetPath);
            }
            catch(error : any)
            {

            }
        }

        this.eventStream.post(new DotnetInstallationValidated(install));
    }

    private assertOrThrowError(failOnErr : boolean, passedValidation: boolean, message: string, install: DotnetInstall, dotnetPath: string) {
        if (!passedValidation && failOnErr)
        {
            this.eventStream.post(new DotnetInstallationValidationError(new Error(message), install, dotnetPath));
            throw new EventBasedError('DotnetInstallationValidationError', message);
        }
        else if(!passedValidation)
        {
            this.eventStream?.post(new DotnetInstallationValidationMissed(new Error(message), message))
        }
    }
}
