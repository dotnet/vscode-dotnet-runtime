/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

export abstract class IVSCodeExtensionContext
{
    abstract setVSCodeEnvironmentVariable(variable : string, value : string) : void;

    abstract appendToEnvironmentVariable(variable : string, pathAdditionWithDelimiter : string) : void;
}
