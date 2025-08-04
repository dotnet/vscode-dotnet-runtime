/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import * as vscode from 'vscode';
import { IDotnetAcquireContext, IDotnetAcquireResult } from 'vscode-dotnet-runtime-library';

interface CommandRequest
{
    id: string;
    command: 'dotnet.acquireGlobalSDK' | 'dotnet.uninstall' | 'dotnet.acquire';
    context: IDotnetAcquireContext;
}

interface CommandResponse
{
    id: string;
    success: boolean;
    result?: IDotnetAcquireResult | string;
    error?: string;
}

/**
 * VSCode Command Executor Process
 *
 * This process runs within the VSCode extension host and listens on a named pipe
 * for commands to execute. It can run dotnet.acquireGlobalSDK, dotnet.uninstall,
 * and dotnet.acquire commands with the provided context.
 */
export class VSCodeCommandExecutor
{
    private server: net.Server | null = null;
    private readonly pipeName: string;

    constructor(pipeName: string = 'dotnet-vscode-executor')
    {
        this.pipeName = process.platform === 'win32'
            ? `\\\\.\\pipe\\${pipeName}`
            : `/tmp/${pipeName}.sock`;
    }

    /**
     * Start the command executor server
     */
    public async start(): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            this.server = net.createServer((socket) =>
            {
                console.log('Client connected to VSCode command executor');

                socket.on('data', async (data) =>
                {
                    try
                    {
                        const requests = data.toString().trim().split('\n');

                        for (const requestStr of requests)
                        {
                            if (!requestStr.trim()) continue;

                            const request: CommandRequest = JSON.parse(requestStr);
                            const response = await this.executeCommand(request);

                            socket.write(JSON.stringify(response) + '\n');
                        }
                    } catch (error)
                    {
                        const errorResponse: CommandResponse = {
                            id: 'unknown',
                            success: false,
                            error: `Failed to parse request: ${error}`
                        };
                        socket.write(JSON.stringify(errorResponse) + '\n');
                    }
                });

                socket.on('error', (error) =>
                {
                    console.error('Socket error:', error);
                });

                socket.on('close', () =>
                {
                    console.log('Client disconnected from VSCode command executor');
                });
            });

            this.server.on('error', (error) =>
            {
                reject(error);
            });

            this.server.listen(this.pipeName, () =>
            {
                console.log(`VSCode command executor listening on ${this.pipeName}`);
                resolve();
            });
        });
    }

    /**
     * Get the pipe name for external processes to connect
     */
    public getPipeName(): string
    {
        return this.pipeName;
    }

    /**
     * Stop the command executor server
     */
    public async stop(): Promise<void>
    {
        return new Promise((resolve) =>
        {
            if (this.server)
            {
                this.server.close(() =>
                {
                    console.log('VSCode command executor stopped');
                    resolve();
                });
            } else
            {
                resolve();
            }
        });
    }

    /**
     * Execute a VSCode command with the provided context
     */
    private async executeCommand(request: CommandRequest): Promise<CommandResponse>
    {
        try
        {
            console.log(`Executing command: ${request.command} with context:`, request.context);

            let result: any;

            switch (request.command)
            {
                case 'dotnet.acquireGlobalSDK':
                    result = await vscode.commands.executeCommand('dotnet.acquireGlobalSDK', request.context);
                    break;

                case 'dotnet.acquire':
                    result = await vscode.commands.executeCommand('dotnet.acquire', request.context);
                    break;

                case 'dotnet.uninstall':
                    result = await vscode.commands.executeCommand('dotnet.uninstall', request.context);
                    break;

                default:
                    throw new Error(`Unsupported command: ${request.command}`);
            }

            return {
                id: request.id,
                success: true,
                result
            };

        } catch (error)
        {
            console.error(`Error executing command ${request.command}:`, error);

            return {
                id: request.id,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

// If this file is run directly (for testing purposes)
if (require.main === module)
{
    const executor = new VSCodeCommandExecutor();

    executor.start().then(() =>
    {
        console.log('VSCode command executor started successfully');

        // Handle graceful shutdown
        process.on('SIGINT', async () =>
        {
            console.log('Shutting down VSCode command executor...');
            await executor.stop();
            process.exit(0);
        });

        process.on('SIGTERM', async () =>
        {
            console.log('Shutting down VSCode command executor...');
            await executor.stop();
            process.exit(0);
        });
    }).catch((error) =>
    {
        console.error('Failed to start VSCode command executor:', error);
        process.exit(1);
    });
}
