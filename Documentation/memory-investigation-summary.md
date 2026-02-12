# Memory/RAM Investigation Summary

## Overview

This folder contains the results of a comprehensive investigation into the RAM/memory consumption of the vscode-dotnet-runtime extension, conducted in February 2026. The investigation focused on understanding current memory usage, identifying optimization opportunities, and establishing measurement methodologies.

## Documents in this Investigation

### 1. [memory-investigation.md](./memory-investigation.md)
**Primary Investigation Document**

This comprehensive document covers:
- Detailed architecture analysis of memory-consuming components
- Analysis of singletons, event streams, and dependencies
- Memory leak risk assessment
- Specific optimization recommendations with estimated impact
- Testing plan for validating optimizations
- Comparison tables and technical debt analysis

**Key Finding**: Extension uses an estimated 15-30 MB at activation, potentially growing to 30-50 MB with usage.

**Top Recommendations**:
1. **Lazy Activation** (15-30 MB savings): Change from `onStartupFinished` to command-based activation
2. **Fix Dependencies** (2-3 MB savings): Move test libraries from dependencies to devDependencies
3. **Cache Limits** (1-5 MB savings): Implement maximum cache sizes
4. **Lazy Load Heavy Dependencies** (2-5 MB savings): Dynamic imports for rarely-used features

**Total Potential Savings**: 22-50 MB depending on optimizations implemented

### 2. [memory-measurement-guide.md](./memory-measurement-guide.md)
**Practical Measurement Guide**

Step-by-step instructions for measuring memory usage using various methods:
- **Method 1**: VS Code Process Explorer (Quick & Easy)
- **Method 2**: Node.js Memory Profiling (Detailed)
- **Method 3**: Heap Snapshot Analysis (Most Detailed)
- **Method 4**: Long-Running Session Test (Leak Detection)
- **Method 5**: Compare Extension vs No Extension (Baseline)

Includes:
- Ready-to-use test scripts
- Expected baselines and acceptable ranges
- Troubleshooting tips
- Report templates

**Purpose**: Enable anyone to reproduce memory measurements and validate optimizations.

## Quick Reference: Memory Profile

### Current State (Estimated)

| Component | Memory Usage | Notes |
|-----------|-------------|--------|
| Base Extension Code | 3-5 MB | Bundled JavaScript |
| Singletons (Caches & HTTP Client) | 5-10 MB | `LocalMemoryCacheSingleton`, `WebRequestWorkerSingleton` |
| Event Stream Infrastructure | 2-5 MB | 4-5 observers, event buffering |
| VS Code API Objects | 2-5 MB | Context, command registrations |
| Node.js Overhead | 3-5 MB | V8 engine, buffers |
| **Total at Activation** | **15-30 MB** | Before any .NET acquisition |
| **Total with Usage** | **30-50 MB** | After multiple acquisitions |

### Memory Consumers (By Priority)

1. **HIGH**: Axios cache with in-memory storage (2-minute TTL)
2. **HIGH**: LocalMemoryCacheSingleton with node-cache (unbounded)
3. **HIGH**: Test dependencies incorrectly in runtime deps (mocha, chai, @vscode/test-electron)
4. **MEDIUM**: Event observers and telemetry buffering
5. **MEDIUM**: Lodash (if not tree-shaken)
6. **LOW**: Event object creation throughout lifecycle

### Memory Leak Risks

- **Medium Risk**: Cache growth without size limits
- **Medium Risk**: Event accumulation if not properly managed
- **Low Risk**: Timer references (missing deactivate function)
- **Low Risk**: Observer state retention

## Recommended Next Steps

### Phase 1: Measurement (Do First)
1. Run measurement methodology to establish actual baseline
2. Measure memory before and after activation
3. Measure memory during and after .NET acquisition
4. Test for memory growth during idle period
5. Document findings and compare to estimated ranges

### Phase 2: Quick Wins (Easy Implementations)
1. Move test dependencies to devDependencies
2. Implement cache size limits on singletons
3. Add deactivate function for proper cleanup
4. Add memory telemetry for production monitoring

### Phase 3: Architectural Improvements (More Involved)
1. Evaluate lazy activation strategy (command-based vs onStartupFinished)
2. Implement lazy loading for heavy dependencies
3. Optimize observer lifecycle (lazy creation)
4. Review and optimize singleton lifecycle management

### Phase 4: Validation
1. Re-measure memory after each optimization
2. Run functional tests to ensure no regressions
3. Compare performance metrics
4. Validate in real-world scenarios

## Key Findings Summary

### Strengths
- Well-architected with clear separation of concerns
- Uses caching effectively for performance
- Event-driven architecture is elegant and maintainable

### Areas for Improvement
1. **Activation Strategy**: Always-on activation loads everything upfront
2. **Cache Management**: No size limits on caches, relies only on TTL
3. **Dependency Management**: Test libraries in production bundle
4. **Lifecycle Management**: No deactivate function for cleanup
5. **Monitoring**: No memory telemetry in production

### No Critical Issues Found
- No obvious memory leaks detected in code review
- Architecture follows VS Code best practices
- Memory usage appears reasonable for extension functionality
- Optimizations are "nice to have" rather than urgent fixes

## Impact Assessment

### User Impact

**Current State**:
- Extension contributes ~15-30 MB to VS Code memory footprint
- This is relatively small compared to full VS Code process (~200-500 MB)
- Most users won't notice memory impact

**If Optimizations Implemented**:
- Users who never use .NET: 15-30 MB saved (with lazy activation)
- Users who actively use .NET: 5-10 MB saved
- All users: More stable long-term memory profile

### Performance Impact

**Current State**:
- Fast activation due to upfront loading
- Effective caching improves command response times
- No user-reported performance issues

**If Optimizations Implemented**:
- Lazy activation: Slight delay on first command (acceptable)
- Lazy loading: Minor delay loading heavy features first time
- Cache limits: Potential small performance regression with lower hit rates
- Overall: Minimal performance impact with proper tuning

## Comparison to Similar Extensions

For context, typical VS Code extension memory usage:

| Extension Type | Typical Memory | Example |
|----------------|----------------|---------|
| Simple Extension | 1-5 MB | Bracket colorizer |
| Medium Extension | 5-15 MB | GitLens |
| Language Extension | 15-50 MB | Python, C# |
| Heavy Extension | 50-200 MB | C# DevKit, GitHub Copilot |

**This Extension**: 15-30 MB (activation) → **Medium Extension** category ✓

This is **reasonable and acceptable** for an extension that:
- Downloads and manages .NET installations
- Provides API surface for other extensions
- Maintains caches for performance
- Implements telemetry and logging
- Resolves versions from web APIs

## Testing Checklist

Before implementing any optimizations, establish baselines:

- [ ] Measure memory with VS Code Process Explorer
- [ ] Run Node.js memory profiling test
- [ ] Take heap snapshot and analyze in Chrome DevTools
- [ ] Test memory growth over 1-hour session
- [ ] Compare extension vs no-extension baseline
- [ ] Document findings with screenshots
- [ ] Identify any unexpected memory usage
- [ ] Validate that memory falls within expected ranges

After implementing optimizations:

- [ ] Re-run all baseline measurements
- [ ] Compare before/after memory usage
- [ ] Verify memory savings match estimates
- [ ] Run full functional test suite
- [ ] Test performance (ensure no regression)
- [ ] Test in real-world scenarios
- [ ] Update documentation with new baselines

## Files Added

This investigation added the following files to the Documentation/ folder:

1. **memory-investigation.md** (20KB)
   - Comprehensive technical investigation
   - Architecture analysis
   - Optimization recommendations

2. **memory-measurement-guide.md** (19KB)
   - Step-by-step measurement instructions
   - Test scripts and code examples
   - Expected results and baselines

3. **memory-investigation-summary.md** (this file)
   - Executive summary
   - Quick reference
   - Action plan

**Total**: ~40KB of documentation (minimal impact)

## Conclusion

The vscode-dotnet-runtime extension has a **reasonable memory footprint** for its functionality. The investigation identified several optimization opportunities that could reduce memory usage by 22-50 MB if implemented, but none are critical issues.

### Primary Recommendations (In Priority Order)

1. **Measure First**: Establish actual baseline before optimizing
2. **Quick Wins**: Fix test dependencies and add cache limits
3. **Consider Lazy Activation**: Evaluate trade-offs for command-based activation
4. **Add Monitoring**: Implement memory telemetry for production insights
5. **Iterative Improvement**: Make changes incrementally with measurements

### Not Recommended at This Time

- Major architectural rewrites (current architecture is sound)
- Aggressive performance optimizations that harm maintainability
- Removing caching (critical for performance)
- Changes without measurement validation

---

## Additional Resources

- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Node.js Memory Management](https://nodejs.org/en/docs/guides/simple-profiling/)
- [V8 Heap Snapshots](https://developer.chrome.com/docs/devtools/memory-problems/)
- [VS Code Performance Issues](https://github.com/microsoft/vscode/wiki/Performance-Issues)

## Questions?

For questions about this investigation:
1. Review the detailed investigation document
2. Try the measurement guide to reproduce findings
3. Open an issue on GitHub with specific questions
4. Tag the investigation in PR discussions

---

**Investigation Date**: February 2026  
**Status**: Investigation Complete - No Implementation Yet  
**Next Step**: Measure actual baseline using provided guides  
**Document Version**: 1.0
