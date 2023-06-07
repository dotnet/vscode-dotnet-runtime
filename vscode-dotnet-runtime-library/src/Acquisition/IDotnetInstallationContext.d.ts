export interface IDotnetInstallationContext {
    installDir: string;
    version: string;
    dotnetPath: string;
    timeoutValue: number;
    installRuntime: boolean;
}
