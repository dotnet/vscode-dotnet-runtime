/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IDotnetPathFinder } from './IDotnetPathFinder';

export class DotnetPathFinder implements IDotnetPathFinder
{
    public constructor()
    {

    }

    public async findDotnetRootPath() : Promise<string | undefined>
    {
        return undefined;
    }

    public async findPathEnvironmentSetting() : Promise<string | undefined>
    {
        return undefined;
    }

}
