/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

/**
 * The type of .NET installation to acquire.
 * - 'sdk': The full .NET SDK (includes runtime + build tools)
 * - 'runtime': The .NET Runtime only
 * - 'aspnetcore': The ASP.NET Core Runtime
 */
export type DotnetInstallMode = 'sdk' | 'runtime' | 'aspnetcore';
