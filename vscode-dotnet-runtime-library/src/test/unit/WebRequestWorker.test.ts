/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';

import * as chaiAsPromised from 'chai-as-promised';
import * as http from 'http';
import * as https from 'https';
import * as dns from 'dns';
import * as path from 'path';
import { DotnetCoreAcquisitionWorker } from '../../Acquisition/DotnetCoreAcquisitionWorker';
import { IInstallScriptAcquisitionWorker } from '../../Acquisition/IInstallScriptAcquisitionWorker';
import
{
    DotnetFallbackInstallScriptUsed,
    DotnetInstallScriptAcquisitionError,
    OfflineDetectionLogicTriggered,
    WebRequestTime,
} from '../../EventStream/EventStreamEvents';
import
{
    ErrorAcquisitionInvoker,
    MockEventStream,
    MockInstallScriptWorker,
    MockInstallTracker,
    MockTrackingWebRequestWorker,
    MockVSCodeExtensionContext,
} from '../mocks/MockObjects';

import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';

const assert = chai.assert;
chai.use(chaiAsPromised);

const maxTimeoutTime = 10000;
// Website used for the sake of it returning the same response always (tm)
const staticWebsiteUrl = 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/2.1/releases.json';

suite('WebRequestWorker Unit Tests', function ()
{
    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('Acquire Version Network Failure', async () =>
    {
        const eventStream = new MockEventStream();
        const mockContext = getMockAcquisitionContext('runtime', '1.0', undefined, eventStream);
        const acquisitionWorker = new DotnetCoreAcquisitionWorker(getMockUtilityContext(), new MockVSCodeExtensionContext());
        const invoker = new ErrorAcquisitionInvoker(eventStream);
        const tracker = new MockInstallTracker(eventStream, mockContext.extensionState);

        try
        {
            await assert.isRejected(acquisitionWorker.acquireLocalRuntime(mockContext, invoker), Error, 'Command Failed');
        }
        finally
        {
            await tracker.endAnySingletonTrackingSessions();
        }
    }).timeout(maxTimeoutTime);

    test('Install Script Request Failure', async () =>
    {
        const eventStream = new MockEventStream();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(getMockAcquisitionContext('runtime', '', undefined, eventStream), true);
        await assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script');
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
    });

    test('Install Script Request Failure With Fallback Install Script', async () =>
    {
        const eventStream = new MockEventStream();

        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(getMockAcquisitionContext('runtime', '', undefined, eventStream), true, true);

        const scriptPath = await installScriptWorker.getDotnetInstallScriptPath();

        assert.equal(scriptPath, path.join(__dirname, '..'));

        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
        assert.exists(eventStream.events.find(event => event instanceof DotnetFallbackInstallScriptUsed));
    });

    test('Install Script File Manipulation Failure', async () =>
    {
        const eventStream = new MockEventStream();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(getMockAcquisitionContext('runtime', '', undefined, eventStream), true);
        await assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script')
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
    });

    test('Web Requests Cached on Repeated calls', async () =>
    {
        const ctx = getMockAcquisitionContext('runtime', '');
        const webWorker = new MockTrackingWebRequestWorker();

        const uncachedResult = await webWorker.getCachedData(staticWebsiteUrl, ctx);
        // The data should now be cached.
        const cachedResult = await webWorker.getCachedData(staticWebsiteUrl, ctx);

        assert.exists(uncachedResult);
        assert.deepEqual(uncachedResult, cachedResult);

        const requestCount = webWorker.getRequestCount();
        assert.isAtMost(requestCount, 1);
    }).timeout(maxTimeoutTime);

    test('Web Requests Cached Does Not Live Forever', async () =>
    {
        const ctx = getMockAcquisitionContext('runtime', '');
        const uri = 'https://microsoft.com';

        const webWorker = new MockTrackingWebRequestWorker(true);
        const uncachedResult = await webWorker.getCachedData(uri, ctx);
        await new Promise(resolve => setTimeout(resolve, 120000));
        const cachedResult = await webWorker.getCachedData(uri, ctx);
        assert.exists(uncachedResult);
        const requestCount = webWorker.getRequestCount();
        assert.isAtLeast(requestCount, 2);
    }).timeout((maxTimeoutTime * 7) + 120000);

    test('It actually times requests', async () =>
    {
        const eventStream = new MockEventStream();
        const ctx = getMockAcquisitionContext('runtime', '', 600, eventStream);
        const webWorker = new MockTrackingWebRequestWorker();

        const _ = await webWorker.getCachedData(staticWebsiteUrl, ctx);
        const timerEvents = eventStream.events.find(event => event instanceof WebRequestTime);
        assert.exists(timerEvents, 'There exist WebRequestTime Events');
        assert.equal(timerEvents?.finished, 'true', 'The timed event time finished');
        assert.isTrue(Number(timerEvents?.durationMs) > 0, 'The timed event time is > 0');
        assert.isTrue(String(timerEvents?.status).startsWith('2'), 'The timed event has a status 2XX');
    });
});

/**
 * Helper that intercepts all outbound HTTP/HTTPS requests and DNS lookups to simulate a fully offline machine.
 * Error codes match real observed behavior when a firewall blocks node.exe outbound traffic:
 *   DNS: ETIMEOUT, Axios: EACCES with no response.
 * Returns a restore function that undoes the patching.
 */
function simulateOffline(): () => void
{
    const originalHttpsRequest = https.request;
    const originalHttpRequest = http.request;
    const originalDnsResolve = dns.promises.Resolver.prototype.resolve;

    // Block all HTTPS requests — emit EACCES matching real firewall behavior
    (https as any).request = function (...args: any[])
    {
        const req = new http.ClientRequest('https://localhost:1');
        const err: NodeJS.ErrnoException = new Error('connect EACCES');
        err.code = 'EACCES';
        err.errno = -4092;
        err.syscall = 'connect';
        process.nextTick(() => req.destroy(err));
        return req;
    };

    // Block all HTTP requests
    (http as any).request = function (...args: any[])
    {
        const req = new http.ClientRequest('http://localhost:1');
        const err: NodeJS.ErrnoException = new Error('connect EACCES');
        err.code = 'EACCES';
        err.errno = -4092;
        err.syscall = 'connect';
        process.nextTick(() => req.destroy(err));
        return req;
    };

    // Block DNS resolution — emit ETIMEOUT matching real offline behavior
    dns.promises.Resolver.prototype.resolve = function ()
    {
        const err: NodeJS.ErrnoException = new Error('queryA ETIMEOUT www.microsoft.com');
        err.code = 'ETIMEOUT';
        return Promise.reject(err);
    } as any;

    return () =>
    {
        (https as any).request = originalHttpsRequest;
        (http as any).request = originalHttpRequest;
        dns.promises.Resolver.prototype.resolve = originalDnsResolve;
    };
}

/**
 * Helper that blocks only DNS resolution but allows TCP/TLS connections through.
 * Simulates a proxy environment where DNS doesn't resolve locally but HTTP works.
 */
function simulateDnsOnlyFailure(): () => void
{
    const originalDnsResolve = dns.promises.Resolver.prototype.resolve;

    dns.promises.Resolver.prototype.resolve = function ()
    {
        const err: NodeJS.ErrnoException = new Error('queryA ETIMEOUT www.microsoft.com');
        err.code = 'ETIMEOUT';
        return Promise.reject(err);
    } as any;

    return () =>
    {
        dns.promises.Resolver.prototype.resolve = originalDnsResolve;
    };
}

suite('isOnline Connectivity Detection Tests', function ()
{
    this.afterEach(async () =>
    {
        // Reset the singleton so each test gets a fresh instance
        (WebRequestWorkerSingleton as any).instance = undefined;
    });

    test('isOnline returns false when fully offline (DNS + HTTP both blocked)', async () =>
    {
        const eventStream = new MockEventStream();

        // Reset singleton so the new instance is created while network is blocked
        (WebRequestWorkerSingleton as any).instance = undefined;

        const restoreNetwork = simulateOffline();
        try
        {
            const result = await WebRequestWorkerSingleton.getInstance().isOnline(5, eventStream);
            assert.isFalse(result, 'Should report offline when all network is blocked');

            const offlineEvent = eventStream.events.find(event => event instanceof OfflineDetectionLogicTriggered);
            assert.exists(offlineEvent, 'Should log an offline detection event for the DNS failure');
        }
        finally
        {
            restoreNetwork();
        }
    }).timeout(15000);

    test('isOnline returns true when DNS fails but HTTP succeeds (proxy environment)', async () =>
    {
        const eventStream = new MockEventStream();
        const restoreNetwork = simulateDnsOnlyFailure();
        try
        {
            const result = await WebRequestWorkerSingleton.getInstance().isOnline(5, eventStream);
            assert.isTrue(result, 'Should report online when DNS fails but HTTP HEAD succeeds');

            const dnsFailEvent = eventStream.events.find(event =>
                event instanceof OfflineDetectionLogicTriggered &&
                event.supplementalMessage.includes('DNS resolution failed'));
            assert.exists(dnsFailEvent, 'Should log a DNS failure event');

            const httpSuccessEvent = eventStream.events.find(event =>
                event instanceof OfflineDetectionLogicTriggered &&
                event.supplementalMessage.includes('HTTP connectivity confirmed'));
            assert.exists(httpSuccessEvent, 'Should log that HTTP fallback succeeded');
        }
        finally
        {
            restoreNetwork();
        }
    }).timeout(15000);

    test('isOnline returns true when DNS succeeds (normal environment)', async () =>
    {
        const eventStream = new MockEventStream();
        const result = await WebRequestWorkerSingleton.getInstance().isOnline(5, eventStream);
        assert.isTrue(result, 'Should report online when DNS resolves successfully');
    }).timeout(15000);

    test('isOnline returns false when DOTNET_INSTALL_TOOL_OFFLINE env var is set', async () =>
    {
        const eventStream = new MockEventStream();
        const originalEnv = process.env.DOTNET_INSTALL_TOOL_OFFLINE;
        process.env.DOTNET_INSTALL_TOOL_OFFLINE = '1';
        try
        {
            const result = await WebRequestWorkerSingleton.getInstance().isOnline(5, eventStream);
            assert.isFalse(result, 'Should report offline when DOTNET_INSTALL_TOOL_OFFLINE=1');
        }
        finally
        {
            if (originalEnv === undefined)
            {
                delete process.env.DOTNET_INSTALL_TOOL_OFFLINE;
            }
            else
            {
                process.env.DOTNET_INSTALL_TOOL_OFFLINE = originalEnv;
            }
        }
    }).timeout(5000);
});

import * as net from 'net';

/**
 * Starts a local HTTP CONNECT proxy server on a random port.
 * This proxy handles HTTPS tunneling (CONNECT method) by piping a raw TCP connection
 * between the client and the target host. The proxy itself speaks plain HTTP — the client
 * sends "CONNECT host:443 HTTP/1.1", the proxy opens a TCP socket to host:443, then pipes
 * bytes bidirectionally. TLS is negotiated end-to-end between the client and target server
 * (the proxy never sees decrypted traffic).
 *
 * @returns { server, port, close } — the server, its port, and a cleanup function.
 */
async function startLocalProxy(): Promise<{ server: http.Server; port: number; close: () => Promise<void> }>
{
    const server = http.createServer((_req, res) =>
    {
        // Reject non-CONNECT requests (we only support tunneling)
        res.writeHead(405);
        res.end('Only CONNECT is supported');
    });

    server.on('connect', (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) =>
    {
        const [host, portStr] = (req.url ?? '').split(':');
        const port = parseInt(portStr, 10) || 443;

        const targetSocket = net.connect(port, host, () =>
        {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            targetSocket.write(head);
            targetSocket.pipe(clientSocket);
            clientSocket.pipe(targetSocket);
        });

        targetSocket.on('error', () => clientSocket.destroy());
        clientSocket.on('error', () => targetSocket.destroy());
    });

    return new Promise((resolve) =>
    {
        server.listen(0, '127.0.0.1', () =>
        {
            const addr = server.address() as net.AddressInfo;
            resolve({
                server,
                port: addr.port,
                close: () => new Promise<void>((res) => server.close(() => res()))
            });
        });
    });
}

suite('Proxy-based Connectivity Tests', function ()
{
    let proxy: { server: http.Server; port: number; close: () => Promise<void> };
    let restoreDns: (() => void) | null = null;

    this.beforeEach(async () =>
    {
        proxy = await startLocalProxy();
    });

    this.afterEach(async () =>
    {
        if (restoreDns)
        {
            restoreDns();
            restoreDns = null;
        }
        (WebRequestWorkerSingleton as any).instance = undefined;
        await proxy.close();
    });

    test('isOnline returns true via proxy when DNS is blocked', async () =>
    {
        const eventStream = new MockEventStream();
        const proxyUrl = `http://127.0.0.1:${proxy.port}`;

        // Block DNS — simulates enterprise environment where client can't resolve external DNS
        restoreDns = simulateDnsOnlyFailure();

        const result = await WebRequestWorkerSingleton.getInstance().isOnline(10, eventStream, proxyUrl);
        assert.isTrue(result, 'Should report online when proxy handles the connection despite DNS failure');

        const httpSuccess = eventStream.events.find(event =>
            event instanceof OfflineDetectionLogicTriggered &&
            event.supplementalMessage.includes('HTTP connectivity confirmed'));
        assert.exists(httpSuccess, 'Should log that the HTTP fallback via proxy succeeded');
    }).timeout(15000);

    test('Web request succeeds through proxy when DNS is blocked', async () =>
    {
        const eventStream = new MockEventStream();
        const proxyUrl = `http://127.0.0.1:${proxy.port}`;
        const ctx = getMockAcquisitionContext('runtime', '', 30, eventStream);
        ctx.proxyUrl = proxyUrl;

        // Block DNS
        restoreDns = simulateDnsOnlyFailure();

        // Make a real web request through the proxy — this exercises the full getAxiosOptions → GetProxyAgentIfNeeded → HttpsProxyAgent chain
        const result = await WebRequestWorkerSingleton.getInstance().getCachedData(staticWebsiteUrl, ctx);
        assert.exists(result, 'Should receive data through the proxy even with DNS blocked');
        // The response is a JSON object (parsed by axios). Verify it contains expected structure.
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        assert.isTrue(resultStr.length > 0, 'Response should contain data');
        assert.include(resultStr, 'channel-version', 'Response should contain expected release metadata');
    }).timeout(30000);
});
