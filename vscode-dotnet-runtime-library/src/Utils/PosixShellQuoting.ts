/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

/**
 * Wraps a value in single quotes so that a POSIX shell (sh, bash, zsh, dash) takes it literally.
 * A single-quoted shell word cannot contain a single quote, so every embedded quote is closed,
 * escaped and reopened (`'\''`). This keeps values that contain spaces, `$`, backticks, double
 * quotes or apostrophes (for example a user name such as `o'brien`) from being split or expanded
 * when the value is parsed later, for example when a shell profile is sourced.
 * @param value The raw value to quote.
 * @returns The value wrapped in single quotes, safe to embed in a POSIX shell word.
 */
export function quoteForPosixShell(value: string): string
{
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
