export declare abstract class IInstallationDirectoryProvider {
    protected storagePath: string;
    constructor(storagePath: string);
    abstract getInstallDir(version: string): string;
    getStoragePath(): string;
}
