/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as crypto from 'crypto';

export class LockUsedByThisInstanceSingleton
{
    protected static instance: LockUsedByThisInstanceSingleton;

    private everSpawnedSudoSuccessfully = false;
    private currentAliveStatus = false;
    private sudoError: any = null;

    public static readonly SUDO_SESSION_ID = crypto.randomUUID().substring(0, 8);

    protected constructor(protected lockStringAndThisVsCodeInstanceOwnsIt: { [lockString: string]: boolean } = {})
    {

    }

    public static getInstance(): LockUsedByThisInstanceSingleton
    {
        if (!LockUsedByThisInstanceSingleton.instance)
        {
            LockUsedByThisInstanceSingleton.instance = new LockUsedByThisInstanceSingleton();
        }

        return LockUsedByThisInstanceSingleton.instance;
    }

    public hasSpawnedSudoSuccessfullyWithoutDeath(): boolean
    {
        return this.everSpawnedSudoSuccessfully;
    }

    public killingSudoProc(): void
    {
        this.everSpawnedSudoSuccessfully = false;
    }

    public isCurrentSudoProcCheckAlive(): boolean
    {
        return this.currentAliveStatus;
    }

    /*
    You must set it back to false when the check is done.
    */
    public setCurrentSudoCheckAsAlive(alive: boolean): void
    {
        if (alive)
        {
            this.everSpawnedSudoSuccessfully = true;
        }
        this.currentAliveStatus = alive;
    }

    public sudoProcError(): any
    {
        return this.sudoError;
    }

    public setSudoProcError(err: any): void
    {
        this.sudoError = err;
    }
}
