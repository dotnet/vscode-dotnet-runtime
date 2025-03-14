/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export class SudoSpawnCheckSingleton
{
    protected static instance: SudoSpawnCheckSingleton;

    protected constructor(protected hasEverLaunchedSudoFork = false)
    {

    }

    public static getInstance(): SudoSpawnCheckSingleton
    {
        if (!SudoSpawnCheckSingleton.instance)
        {
            SudoSpawnCheckSingleton.instance = new SudoSpawnCheckSingleton();
        }

        return SudoSpawnCheckSingleton.instance;
    }

    public hasThisVsCodeInstanceLaunchedSudoFork(): boolean
    {
        return this.hasEverLaunchedSudoFork;
    }

    public notifyOfSudoFork(): void
    {
        this.hasEverLaunchedSudoFork = true;
    }
}
