/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { IEventStream } from '../EventStream/EventStream';
import { IUtilityContext } from './IUtilityContext';

export abstract class IFileUtilities
{
    public abstract writeFileOntoDisk(scriptContent: string, filePath: string, eventStream?: IEventStream): Promise<void>;

    /**
     * @param directoryToWipe the directory to delete all of the files in if privilege to do so exists.
     */
    public abstract wipeDirectory(directoryToWipe: string, eventStream?: IEventStream, fileExtensionsToDelete?: string[], verifyDotnetNotInUse?: boolean): Promise<void>;

    /**
     *
     * @returns true if the process is running with admin privileges on windows.
     */
    public abstract isElevated(context: IAcquisitionWorkerContext, utilContext: IUtilityContext): Promise<boolean>;

    public abstract getFileHash(filePath: string): Promise<string | null>;

    public abstract exists(filePath: string): Promise<boolean>;

    public abstract read(filePath: string): Promise<string>;

    // return the realpath if possible and valid, else null
    public abstract realpath(filePath: string): Promise<string | null>;

};
