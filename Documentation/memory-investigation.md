# Memory Usage Investigation for vscode-dotnet-runtime Extension

## Executive Summary

This document provides a comprehensive investigation into the RAM/memory consumption of the vscode-dotnet-runtime extension. The goal is to identify memory-intensive components, measure current usage, and provide recommendations for optimization without implementing changes at this stage.

## Current Architecture Overview

### Extension Activation

The extension uses **`onStartupFinished`** activation event, which means:
- The extension activates automatically after VS Code starts up (with a delay to avoid impacting startup performance)
- All initialization code runs at activation time, regardless of whether the user needs .NET functionality
- Memory is allocated upfront for all services and singletons

### Key Components

#### 1. **Singletons** (High Memory Impact)

The extension uses several singleton patterns that persist throughout the VS Code session:

##### `LocalMemoryCacheSingleton`
- **Purpose**: Caches command execution results and web request data
- **Library**: Uses `node-cache` (5.1.2)
- **Memory Impact**: HIGH
  - Stores cached data with configurable TTL (default 2 minutes for web requests, 5 seconds for commands)
  - Cache size grows with usage
  - Configurable multiplier: `cacheTimeToLiveMultiplier` setting (default: 1)
- **Location**: `vscode-dotnet-runtime-library/src/LocalMemoryCacheSingleton.ts`
- **Current Implementation**:
  ```typescript
  protected cache: nodeCache = new nodeCache();
  private commandRootAliases: Map<string, string> = new Map<string, string>();
  ```

##### `WebRequestWorkerSingleton`
- **Purpose**: HTTP client for downloading .NET and making API requests
- **Libraries**: 
  - `axios` (1.13.2) - HTTP client
  - `axios-cache-interceptor` (1.11.2 in extension, 1.8.3 in library) - Response caching
  - `axios-retry` (3.9.1) - Retry logic
  - `https-proxy-agent` (7.0.6) - Proxy support
- **Memory Impact**: HIGH
  - Maintains Axios instance with interceptors throughout session
  - Uses in-memory storage for caching: `buildMemoryStorage()`
  - Default cache TTL: 2 minutes (120,000ms)
  - Stores timing data for performance telemetry
  - Proxy agent instances
- **Location**: `vscode-dotnet-runtime-library/src/Utils/WebRequestWorkerSingleton.ts`
- **Current Implementation**:
  ```typescript
  private client: AxiosCacheInstance | null;
  storage: buildMemoryStorage(),
  ttl: 120000 // 2 Minute TTL
  ```

##### `InstallTrackerSingleton`
- **Purpose**: Tracks all .NET installations managed by the extension
- **Memory Impact**: MEDIUM
  - Stores installation records in memory
  - Persists to VS Code global state
  - Grows with number of installations across all extensions
- **Location**: `vscode-dotnet-runtime-library/src/Acquisition/InstallTrackerSingleton.ts`

#### 2. **Event Stream Architecture** (Medium Memory Impact)

The extension uses an event-driven architecture with multiple observers:

##### Event Stream Components
- **`EventStream`**: Central event bus that dispatches events to observers
- **`TelemetryObserver`**: Collects and sends telemetry data (uses `@vscode/extension-telemetry` 0.9.9)
- **`OutputChannelObserver`**: Manages VS Code output channel
- **`LoggingObserver`**: File-based logging to extension log path
- **`StatusBarObserver`**: Updates VS Code status bar

##### Memory Considerations
- Each observer maintains state and event history
- Telemetry observer buffers events before sending
- Logging observer keeps file handles
- Event objects are created frequently and may accumulate

#### 3. **Large Dependencies** (High Impact on Bundle Size)

##### Runtime Dependencies (from package.json analysis):

**Extension-level** (vscode-dotnet-runtime-extension/package.json):
- `axios` (1.13.2): ~50KB bundled
- `axios-cache-interceptor` (1.11.2): ~30KB
- `axios-retry` (3.9.1): ~10KB
- `https-proxy-agent` (7.0.6): ~20KB
- `mocha` (11.7.5): Should be devDependency, currently in dependencies (~500KB)
- `chai` (4.3.4): Should be devDependency (~100KB)
- `@vscode/test-electron` (2.5.2): Should be devDependency (~2MB)

**Library-level** (vscode-dotnet-runtime-library/package.json):
- `node-cache` (5.1.2): ~15KB
- `lodash` (4.17.21): ~70KB (if fully bundled, can be tree-shaken)
- `semver` (7.6.2): ~20KB
- `@vscode/extension-telemetry` (0.9.9): ~150KB+
- `get-proxy-settings` (0.1.13): ~50KB (includes native modules)

**Total estimated bundle size**: ~3-4 MB (including test dependencies that shouldn't be bundled)

#### 4. **Activation Behavior** (High Impact)

At activation time (`activate()` function), the extension:

1. **Reads configuration** (~1KB memory)
   - `installTimeoutValue`, `enableTelemetry`, `existingDotnetPath`, etc.

2. **Initializes singletons** (~5-10MB total)
   - `LocalMemoryCacheSingleton`
   - `WebRequestWorkerSingleton`
   - `InstallTrackerSingleton`

3. **Creates event stream infrastructure** (~2-5MB)
   - 4-5 observer instances
   - Event stream with buffering

4. **Registers command handlers** (~1-2MB)
   - 12+ VS Code commands registered
   - Each command handler holds references to workers and context

5. **Starts automatic update service** (~1-2MB)
   - `LocalInstallUpdateService` for checking runtime updates
   - Periodic timer (default: every 300 seconds)

6. **Creates worker classes** (~5-10MB total)
   - `DotnetCoreAcquisitionWorker`
   - `VersionResolver`
   - `GlobalInstallerResolver`
   - `ExistingPathResolver`
   - And many others

**Total estimated activation memory**: 15-30 MB immediately after activation

## Memory Leak Risk Areas

### 1. Event Stream Accumulation
- **Risk Level**: MEDIUM
- Events are posted throughout the extension lifecycle
- If event history is retained without bounds, memory can grow over time
- Telemetry observer may buffer events if sending fails

### 2. Cache Growth
- **Risk Level**: MEDIUM
- `LocalMemoryCacheSingleton` and `WebRequestWorkerSingleton` caches grow with usage
- Default TTLs (2 minutes) mean data persists even after operations complete
- Cache invalidation relies on TTL expiration, not manual cleanup
- `node-cache` library handles expiration, but memory isn't immediately freed

### 3. Command Handler Closures
- **Risk Level**: LOW-MEDIUM
- Each registered command creates a closure over `acquireLocal`, `uninstall`, etc.
- These closures capture all activation-time variables
- May prevent garbage collection of unused objects

### 4. Timer References
- **Risk Level**: LOW
- `LocalInstallUpdateService` uses `setTimeout` for periodic updates
- Timer should be cleared in deactivate, but extension doesn't export `deactivate()` function

### 5. Observer State
- **Risk Level**: LOW
- Observers may retain references to old events or state
- File handles in `LoggingObserver` if not properly closed

## Measurement Methodology

### Recommended Approach for Measuring Current Memory Usage

#### 1. VS Code Process Inspector Method

**Step 1**: Measure baseline (extension not activated)
```bash
# Start VS Code with the extension disabled
code --disable-extension ms-dotnettools.vscode-dotnet-runtime
```

**Step 2**: Measure with extension activated
```bash
# Start VS Code normally
code
# Open Command Palette: Developer: Show Running Extensions
# Find "ms-dotnettools.vscode-dotnet-runtime"
# Note: Activation time and whether it's activated
```

**Step 3**: Use VS Code's built-in Process Explorer
```
Command Palette → Developer: Open Process Explorer
```
This shows:
- Memory usage per extension
- CPU usage
- Process tree

#### 2. Node.js Heap Snapshot Method

Add temporary profiling code:

```typescript
// In extension.ts activate() function - TEMPORARY ONLY
const v8 = require('v8');
const fs = require('fs');

// After all initialization
setTimeout(() => {
  const heapSnapshot = v8.writeHeapSnapshot();
  console.log(`Heap snapshot written to: ${heapSnapshot}`);
}, 5000); // 5 seconds after activation
```

Then analyze with Chrome DevTools:
1. Open Chrome → DevTools → Memory tab
2. Load heap snapshot
3. Inspect retained objects

#### 3. VS Code Extension Host Memory Profiling

Use VS Code's built-in profiling:

```bash
# Start with performance flags
code --inspect-extensions=9229
```

Then attach Chrome DevTools to port 9229 and use Memory profiler.

#### 4. Automated Test-Based Measurement

Create a functional test that:
1. Activates the extension
2. Captures `process.memoryUsage()` before and after
3. Exercises key commands (acquire, uninstall, etc.)
4. Captures memory after each operation
5. Waits for GC and measures retained memory

Example test structure:
```typescript
suite('Memory Usage Tests', () => {
  test('Measure activation memory', async () => {
    const before = process.memoryUsage();
    // Trigger activation
    await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
    
    // Force GC if available
    if (global.gc) global.gc();
    
    const after = process.memoryUsage();
    const heapDiff = after.heapUsed - before.heapUsed;
    console.log(`Heap increase: ${(heapDiff / 1024 / 1024).toFixed(2)} MB`);
  });
});
```

#### 5. Compare Extension vs Non-Extension Scenarios

**Scenario A**: VS Code without extension
- Open a TypeScript/C# project
- Measure extension host process memory after 5 minutes

**Scenario B**: VS Code with extension (not used)
- Extension activates but no .NET acquisition commands run
- Measure after 5 minutes

**Scenario C**: VS Code with extension (actively used)
- Run acquisition commands
- Measure during and after operations

### Memory Profiling Tools

1. **VS Code Built-in**:
   - Process Explorer (Shift+Cmd+P → "Developer: Open Process Explorer")
   - Performance markers
   - Extension activation timing

2. **Node.js Tools**:
   - `process.memoryUsage()` - Heap used, RSS, external memory
   - `v8.getHeapStatistics()` - Detailed heap info
   - `v8.writeHeapSnapshot()` - Full heap dump

3. **Chrome DevTools**:
   - Memory profiler with heap snapshots
   - Allocation timeline
   - Object retention analysis

4. **Extension-specific**:
   - VS Code Extension Bisect to isolate this extension's impact
   - Compare with/without this extension enabled

## Optimization Recommendations

### High-Priority Optimizations (Significant Impact)

#### 1. **Lazy Activation** ⭐⭐⭐
**Current**: `onStartupFinished` - activates automatically
**Proposed**: Change to command-based activation
```json
"activationEvents": [
  "onCommand:dotnet.acquire",
  "onCommand:dotnet.acquireStatus",
  "onCommand:dotnet.findPath",
  // ... other commands
]
```
**Impact**: 
- 15-30 MB saved if extension never used
- Faster VS Code startup
- Memory only allocated when needed

**Trade-offs**:
- Other extensions that depend on this extension would trigger activation anyway
- Automatic update checks wouldn't run until first use

#### 2. **Move Test Dependencies to devDependencies** ⭐⭐⭐
**Issue**: Test libraries are in runtime dependencies
```json
"dependencies": {
  "mocha": "^11.7.0",  // ❌ Should be devDependency
  "chai": "4.3.4",     // ❌ Should be devDependency
  "@vscode/test-electron": "^2.3.9", // ❌ Should be devDependency
}
```
**Impact**: 
- 2-3 MB saved from bundle
- Faster extension load time

**Fix**: Move to devDependencies and ensure webpack externals configured correctly

#### 3. **Implement Cache Size Limits** ⭐⭐⭐
**Current**: Caches grow unbounded (with TTL)
**Proposed**:
```typescript
// LocalMemoryCacheSingleton
protected cache: nodeCache = new nodeCache({
  stdTTL: 120,
  maxKeys: 100  // Limit cache entries
});
```
**Impact**: 
- Prevents cache from growing beyond reasonable size
- 1-5 MB saved depending on usage

#### 4. **Lazy Load Heavy Dependencies** ⭐⭐
**Current**: All imports at module top level
**Proposed**: Dynamic imports for rarely-used features
```typescript
// Instead of: import * as open from 'open';
// Use when needed:
const open = await import('open');
```
**Candidates for lazy loading**:
- `open` - Only used for reportIssue command
- Some acquisition workers - Only when specific commands run

**Impact**: 
- 2-5 MB saved in typical use cases
- Slightly slower first command execution

### Medium-Priority Optimizations (Moderate Impact)

#### 5. **Optimize Event Observer Lifecycle** ⭐⭐
**Current**: All observers created at activation
**Proposed**: 
- Make output channel lazy (create only when first log happens)
- Telemetry observer only if telemetry enabled
- Status bar observer only when progress shown

**Impact**: 1-3 MB saved

#### 6. **Tree-shake Lodash** ⭐⭐
**Current**: May be importing entire lodash library
**Proposed**: Use individual lodash packages or direct imports
```typescript
// Instead of: import * as _ from 'lodash';
// Use: import cloneDeep from 'lodash/cloneDeep';
```
**Impact**: 30-50 KB saved

#### 7. **Reduce Cache TTLs** ⭐
**Current**: 2-minute web request cache, 5-second command cache
**Proposed**: Make configurable with lower defaults
- Web requests: 30 seconds (still effective for multiple rapid calls)
- Commands: 2 seconds

**Impact**: Faster memory reclamation, 0.5-2 MB saved

#### 8. **Implement Deactivate Function** ⭐
**Current**: No `deactivate()` export
**Proposed**: Proper cleanup on extension deactivation
```typescript
export function deactivate() {
  // Clear timers
  // Flush caches
  // Close file handles
  // Dispose command registrations
}
```
**Impact**: 
- Proper memory cleanup when extension disabled
- Prevents potential memory leaks

### Low-Priority Optimizations (Small Impact)

#### 9. **Optimize Singleton Creation** ⭐
Don't create singletons until first use:
```typescript
// Lazy singleton initialization
private static _instance: LocalMemoryCacheSingleton | undefined;
public static getInstance(): LocalMemoryCacheSingleton {
  if (!this._instance) {
    this._instance = new LocalMemoryCacheSingleton();
  }
  return this._instance;
}
```

#### 10. **Review Event Object Creation**
Events are created frequently. Consider:
- Object pooling for common events
- Simpler event structures
- Conditional creation (only if observers exist)

## Comparison Table: Expected Memory Savings

| Optimization | Estimated Savings | Implementation Difficulty | User Impact |
|-------------|------------------|------------------------|-------------|
| Lazy Activation | 15-30 MB | Easy | None (for users who don't use .NET) |
| Fix Dependencies | 2-3 MB | Easy | None |
| Cache Limits | 1-5 MB | Easy | None (with good limits) |
| Lazy Load Deps | 2-5 MB | Medium | Minimal (slight delay first use) |
| Observer Lifecycle | 1-3 MB | Medium | None |
| Tree-shake Lodash | 0.03-0.05 MB | Easy | None |
| Reduce Cache TTL | 0.5-2 MB | Easy | Potential performance impact |
| Deactivate Function | Variable | Easy | Better cleanup |
| Lazy Singletons | 0.5-1 MB | Easy | None |
| Event Optimization | 0.1-0.5 MB | Hard | None |

**Total Potential Savings**: 22-50 MB (depending on which optimizations implemented)

## Testing Plan for Memory Optimizations

### 1. Baseline Measurements (Before Optimization)

Test cases to establish baseline:

**TC1: Fresh Activation**
1. Start VS Code with extension
2. Measure memory after 30 seconds
3. Record: Heap used, RSS, External

**TC2: Idle Memory**
1. Leave VS Code open for 30 minutes without using .NET commands
2. Measure every 5 minutes
3. Record: Memory trend (stable, growing, shrinking)

**TC3: Single Acquisition**
1. Run `dotnet.acquire` for .NET 8.0
2. Measure before, during download, after completion
3. Wait 5 minutes and measure again

**TC4: Multiple Acquisitions**
1. Run `dotnet.acquire` for 5 different versions sequentially
2. Measure after each
3. Force GC and measure final state

**TC5: Repeated Commands**
1. Run `dotnet.acquireStatus` 100 times
2. Measure cache growth
3. Wait for TTL expiration and measure

**TC6: Long Session**
1. Keep VS Code open with extension for 8 hours
2. Periodically run commands
3. Measure memory growth rate

### 2. Post-Optimization Measurements

Repeat all baseline tests and compare:
- Absolute memory usage
- Memory growth rate
- Peak memory during operations
- Memory retained after operations

### 3. Performance Regression Testing

Ensure optimizations don't harm performance:
- Acquisition time (should not increase significantly)
- Command response time
- Cache hit rates
- User-perceived delays

### 4. Functional Regression Testing

Run full test suite to ensure:
- All commands still work
- Caching still effective
- Telemetry still collected
- Error handling unchanged

### 5. Real-World Scenario Testing

**Scenario A**: C# Developer Daily Workflow
- Open C# project
- Extension activates
- Acquisition happens automatically
- Memory usage throughout day

**Scenario B**: Extension Developer Using API
- Other extension calls `dotnet.acquire`
- Multiple versions requested
- Memory during and after

**Scenario C**: Multiple Extensions Using .NET
- Multiple extensions depend on this one
- Each requests different versions
- Memory with concurrent requests

## Monitoring Recommendations

### Metrics to Track

1. **Extension Activation Time**
   - Current: Likely 100-500ms
   - Goal: <100ms or lazy activation

2. **Peak Memory Usage**
   - During activation
   - During acquisition
   - After 1 hour idle

3. **Memory Growth Rate**
   - Bytes per hour during idle
   - Should be near zero after initial period

4. **Cache Hit Rates**
   - Web request cache effectiveness
   - Command cache effectiveness

5. **Bundle Size**
   - Current: ~3-4 MB
   - Goal: <2 MB

### Telemetry Events to Add

Consider adding memory-related telemetry:
```typescript
// Memory usage after activation
telemetry.sendTelemetryEvent('extension.activated', {
  heapUsedMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
  activationTimeMs: activationTime.toString()
});

// Memory during acquisition
telemetry.sendTelemetryEvent('acquisition.complete', {
  heapUsedMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
  version: version,
  duration: duration
});
```

## Technical Debt Related to Memory

### Current Issues

1. **No deactivate function**: Memory not cleaned up when extension disabled
2. **Unbounded caches**: Can grow large with heavy usage
3. **Eager initialization**: Everything created at activation
4. **Test deps in bundle**: Unnecessary code shipped to users
5. **No memory metrics**: Can't track memory issues in production
6. **Singleton lifecycle**: No way to reset or clear singletons

### Architecture Considerations

1. **Singleton Pattern**: Convenient but holds memory for lifetime of process
   - Alternative: Service instances that can be disposed
   - Alternative: WeakMap-based caching

2. **Event Stream**: Elegant but every event creates objects
   - Alternative: Event pooling
   - Alternative: Lazy event creation

3. **Always-On Design**: Extension ready immediately
   - Alternative: Lazy initialization on-demand
   - Alternative: Partial activation (only critical parts)

## Conclusion

### Key Findings

1. **Current Estimated Memory Footprint**: 15-30 MB at activation, may grow to 30-50 MB with usage
2. **Biggest Memory Consumers**: 
   - Singletons (caches and HTTP client): 5-10 MB
   - Event stream infrastructure: 2-5 MB
   - Unnecessary test dependencies: 2-3 MB
   - Activation-time object creation: 5-10 MB

3. **Memory Leak Risks**: 
   - Medium risk from cache growth
   - Low risk from event accumulation
   - Low risk from timer references

### Recommended Action Plan

**Phase 1 - Quick Wins** (Easy, High Impact)
1. Move test dependencies to devDependencies
2. Implement cache size limits
3. Add deactivate function
4. Establish baseline memory measurements

**Phase 2 - Architectural Changes** (Medium Difficulty, High Impact)
5. Evaluate lazy activation strategy
6. Implement lazy loading for heavy dependencies
7. Optimize observer lifecycle
8. Add memory telemetry

**Phase 3 - Advanced Optimizations** (Harder, Lower Impact)
9. Event system optimization
10. Tree-shake dependencies
11. Singleton lifecycle improvements

### Estimated Total Impact

Implementing Phase 1 & 2 recommendations could reduce memory usage by:
- **Immediate savings**: 5-10 MB from fixing dependencies and cache limits
- **Conditional savings**: 15-30 MB from lazy activation (when extension not actively used)
- **Long-term savings**: Better memory stability over long VS Code sessions

### Next Steps

1. **Baseline Measurement**: Run the measurement methodology to get actual numbers
2. **Prioritization**: Decide which optimizations to implement based on real data
3. **Implementation**: Make changes incrementally with measurements between each
4. **Validation**: Confirm memory improvements and no performance regressions
5. **Monitoring**: Add telemetry to track memory usage in production

---

**Document Version**: 1.0  
**Date**: 2026-02-11  
**Status**: Investigation Phase - No Implementation Yet
