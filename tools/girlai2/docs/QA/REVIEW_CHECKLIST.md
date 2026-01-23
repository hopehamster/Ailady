# Code Review Checklist

Comprehensive checklist for code reviews.

## General

- [ ] Code follows Flutter/Dart style guide
- [ ] Code is formatted (`dart format`)
- [ ] Linter passes (`flutter analyze`)
- [ ] No debug code
- [ ] No commented-out code
- [ ] No TODO/FIXME without issue tracking
- [ ] Code is readable and maintainable

## Architecture

- [ ] Follows project patterns
- [ ] Uses appropriate design patterns
- [ ] Service layer properly structured
- [ ] State management appropriate
- [ ] Dependencies properly injected
- [ ] No circular dependencies

## Code Quality

- [ ] Functions are small (<100 lines)
- [ ] Classes are focused (single responsibility)
- [ ] No code duplication
- [ ] Meaningful variable names
- [ ] No magic numbers (use constants)
- [ ] Proper error handling
- [ ] Proper logging

## Error Handling

- [ ] Errors are handled appropriately
- [ ] User-friendly error messages
- [ ] Errors logged via DebugLogger
- [ ] No sensitive information exposed
- [ ] Retry logic for transient failures
- [ ] Error handlers used (AuthErrorHandler, ChatErrorHandler)

## State Management

- [ ] Provider used appropriately
- [ ] State minimized
- [ ] Subscriptions disposed
- [ ] No unnecessary rebuilds
- [ ] State updates via notifyListeners()

## Testing

- [ ] Unit tests written
- [ ] Widget tests written (if UI)
- [ ] Integration tests written (if flow)
- [ ] Tests pass
- [ ] Edge cases tested
- [ ] Error cases tested
- [ ] Coverage adequate (>80%)

## Performance

- [ ] No memory leaks
- [ ] Subscriptions disposed
- [ ] Efficient queries
- [ ] No unnecessary rebuilds
- [ ] Images cached appropriately
- [ ] Const constructors used

## Security

- [ ] No sensitive data in code
- [ ] API keys not hardcoded
- [ ] Input validation
- [ ] Authentication checked
- [ ] Firestore rules appropriate
- [ ] No sensitive data in logs

## Documentation

- [ ] Public APIs documented
- [ ] Complex logic commented
- [ ] Architecture docs updated (if needed)
- [ ] Data flow docs updated (if needed)
- [ ] Service interaction docs updated (if needed)

## UI/UX

- [ ] User-friendly interface
- [ ] Error states handled
- [ ] Loading states shown
- [ ] Responsive design
- [ ] Accessibility considered

## Integration

- [ ] Integrates correctly with existing code
- [ ] No breaking changes (or documented)
- [ ] Backward compatible
- [ ] Migration path (if breaking)

## Specific Areas

### New Features
- [ ] Feature is complete
- [ ] Integration is correct
- [ ] Tests are adequate
- [ ] Documentation updated
- [ ] No regressions

### Bug Fixes
- [ ] Root cause addressed
- [ ] Fix is minimal
- [ ] Tests verify fix
- [ ] No new issues introduced
- [ ] Related functionality tested

### Refactoring
- [ ] Functionality unchanged
- [ ] Code is improved
- [ ] Tests still pass
- [ ] Performance maintained or improved
- [ ] Documentation updated

## Approval Criteria

### Must Have
- Code follows standards
- Tests pass
- No critical issues
- Documentation adequate
- Security considerations addressed

### Should Have
- Code is well-structured
- Error handling complete
- Performance acceptable
- Tests comprehensive
- Documentation complete

### Nice to Have
- Code is elegant
- Performance optimized
- Tests cover edge cases
- Documentation is excellent
- Code is exemplary

## Review Comments

### Types
- **Approval**: Code is good, approve
- **Request Changes**: Issues found, changes needed
- **Suggestions**: Optional improvements
- **Questions**: Need clarification

### Format
- Be specific about issues
- Suggest solutions
- Reference standards
- Be constructive
- Be respectful

## Review Process

1. Self-review before submission
2. Automated checks pass
3. Peer review
4. Address feedback
5. Approval
6. Merge
