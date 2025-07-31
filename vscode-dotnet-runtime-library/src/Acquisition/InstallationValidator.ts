/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import
{
    DotnetInstallationValidated,
    DotnetInstallationValidationError,
    DotnetInstallationValidationMissed,
    EventBasedError
} from '../EventStream/EventStreamEvents';
import { DotnetInstall } from './DotnetInstall';
import { IInstallationValidator } from './IInstallationValidator';

/**
 * Context object containing information needed for validation operations.
 */
interface ValidationContext
{
    install: DotnetInstall;
    dotnetPath: string;
    baseErrorMessage: string;
}

/**
 * Validates .NET installations by checking for the existence and validity of .NET executables or directories.
 * Provides options to either throw errors or return false on validation failure.
 */
export class InstallationValidator extends IInstallationValidator
{
    /**
     * Validates a .NET installation by checking either an executable file or installation directory.
     *
     * @param install - The DotnetInstall object containing installation details
     * @param dotnetPath - Path to the .NET executable or installation directory to validate
     * @param validateDirectory - If true, validates the path as a directory; if false, validates as an executable file
     * @param failOnErr - If true, throws an error on validation failure; if false, returns false and posts a validation missed event
     * @returns true if validation passes, false if validation fails. Throws if failOnErr is true and validation fails.
     * @remarks Validation is not completely exhaustive. Runtime files besides the executable may be missing.
     * @throws EventBasedError if validation fails and failOnErr is true
     */
    public validateDotnetInstall(install: DotnetInstall, dotnetPath: string, validateDirectory = false, failOnErr = true): boolean
    {
        const validationContext = {
            install,
            dotnetPath,
            baseErrorMessage: `Validation of .dotnet installation for version ${JSON.stringify(install)} failed:`
        };

        const isValid = validateDirectory
            ? this.validateDotnetDirectory(validationContext, failOnErr)
            : this.validateDotnetExecutable(validationContext, failOnErr);

        if (isValid)
        {
            this.eventStream.post(new DotnetInstallationValidated(install));
        }

        return isValid;
    }

    /**
     * Validates a .NET executable file by checking:
     * 1. Parent directory exists
     * 2. Executable file exists
     * 3. Path points to a file (not a directory)
     *
     * @param context - Validation context containing install details and paths
     * @param failOnErr - Whether to throw on validation failure or return false
     * @returns true if all validations pass, false otherwise
     */
    private validateDotnetExecutable(context: ValidationContext, failOnErr: boolean): boolean
    {
        const { dotnetPath, baseErrorMessage } = context;
        const parentDirectory = path.dirname(dotnetPath);

        // Check if parent directory exists
        if (!this.validateCondition(
            fs.existsSync(parentDirectory),
            `${baseErrorMessage} Expected installation folder ${parentDirectory} does not exist.`,
            context,
            failOnErr
        ))
        {
            return false;
        }

        // Check if executable exists
        if (!this.validateCondition(
            fs.existsSync(dotnetPath),
            `${baseErrorMessage} Expected executable does not exist at "${dotnetPath}"`,
            context,
            failOnErr
        ))
        {
            return false;
        }

        // Check if path points to a file (not a directory)
        try
        {
            if (!this.validateCondition(
                fs.lstatSync(dotnetPath).isFile(),
                `${baseErrorMessage} Expected executable file exists but is not a file: "${dotnetPath}"`,
                context,
                failOnErr
            ))
            {
                return false;
            }
        } catch (error)
        {
            return this.handleValidationError(
                `${baseErrorMessage} Unable to verify that "${dotnetPath}" is a file: ${error}`,
                context,
                failOnErr
            );
        }

        return true;
    }

    private validateDotnetDirectory(context: ValidationContext, failOnErr: boolean): boolean
    {
        const { dotnetPath, baseErrorMessage } = context;

        // Check if directory exists
        if (!this.validateCondition(
            fs.existsSync(dotnetPath),
            `${baseErrorMessage} Expected dotnet folder ${dotnetPath} does not exist.`,
            context,
            failOnErr
        ))
        {
            return false;
        }

        // Check if directory is not empty
        try
        {
            const directoryContents = fs.readdirSync(dotnetPath);
            if (!this.validateCondition(
                directoryContents.length > 0,
                `${baseErrorMessage} The dotnet folder is empty "${dotnetPath}"`,
                context,
                failOnErr
            ))
            {
                return false;
            }
        }
        catch (error)
        {
            return this.handleValidationError(
                `${baseErrorMessage} Unable to read dotnet directory "${dotnetPath}": ${error}`,
                context,
                failOnErr
            );
        }

        return true;
    }

    private validateCondition(
        condition: boolean,
        errorMessage: string,
        context: ValidationContext,
        failOnErr: boolean
    ): boolean
    {
        if (!condition)
        {
            return this.handleValidationError(errorMessage, context, failOnErr);
        }
        return true;
    }

    private handleValidationError(
        message: string,
        context: ValidationContext,
        failOnErr: boolean
    ): boolean
    {
        const { install, dotnetPath } = context;

        if (failOnErr)
        {
            this.eventStream.post(new DotnetInstallationValidationError(new Error(message), install, dotnetPath));
            throw new EventBasedError('DotnetInstallationValidationError', this.enhanceErrorMessageForMacOS(message));
        }
        else
        {
            this.eventStream?.post(new DotnetInstallationValidationMissed(new Error(message), message));
        }

        return false;
    }

    private enhanceErrorMessageForMacOS(message: string): string
    {
        if (os.platform() === 'darwin')
        {
            return `Did you close the .NET Installer, cancel the installation, or refuse the password prompt? If you want to install the .NET SDK, please try again. If you are facing an error, please report it at https://github.com/dotnet/vscode-dotnet-runtime/issues.
${message}`;
        }
        return message;
    }
}
