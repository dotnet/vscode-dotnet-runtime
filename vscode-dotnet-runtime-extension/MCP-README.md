# .NET MCP Server

This extension provides a Model Context Protocol (MCP) server for .NET installation and management tools. The MCP server allows AI assistants to install, manage, and query .NET SDKs and runtimes.

## Architecture

The .NET MCP implementation consists of three main components:

### 1. VS Code Command Executor (`vscode-command-executor.ts`)
- Runs within the VS Code extension host
- Listens on a named pipe for commands from external processes
- Executes VS Code extension commands (`dotnet.acquireGlobalSDK`, `dotnet.uninstall`, etc.)
- Provides secure communication between the MCP server and VS Code APIs

### 2. MCP Server Tool (`dotnet-install-mcp.js`)
- Standalone Node.js process that implements the MCP protocol
- Communicates with AI assistants via stdio (JSON-RPC)
- Connects to VS Code Command Executor via named pipes
- Can also be used as a standalone CLI tool

### 3. MCP Provider (`dotnet-mcp-provider.ts`)
- Integrates with VS Code's MCP infrastructure
- Attempts to register with VS Code MCP API if available
- Provides fallback configuration for manual setup
- Manages the lifecycle of MCP components

## Usage

### Automatic Setup (VS Code MCP API)
If your VS Code version supports the MCP API, the server will be automatically registered and available in the MCP view.

### Manual Setup
If automatic registration is not available, add this configuration to your VS Code `mcp.json`:

```json
{
  "servers": {
    "dotnet-installer": {
      "type": "stdio",
      "command": "dotnet-install-mcp-server",
      "args": []
    }
  }
}
```

### VS Code Extension API
The extension also exposes the standard VS Code commands that can be called programmatically:

```typescript
// Install .NET runtime
await vscode.commands.executeCommand('dotnet.acquire', {
  version: '8.0',
  requestingExtensionId: 'your-extension-id',
  mode: 'runtime'
});

// Install .NET SDK globally
await vscode.commands.executeCommand('dotnet.acquireGlobalSDK', {
  version: '8.0',
  requestingExtensionId: 'your-extension-id'
});
```

## Setup

1. The extension automatically starts the VSCode Command Executor when activated
2. The MCP command-line tool is added to PATH in `~/.dotnet-mcp/bin/`
3. The MCP server infrastructure is set up for stdio communication

## Communication Flow

```
AI Assistant -> MCP Protocol -> dotnet-install-mcp.js -> Named Pipe -> vscode-command-executor.ts -> VS Code Commands -> .NET Installation
```

## File Structure

- `vscode-command-executor.ts` - Pipe server that executes VS Code commands
- `dotnet-install-mcp.js` - Standalone CLI tool for pipe communication
- `extension.ts` - Contains `setupMCPServer()` function for integration
- `mcp-package.json` - Package configuration for the MCP tool

## Security Considerations

- The named pipe is local to the machine
- Commands are validated before execution
- Only specific VS Code commands are allowed
- Authentication could be added via pipe permissions

## Error Handling

- Connection timeouts (5 minutes)
- Command validation
- Proper error propagation through the pipe
- MCP protocol error responses

## Dependencies

- VS Code Extension: Uses existing extension dependencies
- MCP Tool: Only requires Node.js and `uuid` package
- No external dependencies for basic operation
