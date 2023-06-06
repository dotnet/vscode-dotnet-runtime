import { IInstallationValidator } from './IInstallationValidator';
export declare class InstallationValidator extends IInstallationValidator {
    validateDotnetInstall(version: string, dotnetPath: string): void;
    private assertOrThrowError;
}
