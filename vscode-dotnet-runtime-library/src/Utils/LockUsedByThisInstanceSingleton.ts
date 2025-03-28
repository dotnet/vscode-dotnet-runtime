/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';

export class LockUsedByThisInstanceSingleton
{
    protected static instance: LockUsedByThisInstanceSingleton;

    private everSpawnedSudoSuccessfully = false;
    private currentAliveStatus = false;
    private sudoError: any = null;

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

    public hasVsCodeInstanceInteractedWithLock(lockKey: string): boolean
    {
        lockKey = path.basename(lockKey).trim();
        const hasInteracted = this.lockStringAndThisVsCodeInstanceOwnsIt[lockKey] === true;
        this.lockStringAndThisVsCodeInstanceOwnsIt[lockKey] = true; // This could be a set but this is also fine
        return hasInteracted;
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
