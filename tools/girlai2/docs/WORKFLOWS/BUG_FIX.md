# Bug Fix Workflow

Systematic approach to identifying, fixing, and verifying bugs.

## Phase 1: Bug Identification and Reproduction

### 1.1 Bug Report Analysis
- Understand the reported issue
- Identify affected components
- Determine severity (Critical, High, Medium, Low)
- Check if issue is already known

### 1.2 Reproduction
- Reproduce bug in development environment
- Identify steps to reproduce
- Test on different devices/platforms
- Check if bug occurs consistently or intermittently
- Document reproduction steps

### 1.3 Environment Check
- Verify environment (emulator vs production)
- Check Firebase configuration
- Verify dependencies are up to date
- Check for recent changes that might have introduced bug

## Phase 2: Root Cause Analysis

### 2.1 Investigation
- Review relevant code
- Check logs (DebugLogger, Firebase logs)
- Use debugging tools (MCP tools, Flutter DevTools)
- Check error messages and stack traces
- Review recent changes (git history)

### 2.2 Hypothesis Formation
- Form hypothesis about root cause
- Identify potential causes:
  - Logic errors
  - State management issues
  - Network/API issues
  - Data model mismatches
  - Race conditions
  - Memory leaks

### 2.3 Verification
- Test hypothesis
- Add temporary logging if needed
- Use breakpoints/debugger
- Verify hypothesis is correct

## Phase 3: Fix Implementation

### 3.1 Fix Strategy
- Determine fix approach
- Consider impact on other features
- Plan test strategy
- Document fix approach

### 3.2 Implementation
- Create bug fix branch: `git checkout -b fix/bug-description`
- Implement fix
- Follow code patterns
- Add error handling if needed
- Add logging if helpful

### 3.3 Code Quality
- Run linter: `flutter analyze`
- Format code: `dart format .`
- Review code against standards
- Ensure no new issues introduced

## Phase 4: Test Verification

### 4.1 Unit Tests
- Write/update unit tests for fix
- Test fix directly
- Test edge cases
- Ensure tests pass

### 4.2 Integration Tests
- Test fix in context of full flow
- Test with emulators
- Test on different devices
- Verify no regressions

### 4.3 Manual Testing
- Reproduce original bug (should be fixed)
- Test related functionality
- Test edge cases
- Test on iOS Simulator
- Test on physical device (if applicable)

### 4.4 Regression Testing
- Test related features
- Test similar scenarios
- Run full test suite
- Check for new issues

## Phase 5: Documentation and Cleanup

### 5.1 Documentation
- Document fix in commit message
- Update code comments if needed
- Update architecture docs if fix changes design
- Record in knowledge base (if significant)

### 5.2 Cleanup
- Remove temporary logging
- Remove debug code
- Clean up test code
- Remove unused imports

## Phase 6: Review and Merge

### 6.1 Code Review
- Self-review fix
- Ensure fix is minimal and focused
- Verify tests are adequate
- Check documentation

### 6.2 Merge
- Ensure all tests pass
- Merge bug fix branch
- Delete bug fix branch
- Monitor for issues

## Common Bug Categories

### Authentication Bugs
- Check AuthService state
- Verify Firebase Auth configuration
- Check emulator vs production
- Verify OTP flow
- Check error handling

### Chat Bugs
- Check ChatService state
- Verify Firestore subscription
- Check Cloud Function
- Verify message flow
- Check optimistic UI

### UI Bugs
- Check widget state
- Verify Provider updates
- Check navigation
- Verify error display
- Check loading states

### Performance Bugs
- Check for memory leaks
- Verify subscription disposal
- Check for unnecessary rebuilds
- Profile with Flutter DevTools
- Check Firestore query efficiency

### Network Bugs
- Check network connectivity
- Verify emulator configuration
- Check timeout settings
- Verify retry logic
- Check error handling

## Debugging Tools

### Flutter DevTools
- Widget inspector
- Performance profiler
- Memory profiler
- Network inspector

### MCP Tools
- `dart-mcp`: Code analysis
- `xcode-mcp`: Build debugging
- `flutter-docs`: Documentation lookup
- `mac-commander`: Device interaction

### Logging
- DebugLogger: Structured logging
- Firebase logs: Backend logs
- Console logs: Development logs

## Best Practices

### Investigation
- Start with logs
- Reproduce consistently
- Isolate the issue
- Test hypotheses systematically

### Fixing
- Fix root cause, not symptoms
- Keep fix minimal
- Don't introduce new issues
- Test thoroughly

### Testing
- Test fix directly
- Test related functionality
- Test edge cases
- Verify no regressions

### Documentation
- Document root cause
- Document fix approach
- Update tests
- Record in knowledge base if significant

## Checklist

- [ ] Bug reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Tests written/updated
- [ ] Fix verified
- [ ] No regressions
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] Merged
