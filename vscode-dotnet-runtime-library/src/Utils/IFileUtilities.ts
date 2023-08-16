/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
/* tslint:disable:no-any */

export abstract class IFileUtilities
{
    public abstract writeFileOntoDisk(scriptContent: string, filePath: string) : void;

    /**
     * @param directoryToWipe the directory to delete all of the files in if privellege to do so exists.
     */
    public abstract wipeDirectory(directoryToWipe : string) : void;

    /**
     *
     * @returns true if the process is running with admin privelleges on windows.
     */
    public abstract isElevated() : boolean;

    public abstract getFileHash(filePath : string) : Promise<string | null>;
};
