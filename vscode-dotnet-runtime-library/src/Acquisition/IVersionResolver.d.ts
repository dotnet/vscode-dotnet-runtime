export interface IVersionResolver {
    getFullRuntimeVersion(version: string): Promise<string>;
    getFullSDKVersion(version: string): Promise<string>;
}
