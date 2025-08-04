/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { VSCodeCommandExecutor } from './vscode-command-executor';

/**
 * MCP Server Definition Provider for .NET Installation Tools
 *
 * This sets up the infrastructure for MCP (Model Context Protocol) support.
 * Since VS Code MCP APIs may not be available in all versions, this provides
 * a fallback that creates the necessary infrastructure and configuration.
 */
export class DotnetMcpProvider
{
    private executor: VSCodeCommandExecutor | null = null;
    private isSetup = false;

    constructor(private context: vscode.ExtensionContext, private eventStream: any) {}

    /**
     * Setup the MCP infrastructure
     */
    async setup(): Promise<void>
    {
        if (this.isSetup)
        {
            return;
        }

        try
        {
            console.log('Setting up .NET MCP infrastructure...');

            // Start the VSCode command executor
            this.executor = new VSCodeCommandExecutor();
            await this.executor.start();

            // Add cleanup when extension is deactivated
            this.context.subscriptions.push({
                dispose: () => this.executor?.stop()
            });

            // Try to register with VS Code MCP API if available
            await this.tryRegisterMcpProvider();

            // Create MCP configuration for manual setup
            this.createMcpConfiguration();

            this.isSetup = true;
            console.log('.NET MCP infrastructure setup completed successfully');

        } catch (error)
        {
            console.error('Failed to setup .NET MCP infrastructure:', error);
            throw error;
        }
    }

    /**
     * Try to register with VS Code MCP API (if available)
     */
    private async tryRegisterMcpProvider(): Promise<void>
    {
        try
        {
            // Check if the VS Code MCP API is available
            const vscodeAny = vscode as any;

            if (vscodeAny.lm && vscodeAny.lm.registerMcpServerDefinitionProvider)
            {
                console.log('VS Code MCP API detected, registering provider...');

                const provider = {
                    onDidChangeMcpServerDefinitions: new vscode.EventEmitter<void>().event,

                    provideMcpServerDefinitions: async () =>
                    {
                        const mcpToolPath = path.join(__dirname, 'dotnet-install-mcp.js');

                        if (!fs.existsSync(mcpToolPath))
                        {
                            console.error(`MCP tool not found at: ${mcpToolPath}`);
                            return [];
                        }

                        // Create server definition using the VS Code MCP API
                        const McpStdioServerDefinition = vscodeAny.McpStdioServerDefinition;
                        if (McpStdioServerDefinition)
                        {
                            const serverDefinition = new McpStdioServerDefinition(
                                '.NET Installation Tools',
                                'node',
                                [mcpToolPath, '--mcp-stdio'],
                                {
                                    VSCODE_COMMAND_PIPE: this.executor?.getPipeName() || '',
                                    DOTNET_EVENT_STREAM_CONTEXT: 'true'
                                }
                            );
                            return [serverDefinition];
                        }

                        return [];
                    },

                    resolveMcpServerDefinition: async (definition: any) =>
                    {
                        console.log('.NET MCP server starting via VS Code API...');
                        return definition;
                    }
                };

                const registration = vscodeAny.lm.registerMcpServerDefinitionProvider('dotnetInstaller', provider);
                this.context.subscriptions.push(registration);

                console.log('.NET MCP server registered with VS Code API successfully');
            } else
            {
                console.log('VS Code MCP API not available, using fallback configuration');
            }
        } catch (error)
        {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log('Failed to register with VS Code MCP API, using fallback:', errorMessage);
        }
    }

    /**
     * Create MCP configuration for manual setup
     */
    private createMcpConfiguration(): void
    {
        const mcpToolPath = path.join(__dirname, 'dotnet-install-mcp.js');

        const mcpConfig = {
            servers: {
                "dotnet-installer": {
                    "type": "stdio",
                    "command": "node",
                    "args": [mcpToolPath, "--mcp-stdio"],
                    "description": ".NET installation and management tools",
                    "env": {
                        "VSCODE_COMMAND_PIPE": this.executor?.getPipeName() || '',
                        "DOTNET_EVENT_STREAM_CONTEXT": "true"
                    }
                }
            }
        };

        console.log('\n=== .NET MCP Server Configuration ===');
        console.log('To use the .NET MCP server, add this to your VS Code mcp.json:');
        console.log(JSON.stringify(mcpConfig, null, 2));
        console.log('=====================================\n');

        // Write configuration to global storage
        try
        {
            const configPath = path.join(this.context.globalStoragePath, 'mcp-config.json');
            const configDir = path.dirname(configPath);

            if (!fs.existsSync(configDir))
            {
                fs.mkdirSync(configDir, { recursive: true });
            }

            fs.writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2));
            console.log(`MCP configuration saved to: ${configPath}`);
        } catch (error)
        {
            console.error('Failed to save MCP configuration:', error);
        }

        // Also create a workspace configuration hint
        this.createWorkspaceConfigurationHint(mcpConfig);
    }

    /**
     * Create a hint for workspace-specific MCP configuration
     */
    private createWorkspaceConfigurationHint(mcpConfig: any): void
    {
        try
        {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0)
            {
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const vscodePath = path.join(workspaceRoot, '.vscode');
                const mcpConfigPath = path.join(vscodePath, 'mcp.json');

                // Don't overwrite existing config, just provide information
                if (!fs.existsSync(mcpConfigPath))
                {
                    console.log(`To enable .NET MCP for this workspace, create: ${mcpConfigPath}`);
                    console.log('With the configuration shown above.');
                } else
                {
                    console.log(`Workspace MCP config exists at: ${mcpConfigPath}`);
                    console.log('You can add the .NET MCP server configuration to it.');
                }
            }
        } catch (error)
        {
            console.error('Failed to create workspace configuration hint:', error);
        }
    }

    /**
     * Get the command executor pipe name for external processes
     */
    public getPipeName(): string | null
    {
        return this.executor?.getPipeName() || null;
    }

    /**
     * Dispose of resources
     */
    public dispose(): void
    {
        this.executor?.stop();
    }
}

/**
 * Setup and initialize the .NET MCP infrastructure
 */
export function setupDotnetMcp(context: vscode.ExtensionContext, eventStream: any): DotnetMcpProvider
{
    const mcpProvider = new DotnetMcpProvider(context, eventStream);

    // Add to subscriptions for cleanup
    context.subscriptions.push(mcpProvider);

    // Setup the infrastructure asynchronously
    mcpProvider.setup().catch((error) =>
    {
        console.error('Failed to setup .NET MCP:', error);
    });

    return mcpProvider;
}
