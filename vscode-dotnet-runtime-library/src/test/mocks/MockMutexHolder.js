/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

// This script is used to hold a mutex with a specific session ID for testing purposes
const path = require('path');

// Import the NodeIPCMutex from the compiled library
// First determine the path to the root of the package
const libraryRootPath = path.resolve(__dirname, '../../..');
let NodeIPCMutex;

try
{
    // Try to import from the dist directory (compiled code)
    NodeIPCMutex = require(path.join(libraryRootPath, 'dist/Utils/NodeIPCMutex')).NodeIPCMutex;
}
catch (err)
{
    try
    {
        // If that fails, try to import directly from the source
        NodeIPCMutex = require(path.join(libraryRootPath, 'src/Utils/NodeIPCMutex')).NodeIPCMutex;
    }
    catch (srcErr)
    {
        console.error('Failed to import NodeIPCMutex:', err);
        console.error('Also failed to import from source:', srcErr);
        process.send({error: `Failed to import NodeIPCMutex module: ${err.message}`});
        process.exit(1);
    }
}

class SimpleMutexLogger
{
    log(message)
    {
        process.send({log: message});
        console.log(`[MockMutexHolder] ${message}`);
    }
}

let mutex = null;
let neverResolvingPromise = null;

process.on('message', (msg) =>
{
    if (msg.sessionId)
    {
        const sessionId = msg.sessionId;
        const logger = new SimpleMutexLogger();
        mutex = new NodeIPCMutex(sessionId, logger);

        mutex.acquire(() =>
        {
            // Notify the parent process that we've acquired the mutex
            process.send({acquired: true, sessionId: sessionId});

            // Send heartbeat messages to parent process to indicate we're still alive
            const heartbeatInterval = setInterval(() =>
            {
                process.send({heartbeat: true, sessionId: sessionId});
            }, 500);

            // Clean up if parent signals to exit (though this will never resolve)
            process.on('message', (innerMsg) =>
            {
                if (innerMsg.exit)
                {
                    clearInterval(heartbeatInterval);
                    process.exit(0);
                }
            });

            // Return a promise that never resolves to hold the mutex forever
            return new Promise(() =>
            {
                // Never resolve this promise
                neverResolvingPromise = true;
            });
        }, 100, 5000, `${sessionId}-test-holder`).catch(error =>
        {
            process.send({error: `Failed to acquire mutex: ${error}`});
        });
    }
});

// Handle process termination - the mutex will be released automatically
// when the process dies, but we'll clean up explicitly if possible
process.on('SIGINT', () =>
{
    process.exit(0);
});

process.on('SIGTERM', () =>
{
    process.exit(0);
});
