/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export abstract class ICommandExecutor
{
    public abstract execute(command : string, options? : any | null) : Promise<string[]>;
};
