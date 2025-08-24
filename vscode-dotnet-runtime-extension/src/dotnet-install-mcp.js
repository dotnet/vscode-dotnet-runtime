/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

const net = require('net');
const {v4: uuidv4} = require('uuid');

/**
 * Standalone MCP Command Line Tool for .NET Installation
 *
 * This is a standalone Node.js script that can work in two modes:
 * 1. CLI mode: Communicates with VSCode extension via named pipes
 * 2. MCP stdio mode: Implements MCP protocol over stdio for AI assistants
 *
 * Usage:
 *   dotnet-install-mcp acquire --version 8.0 --mode runtime
 *   dotnet-install-mcp acquire-global --version 8.0
 *   dotnet-install-mcp uninstall --version 8.0 --mode runtime
 *   dotnet-install-mcp --mcp-stdio  (for MCP mode)
 */

class DotnetInstallMCP
{
    constructor(pipeName = 'dotnet-vscode-executor')
    {
        this.pipeName = process.platform === 'win32'
            ? `\\\\.\\pipe\\${pipeName}`
            : `/tmp/${pipeName}.sock`;
        this.isStdioMode = false;
    }

    /**
     * Run in MCP stdio mode
     */
    async runStdioMode()
    {
        this.isStdioMode = true;
        console.error('Starting .NET MCP Server in stdio mode');

        // Handle incoming JSON-RPC messages from stdin
        let buffer = '';
        process.stdin.on('data', (chunk) =>
        {
            buffer += chunk.toString();

            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines)
            {
                if (line.trim())
                {
                    this.handleMcpMessage(line.trim());
                }
            }
        });

        process.stdin.on('end', () =>
        {
            process.exit(0);
        });

        // Send initial capabilities
        this.sendMcpResponse({
            jsonrpc: '2.0',
            id: null,
            result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {}
                },
                serverInfo: {
                    name: 'dotnet-install-mcp-server',
                    version: '1.0.0'
                }
            }
        });
    }

    /**
     * Handle MCP protocol messages
     */
    async handleMcpMessage(messageStr)
    {
        try
        {
            const message = JSON.parse(messageStr);
            let response;

            switch (message.method)
            {
                case 'initialize':
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        result: {
                            protocolVersion: '2024-11-05',
                            capabilities: {
                                tools: {}
                            },
                            serverInfo: {
                                name: 'dotnet-install-mcp-server',
                                version: '1.0.0'
                            }
                        }
                    };
                    break;

                case 'tools/list':
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        result: {
                            tools: [
                                {
                                    name: 'install_dotnet_runtime',
                                    description: 'Install .NET runtime locally for VS Code extensions',
                                    inputSchema: {
                                        type: 'object',
                                        properties: {
                                            version: {type: 'string', description: '.NET version to install (e.g., 8.0, 6.0, latest)'},
                                            architecture: {type: 'string', description: 'Target architecture (x64, arm64, x86)', default: 'current'}
                                        },
                                        required: ['version']
                                    }
                                },
                                {
                                    name: 'install_dotnet_sdk',
                                    description: 'Install .NET SDK globally on the system',
                                    inputSchema: {
                                        type: 'object',
                                        properties: {
                                            version: {type: 'string', description: '.NET SDK version to install (e.g., 8.0, 6.0, latest)'},
                                            architecture: {type: 'string', description: 'Target architecture (x64, arm64, x86)', default: 'current'}
                                        },
                                        required: ['version']
                                    }
                                },
                                {
                                    name: 'uninstall_dotnet',
                                    description: 'Uninstall .NET runtime or SDK',
                                    inputSchema: {
                                        type: 'object',
                                        properties: {
                                            version: {type: 'string', description: '.NET version to uninstall'},
                                            mode: {type: 'string', description: 'runtime, sdk, or aspnetcore', default: 'runtime'},
                                            architecture: {type: 'string', description: 'Target architecture (x64, arm64, x86)', default: 'current'}
                                        },
                                        required: ['version']
                                    }
                                }
                            ]
                        }
                    };
                    break;

                case 'tools/call':
                    response = await this.handleMcpToolCall(message.params, message.id);
                    break;

                default:
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        error: {
                            code: -32601,
                            message: `Method not found: ${message.method}`
                        }
                    };
            }

            this.sendMcpResponse(response);

        } catch (error)
        {
            const errorResponse = {
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32603,
                    message: 'Internal error',
                    data: error.message
                }
            };
            this.sendMcpResponse(errorResponse);
        }
    }

    /**
     * Handle MCP tool calls
     */
    async handleMcpToolCall(params, messageId)
    {
        const {name, arguments: args} = params;

        try
        {
            let command;
            let cliArgs = [];

            switch (name)
            {
                case 'install_dotnet_runtime':
                    command = 'acquire';
                    cliArgs = ['--version', args.version, '--mode', 'runtime'];
                    if (args.architecture && args.architecture !== 'current')
                    {
                        cliArgs.push('--architecture', args.architecture);
                    }
                    break;

                case 'install_dotnet_sdk':
                    command = 'acquire-global';
                    cliArgs = ['--version', args.version];
                    if (args.architecture && args.architecture !== 'current')
                    {
                        cliArgs.push('--architecture', args.architecture);
                    }
                    break;

                case 'uninstall_dotnet':
                    command = 'uninstall';
                    cliArgs = ['--version', args.version, '--mode', args.mode || 'runtime'];
                    if (args.architecture && args.architecture !== 'current')
                    {
                        cliArgs.push('--architecture', args.architecture);
                    }
                    break;

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }

            // Execute the command via the pipe interface
            const result = await this.executeViaPipe(command, cliArgs);

            return {
                jsonrpc: '2.0',
                id: messageId,
                result: {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully executed ${name}.\n\nCommand: ${command} ${cliArgs.join(' ')}\n\nResult:\n${JSON.stringify(result, null, 2)}`
                        }
                    ]
                }
            };

        } catch (error)
        {
            return {
                jsonrpc: '2.0',
                id: messageId,
                error: {
                    code: -32603,
                    message: `Tool execution failed: ${error.message}`
                }
            };
        }
    }

    /**
     * Execute command via the named pipe to VS Code extension
     */
    async executeViaPipe(command, args)
    {
        const {command: cmdName, options} = this.parseArgs([command, ...args]);
        const context = this.createContext(cmdName, options);
        return await this.sendCommand(cmdName, context);
    }

    /**
     * Send MCP response to stdout
     */
    sendMcpResponse(response)
    {
        process.stdout.write(JSON.stringify(response) + '\n');
    }

    /**
     * Parse command line arguments
     */
    parseArgs(args)
    {
        const command = args[0];
        const options = {};

        for (let i = 1; i < args.length; i += 2)
        {
            const key = args[i]?.replace('--', '');
            const value = args[i + 1];
            if (key && value)
            {
                options[key] = value;
            }
        }

        return {command, options};
    }

    /**
     * Create a dotnet acquire context from parsed options
     */
    createContext(command, options)
    {
        const context = {
            version: options.version || 'latest',
            requestingExtensionId: 'dotnet-mcp-server',
            architecture: options.architecture || this.getDefaultArchitecture(),
            installType: command === 'acquire-global' ? 'global' : 'local',
            mode: options.mode || (command === 'acquire-global' ? 'sdk' : 'runtime')
        };

        return context;
    }

    /**
     * Get the default architecture for the current platform
     */
    getDefaultArchitecture()
    {
        const arch = process.arch;
        switch (arch)
        {
            case 'x64': return 'x64';
            case 'arm64': return 'arm64';
            case 'ia32': return 'x86';
            default: return 'x64';
        }
    }

    /**
     * Map command to VSCode command name
     */
    getVSCodeCommand(command)
    {
        switch (command)
        {
            case 'acquire': return 'dotnet.acquire';
            case 'acquire-global': return 'dotnet.acquireGlobalSDK';
            case 'uninstall': return 'dotnet.uninstall';
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }

    /**
     * Send command to VSCode extension via pipe
     */
    async sendCommand(command, context)
    {
        return new Promise((resolve, reject) =>
        {
            const client = net.createConnection(this.pipeName);
            const requestId = uuidv4();
            let responseBuffer = '';

            const request = {
                id: requestId,
                command: this.getVSCodeCommand(command),
                context
            };

            client.on('connect', () =>
            {
                if (!this.isStdioMode)
                {
                    console.log(`Connected to VSCode extension`);
                }
                client.write(JSON.stringify(request) + '\n');
            });

            client.on('data', (data) =>
            {
                responseBuffer += data.toString();

                // Check if we have a complete response (newline-terminated)
                const lines = responseBuffer.split('\n');
                for (let i = 0; i < lines.length - 1; i++)
                {
                    const line = lines[i].trim();
                    if (line)
                    {
                        try
                        {
                            const response = JSON.parse(line);
                            if (response.id === requestId)
                            {
                                client.end();
                                if (response.success)
                                {
                                    resolve(response.result);
                                } else
                                {
                                    reject(new Error(response.error));
                                }
                                return;
                            }
                        } catch (error)
                        {
                            // Continue processing other lines
                        }
                    }
                }

                // Keep the last incomplete line for next data event
                responseBuffer = lines[lines.length - 1];
            });

            client.on('error', (error) =>
            {
                reject(new Error(`Failed to connect to VSCode extension: ${error.message}`));
            });

            client.on('close', () =>
            {
                if (responseBuffer.trim())
                {
                    reject(new Error('Connection closed without receiving complete response'));
                }
            });

            // Set timeout for the operation
            setTimeout(() =>
            {
                client.destroy();
                reject(new Error('Command timeout'));
            }, 300000); // 5 minutes timeout
        });
    }

    /**
     * Run the MCP command in CLI mode
     */
    async run(args)
    {
        try
        {
            const {command, options} = this.parseArgs(args);

            if (!command)
            {
                throw new Error('No command specified');
            }

            console.log(`Executing ${command} with options:`, options);

            const context = this.createContext(command, options);
            const result = await this.sendCommand(command, context);

            console.log('Command completed successfully');
            if (result && typeof result === 'object')
            {
                if (result.dotnetPath)
                {
                    console.log(`Path: ${result.dotnetPath}`);
                }
                console.log('Result:', JSON.stringify(result, null, 2));
            } else if (result)
            {
                console.log('Result:', result);
            }

            return result;

        } catch (error)
        {
            console.error('Error:', error.message);
            process.exit(1);
        }
    }

    /**
     * Print usage information
     */
    printUsage()
    {
        console.log(`
Usage: dotnet-install-mcp <command> [options]

Commands:
  acquire         Acquire .NET runtime locally
  acquire-global  Acquire .NET SDK globally
  uninstall       Uninstall .NET

Options:
  --version <version>        .NET version (e.g., 8.0, 6.0.201, latest)
  --mode <mode>             runtime, sdk, or aspnetcore (default: runtime for acquire, sdk for acquire-global)
  --architecture <arch>     x64, arm64, x86 (default: current platform architecture)
  --mcp-stdio               Run in MCP stdio mode for AI assistants

Examples:
  dotnet-install-mcp acquire --version 8.0 --mode runtime
  dotnet-install-mcp acquire-global --version 8.0
  dotnet-install-mcp uninstall --version 8.0 --mode runtime --architecture x64
  dotnet-install-mcp --mcp-stdio  (for MCP mode)
        `);
    }
}

// Main execution
if (require.main === module)
{
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h')
    {
        const mcp = new DotnetInstallMCP();
        mcp.printUsage();
        process.exit(0);
    }

    const mcp = new DotnetInstallMCP();

    // Check if running in MCP stdio mode
    if (args[0] === '--mcp-stdio')
    {
        mcp.runStdioMode().catch((error) =>
        {
            console.error('Fatal error in MCP stdio mode:', error);
            process.exit(1);
        });
    } else
    {
        // Regular CLI mode
        mcp.run(args).catch((error) =>
        {
            console.error('Fatal error:', error);
            process.exit(1);
        });
    }
}

module.exports = {DotnetInstallMCP};
