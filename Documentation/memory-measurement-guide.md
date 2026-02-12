# Memory Measurement Guide for vscode-dotnet-runtime

This guide provides step-by-step instructions for measuring the memory usage of the vscode-dotnet-runtime extension.

## Prerequisites

- Visual Studio Code installed
- The vscode-dotnet-runtime extension installed (or built locally)
- Node.js installed (for running measurement scripts)
- Basic familiarity with VS Code extension development

## Method 1: VS Code Process Explorer (Quick & Easy)

This is the fastest way to get a basic memory reading.

### Steps

1. **Start VS Code**
   ```bash
   code
   ```

2. **Open Process Explorer**
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type and select: `Developer: Open Process Explorer`

3. **Find the Extension**
   - Look for the Extension Host process
   - Expand it to see individual extensions
   - Find `.NET Install Tool` or look for the extension's process

4. **Record Measurements**
   - Note the Memory (MB) column
   - Note the CPU (%) column
   - Take screenshots for documentation

5. **Compare Scenarios**

   **Scenario A: Baseline (Extension Disabled)**
   ```bash
   code --disable-extension ms-dotnettools.vscode-dotnet-runtime
   # Then open Process Explorer and note Extension Host memory
   ```

   **Scenario B: Extension Enabled (Idle)**
   ```bash
   code
   # Wait 30 seconds for activation
   # Then open Process Explorer and note memory
   ```

   **Scenario C: Extension Active (After Running Command)**
   ```bash
   code
   # Run: Ctrl+Shift+P → "Sample: Run a dynamically acquired .NET Core Hello World App"
   # Or in a dependent extension, trigger dotnet.acquire
   # Then check Process Explorer
   ```

### What to Look For

- **Extension Host Process**: Total memory used by all extensions
- **Individual Extension Memory**: Memory attributed to this extension specifically
- **Memory Delta**: Difference between Scenario A and B = This extension's base footprint
- **Memory Growth**: Difference between Scenario B and C = Memory used during operations

## Method 2: Node.js Memory Profiling (Detailed)

This method provides detailed heap information.

### Setup

Create a test file to measure memory:

**`memory-test.js`** (place in project root):
```javascript
const vscode = require('vscode');

// Format bytes to MB
function toMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(2);
}

// Get current memory usage
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        rss: toMB(usage.rss),
        heapTotal: toMB(usage.heapTotal),
        heapUsed: toMB(usage.heapUsed),
        external: toMB(usage.external),
        arrayBuffers: toMB(usage.arrayBuffers)
    };
}

// Print memory stats
function printMemory(label) {
    const mem = getMemoryUsage();
    console.log(`\n=== ${label} ===`);
    console.log(`RSS (Resident Set Size): ${mem.rss} MB`);
    console.log(`Heap Total: ${mem.heapTotal} MB`);
    console.log(`Heap Used: ${mem.heapUsed} MB`);
    console.log(`External: ${mem.external} MB`);
    console.log(`Array Buffers: ${mem.arrayBuffers} MB`);
}

// Force garbage collection (requires --expose-gc flag)
function forceGC() {
    if (global.gc) {
        console.log('Running garbage collection...');
        global.gc();
    } else {
        console.log('GC not available (run with --expose-gc)');
    }
}

async function measureExtensionMemory() {
    console.log('Starting memory measurement...');
    
    // Baseline
    forceGC();
    await new Promise(resolve => setTimeout(resolve, 1000));
    printMemory('Baseline (Before Extension Commands)');
    
    try {
        // Trigger extension activation if not already active
        console.log('\nTriggering extension activation...');
        await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        printMemory('After Extension Activation');
        
        // Try acquiring .NET (this will use cache if already installed)
        console.log('\nTesting dotnet.acquireStatus...');
        try {
            await vscode.commands.executeCommand('dotnet.acquireStatus', {
                version: '8.0',
                requestingExtensionId: 'memory-test'
            });
        } catch (e) {
            console.log('acquireStatus failed (expected if no installation):', e.message);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        printMemory('After dotnet.acquireStatus');
        
        // Force GC and measure again
        forceGC();
        await new Promise(resolve => setTimeout(resolve, 2000));
        printMemory('After Garbage Collection');
        
    } catch (error) {
        console.error('Error during measurement:', error);
    }
    
    console.log('\n=== Measurement Complete ===');
    console.log('Note: Run VS Code with --expose-gc flag for accurate GC measurements');
}

// Export for VS Code extension context
module.exports = { measureExtensionMemory };
```

### Running the Test

**Option A: In VS Code Extension Development Host**

1. Create a test extension or modify the sample:
   ```typescript
   // In sample/src/extension.ts, add a command:
   vscode.commands.registerCommand('sample.measureMemory', async () => {
       const measureScript = require('./memory-test.js');
       await measureScript.measureExtensionMemory();
   });
   ```

2. Press F5 to run Extension Development Host

3. In the new VS Code window:
   - Open the Command Palette
   - Run `Sample: Measure Memory`
   - Check the Debug Console for output

**Option B: In Functional Tests**

Add to `vscode-dotnet-runtime-extension/src/test/functional/`:

**`MemoryUsage.test.ts`**:
```typescript
/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Memory Usage Tests', () => {
    
    function getMemoryMB() {
        const usage = process.memoryUsage();
        return {
            rss: (usage.rss / 1024 / 1024).toFixed(2),
            heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2),
            heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2),
            external: (usage.external / 1024 / 1024).toFixed(2)
        };
    }
    
    function logMemory(label: string, mem: any) {
        console.log(`\n${label}:`);
        console.log(`  RSS: ${mem.rss} MB`);
        console.log(`  Heap Used: ${mem.heapUsed} MB`);
        console.log(`  Heap Total: ${mem.heapTotal} MB`);
        console.log(`  External: ${mem.external} MB`);
    }
    
    test('Measure baseline memory usage', async function() {
        this.timeout(30000);
        
        // Force GC if available
        if (global.gc) {
            global.gc();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const before = getMemoryMB();
        logMemory('Before Extension Activation', before);
        
        // Trigger extension activation
        await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const after = getMemoryMB();
        logMemory('After Extension Activation', after);
        
        const heapDiff = parseFloat(after.heapUsed) - parseFloat(before.heapUsed);
        console.log(`\nHeap increase: ${heapDiff.toFixed(2)} MB`);
        
        // This is informational, not an assertion
        assert(heapDiff >= 0, 'Heap usage should not decrease (unless GC ran)');
    });
    
    test('Measure memory during command execution', async function() {
        this.timeout(30000);
        
        if (global.gc) {
            global.gc();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const before = getMemoryMB();
        
        // Execute acquireStatus multiple times to test caching
        for (let i = 0; i < 10; i++) {
            try {
                await vscode.commands.executeCommand('dotnet.acquireStatus', {
                    version: '8.0',
                    requestingExtensionId: 'test-extension'
                });
            } catch (e) {
                // Expected to fail if not installed
            }
        }
        
        const after = getMemoryMB();
        logMemory('After 10 acquireStatus calls', after);
        
        const heapDiff = parseFloat(after.heapUsed) - parseFloat(before.heapUsed);
        console.log(`\nHeap increase: ${heapDiff.toFixed(2)} MB`);
        
        // Memory should not grow significantly with repeated calls (due to caching)
        // This is informational
        console.log(`Memory growth per call: ${(heapDiff / 10).toFixed(3)} MB`);
    });
    
    test('Measure memory after idle period', async function() {
        this.timeout(120000); // 2 minutes
        
        // Activate extension
        await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (global.gc) {
            global.gc();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const beforeIdle = getMemoryMB();
        logMemory('Before 60s idle', beforeIdle);
        
        // Wait 60 seconds
        console.log('\nWaiting 60 seconds...');
        await new Promise(resolve => setTimeout(resolve, 60000));
        
        const afterIdle = getMemoryMB();
        logMemory('After 60s idle', afterIdle);
        
        const heapDiff = parseFloat(afterIdle.heapUsed) - parseFloat(beforeIdle.heapUsed);
        console.log(`\nHeap change during idle: ${heapDiff.toFixed(2)} MB`);
        
        // Memory should not grow significantly during idle
        // This is informational, not a strict assertion
        if (Math.abs(heapDiff) > 5) {
            console.warn(`WARNING: Significant memory change during idle: ${heapDiff.toFixed(2)} MB`);
        }
    });
});
```

Run with:
```bash
cd vscode-dotnet-runtime-extension
npm run test
```

To enable GC profiling:
```bash
# Modify test script to pass --expose-gc
# Or set in .vscode/launch.json:
"runtimeArgs": ["--expose-gc"]
```

## Method 3: Heap Snapshot Analysis (Most Detailed)

This method provides the most detailed memory analysis.

### Steps

1. **Add Heap Snapshot Code** (temporary, for testing only):

   In `vscode-dotnet-runtime-extension/src/extension.ts`, add after activation completes:

   ```typescript
   // TEMPORARY - FOR MEMORY ANALYSIS ONLY
   if (process.env.DOTNET_MEMORY_PROFILING === 'true') {
       const v8 = require('v8');
       const path = require('path');
       
       setTimeout(() => {
           const snapshotPath = path.join(vsCodeContext.globalStoragePath, 'heap-after-activation.heapsnapshot');
           v8.writeHeapSnapshot(snapshotPath);
           console.log(`Heap snapshot written to: ${snapshotPath}`);
       }, 5000);
   }
   ```

2. **Run with profiling enabled**:
   ```bash
   DOTNET_MEMORY_PROFILING=true code
   ```

3. **Trigger extension activation** (wait 5 seconds)

4. **Find the snapshot**:
   - Check VS Code's output for the path
   - Usually in: `~/.config/Code/User/globalStorage/ms-dotnettools.vscode-dotnet-runtime/`

5. **Analyze in Chrome DevTools**:
   - Open Chrome browser
   - Open DevTools (F12)
   - Go to Memory tab
   - Click "Load" button
   - Select the .heapsnapshot file

6. **What to Look For in Chrome DevTools**:
   - **Summary view**: See largest objects by size
   - **Comparison view**: Compare two snapshots to see growth
   - **Containment view**: See object references
   - Search for specific objects:
     - `LocalMemoryCacheSingleton`
     - `WebRequestWorkerSingleton`
     - `EventStream`
     - `TelemetryObserver`

### Taking Multiple Snapshots for Comparison

```typescript
// Take snapshot after activation
const snap1 = v8.writeHeapSnapshot('heap-1-after-activation.heapsnapshot');

// Do some work
await vscode.commands.executeCommand('dotnet.acquire', {...});

// Take snapshot after work
const snap2 = v8.writeHeapSnapshot('heap-2-after-acquire.heapsnapshot');

// In Chrome DevTools:
// 1. Load both snapshots
// 2. Select snapshot 2
// 3. Change view from "Summary" to "Comparison"
// 4. Select snapshot 1 as baseline
// 5. See what objects were allocated between snapshots
```

## Method 4: Long-Running Session Test

This tests for memory leaks over time.

### Automated Script

Create `memory-leak-test.sh`:

```bash
#!/bin/bash

# Memory leak detection script for vscode-dotnet-runtime

echo "Starting memory leak test..."
echo "This will run for 30 minutes and measure memory every 5 minutes"

LOG_FILE="memory-leak-test-$(date +%Y%m%d-%H%M%S).log"

# Function to get memory usage
get_memory() {
    # Get VS Code extension host memory
    ps aux | grep "extensionHost" | grep -v grep | awk '{print $6}'
}

# Start VS Code in background
code --new-window &
CODE_PID=$!

sleep 10

# Take measurements
for i in {1..6}; do
    echo "=== Measurement $i at $(date) ===" | tee -a "$LOG_FILE"
    
    # Get memory
    MEM=$(get_memory)
    echo "Extension Host Memory: $MEM KB" | tee -a "$LOG_FILE"
    
    # Trigger some extension activity
    if [ $i -lt 6 ]; then
        # Run a command every measurement (except last)
        echo "Triggering extension command..." | tee -a "$LOG_FILE"
        # This would need to be done programmatically in a real test
        
        # Wait 5 minutes
        echo "Waiting 5 minutes..." | tee -a "$LOG_FILE"
        sleep 300
    fi
done

echo "Test complete. Results in $LOG_FILE"

# Kill VS Code
kill $CODE_PID 2>/dev/null
```

### Manual Steps

1. Open VS Code
2. Note memory usage in Process Explorer
3. Wait 5 minutes
4. Trigger a command: `dotnet.acquireStatus`
5. Note memory usage
6. Repeat steps 3-5 for 30 minutes
7. Plot memory usage over time

**Expected Result**: Memory should stabilize after initial spike. If memory continuously grows, there's likely a leak.

## Method 5: Compare Extension vs No Extension

This establishes the extension's actual footprint.

### Test Setup

**Test A: VS Code without Extension**
```bash
# Disable the extension
code --disable-extension ms-dotnettools.vscode-dotnet-runtime

# Wait 30 seconds
# Open Process Explorer
# Note Extension Host memory: X MB
```

**Test B: VS Code with Extension (Idle)**
```bash
# Enable the extension (default)
code

# Wait 30 seconds for activation
# Open Process Explorer
# Note Extension Host memory: Y MB
```

**Calculation**:
```
Extension Memory Footprint = Y - X
```

**Test C: VS Code with Extension (Active)**
```bash
# Enable the extension
code

# Run acquisition command
# Wait for completion
# Open Process Explorer
# Note Extension Host memory: Z MB
```

**Calculation**:
```
Activation Memory = Y - X
Active Memory = Z - Y
Total Extension Memory = Z - X
```

## Expected Results & Baselines

Based on the investigation, here are expected memory ranges:

| Scenario | Expected Memory (MB) | Acceptable Range | Warning Threshold |
|----------|---------------------|------------------|-------------------|
| Extension Not Loaded | 0 | 0 | N/A |
| After Activation (Idle) | 15-30 | 10-40 | >50 |
| During .NET Acquisition | 30-60 | 20-80 | >100 |
| After Acquisition (Settled) | 20-40 | 15-50 | >60 |
| After 1 Hour Idle | 20-40 | 15-50 | >60 (should not grow) |

### Memory Components Breakdown (Estimated)

| Component | Estimated Size | Notes |
|-----------|---------------|-------|
| Base Extension Code | 3-5 MB | Bundled JavaScript |
| Singletons (Caches) | 5-10 MB | Grows with usage |
| Event Stream | 2-5 MB | Observers and events |
| VS Code API Objects | 2-5 MB | Context, subscriptions |
| Node.js Overhead | 3-5 MB | V8, buffers |
| **Total** | **15-30 MB** | After activation |

## Troubleshooting

### "Cannot find module 'v8'" Error

The v8 module is built into Node.js, but may not be typed in older TypeScript:
```typescript
const v8 = require('v8'); // Use require instead of import
```

### GC Not Available

Run VS Code or tests with `--expose-gc`:
```bash
code --js-flags="--expose-gc"
```

Or in `launch.json`:
```json
{
    "runtimeArgs": ["--expose-gc"]
}
```

### Process Explorer Shows 0 for Extension

The extension might not be activated yet. Trigger activation:
```javascript
await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
```

### High Memory Numbers

Remember:
- **RSS (Resident Set Size)**: Total memory including shared libraries (higher)
- **Heap Used**: Actual JavaScript objects (more accurate for this extension)
- Process Explorer shows RSS by default

## Reporting Results

When reporting memory measurements, include:

1. **Environment**:
   - OS and version
   - VS Code version
   - Extension version
   - Node.js version (in VS Code: Help → About)

2. **Baseline**:
   - Memory without extension
   - Memory with extension (idle)

3. **Measurements**:
   - Memory during operations
   - Memory after GC
   - Memory trend over time

4. **Methodology**:
   - Which measurement method used
   - Steps to reproduce
   - Screenshots of Process Explorer

5. **Analysis**:
   - Memory delta from baseline
   - Growth rate (if any)
   - Suspected memory leaks
   - Performance impact

## Example Report Template

```markdown
## Memory Measurement Report

**Date**: 2026-02-11
**Tester**: [Your Name]
**Environment**:
- OS: macOS 14.0
- VS Code: 1.85.0
- Extension: vscode-dotnet-runtime 3.0.0
- Node.js: v20.x (in VS Code)

**Measurement Method**: VS Code Process Explorer

**Results**:

| Scenario | RSS (MB) | Heap Used (MB) |
|----------|----------|----------------|
| Baseline (No Extension) | 250 | 180 |
| After Activation | 280 | 200 |
| During Acquisition | 320 | 230 |
| After Acquisition | 285 | 205 |
| After 30 min Idle | 285 | 205 |

**Analysis**:
- Extension footprint: ~20 MB (heap)
- No memory growth during idle period
- Memory released after acquisition completes

**Conclusion**:
Memory usage is within expected range. No leaks detected.

**Screenshots**: [Attach screenshots]
```

---

## Next Steps After Measurement

1. **Compare to Baseline**: Are numbers within expected range (15-30 MB)?

2. **Identify Issues**:
   - Memory > 50 MB at idle → Investigate what's consuming memory
   - Memory growing over time → Likely memory leak
   - Memory not released after operations → Cache not expiring

3. **Profile Specific Components**:
   - Take heap snapshots before and after specific operations
   - Identify which singletons are largest
   - Check cache sizes

4. **Implement Optimizations**:
   - Start with high-priority optimizations from investigation document
   - Measure after each optimization
   - Ensure no performance regression

5. **Continuous Monitoring**:
   - Add memory telemetry to track in production
   - Set up alerts for memory anomalies
   - Regularly review memory usage

---

**Document Version**: 1.0  
**Date**: 2026-02-11  
**Purpose**: Practical guide for measuring vscode-dotnet-runtime memory usage
