# Code Quality Standards

Standards and guidelines for maintaining high code quality in the AI Girlfriend App.

## General Principles

### Readability
- Code should be self-documenting
- Use meaningful variable and function names
- Follow Flutter/Dart style guide
- Keep functions small and focused

### Maintainability
- Follow established patterns
- Minimize complexity
- Avoid code duplication
- Document complex logic

### Reliability
- Handle errors appropriately
- Validate inputs
- Test thoroughly
- Log important events

## Code Style

### Flutter/Dart Style Guide
- Follow official Flutter style guide
- Use `dart format` for formatting
- Follow `analysis_options.yaml` rules
- Use `flutter analyze` before commits

### Naming Conventions
- Classes: PascalCase (e.g., `AuthService`)
- Functions: camelCase (e.g., `getUserProfile`)
- Variables: camelCase (e.g., `userId`)
- Constants: camelCase with const (e.g., `const maxLength = 100`)
- Private members: underscore prefix (e.g., `_userId`)

### File Organization
- One class per file (usually)
- File name matches class name
- Group related files in folders
- Use feature-based organization

## Code Structure

### Function Size
- Keep functions under 100 lines
- Break large functions into smaller ones
- Each function should do one thing
- Extract reusable logic

### Class Size
- Keep classes focused
- Single responsibility principle
- Avoid god objects
- Use composition over inheritance

### Nesting
- Limit nesting to 3 levels
- Extract complex conditions
- Use early returns
- Use guard clauses

## Error Handling

### Always Handle Errors
- Never ignore errors
- Use try-catch blocks
- Handle specific error types
- Provide fallbacks when appropriate

### Error Messages
- Use error handlers (AuthErrorHandler, ChatErrorHandler)
- Provide user-friendly messages
- Never expose sensitive information
- Log detailed errors via DebugLogger

### Error Logging
- Log all errors via DebugLogger
- Include context in logs
- Never log sensitive data
- Use structured logging

## State Management

### Provider Pattern
- Use ChangeNotifier for UI state
- Use stateless services when possible
- Minimize state
- Dispose subscriptions

### State Updates
- Use notifyListeners() appropriately
- Avoid unnecessary rebuilds
- Use const constructors when possible
- Optimize widget rebuilds

## Testing

### Test Coverage
- Aim for >80% coverage
- Test happy paths
- Test error paths
- Test edge cases

### Test Quality
- Tests should be readable
- Tests should be independent
- Tests should be fast
- Tests should be maintainable

## Documentation

### Code Comments
- Comment complex logic
- Explain "why" not "what"
- Keep comments up to date
- Remove obsolete comments

### API Documentation
- Document public APIs
- Use Dart doc comments
- Include parameter descriptions
- Include return value descriptions

### Architecture Documentation
- Update architecture docs for changes
- Document design decisions
- Update data flow diagrams
- Record in knowledge base

## Performance

### Optimization
- Avoid unnecessary rebuilds
- Use const constructors
- Cache expensive computations
- Optimize images

### Memory Management
- Dispose subscriptions
- Cancel timers
- Release resources
- Avoid memory leaks

### Query Optimization
- Limit Firestore queries
- Use appropriate indexes
- Cache when appropriate
- Monitor costs

## Security

### Data Protection
- Never log sensitive data
- Validate all inputs
- Sanitize outputs
- Use secure storage

### Authentication
- Always verify authentication
- Check user permissions
- Use Firestore security rules
- Never trust client input

### API Keys
- Never hardcode API keys
- Use Firebase Functions config
- Use environment variables
- Never commit secrets

## Code Review Checklist

### Before Submitting
- [ ] Code follows style guide
- [ ] Code is formatted
- [ ] Linter passes
- [ ] Tests pass
- [ ] No debug code
- [ ] Documentation updated
- [ ] Error handling complete
- [ ] Logging added

### Review Criteria
- [ ] Code is readable
- [ ] Code is maintainable
- [ ] Code is testable
- [ ] Code is secure
- [ ] Code is performant
- [ ] Code follows patterns
- [ ] Code is documented

## Tools

### Code Quality Tools
- `flutter analyze`: Linting
- `dart format`: Formatting
- `flutter test`: Testing
- `dart-mcp`: Code analysis

### Automated Checks
- Pre-commit hooks (if configured)
- CI/CD checks
- Linter in IDE
- Format on save

## Best Practices

### Do
- Follow style guide
- Write tests
- Handle errors
- Document code
- Review code
- Refactor when needed

### Don't
- Ignore errors
- Hardcode values
- Duplicate code
- Create god objects
- Skip tests
- Commit debug code

## Enforcement

### Pre-Commit
- Run linter
- Run formatter
- Run tests
- Check coverage

### CI/CD
- Automated linting
- Automated testing
- Coverage checks
- Build verification
