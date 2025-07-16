/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IOutputChannel, ViewColumn } from '../../EventStream/IOutputChannel';

export class MockOutputChannel implements IOutputChannel
{
    name: string = 'Test';
    appendedText: string[] = [];
    appendedLines: string[] = [];

    append(value: string): void
    {
        this.appendedText.push(value);
    }

    appendLine(value: string): void
    {
        this.appendedLines.push(value);
    }

    replace(value: string): void
    {
        // Not needed
    }

    clear(): void
    {
        this.appendedText = [];
        this.appendedLines = [];
    }

    show(preserveFocus?: boolean): void;
    show(column?: ViewColumn, preserveFocus?: boolean): void;
    show(column?: any, preserveFocus?: any): void
    {
        // Not needed
    }

    hide(): void
    {
        // Not needed
    }

    dispose(): void
    {
        // Not needed
    }
}
