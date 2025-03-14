/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export class LockUsedByThisInstanceSingleton
{
    protected static instance: LockUsedByThisInstanceSingleton;

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
        const hasInteracted = this.lockStringAndThisVsCodeInstanceOwnsIt[lockKey] === true;
        this.lockStringAndThisVsCodeInstanceOwnsIt[lockKey] = true; // This could be a set but this is also fine;
        return hasInteracted;
    }
}
