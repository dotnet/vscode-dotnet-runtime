export declare class FileUtilities {
    constructor();
    static writeFileOntoDisk(scriptContent: string, filePath: string): void;
    /**
     * @param directoryToWipe the directory to delete all of the files in if privellege to do so exists.
     */
    static wipeDirectory(directoryToWipe: string): void;
    /**
     *
     * @returns true if the process is running with admin privelleges on windows.
     */
    static isElevated(): boolean;
}
