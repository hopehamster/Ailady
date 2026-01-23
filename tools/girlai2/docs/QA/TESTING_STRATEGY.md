# Testing Strategy

Comprehensive testing strategy for the AI Girlfriend App.

## Testing Philosophy

### Test Pyramid
- **Unit Tests**: Many, fast, isolated
- **Widget Tests**: Some, medium speed, UI-focused
- **Integration Tests**: Few, slower, flow-focused
- **E2E Tests**: Very few, slowest, user-focused

### Coverage Goals
- Overall: >80% code coverage
- Critical paths: 100% coverage
- Services: >90% coverage
- Utilities: >90% coverage
- UI: >70% coverage

## Test Types

### Unit Tests

#### Purpose
- Test individual functions
- Test service methods
- Test utility functions
- Fast execution

#### Location
- `test/unit/` directory
- One test file per source file
- Test file: `*_test.dart`

#### Examples
- Service method tests
- Utility function tests
- Model conversion tests
- Error handling tests

#### Best Practices
- Test one thing per test
- Use descriptive test names
- Mock dependencies
- Test edge cases

### Widget Tests

#### Purpose
- Test UI components
- Test user interactions
- Test state changes
- Test error states

#### Location
- `test/widget/` directory
- Test file: `*_test.dart`

#### Examples
- Screen rendering tests
- Button interaction tests
- Form validation tests
- Error display tests

#### Best Practices
- Test widget behavior
- Test user interactions
- Test state changes
- Use test helpers

### Integration Tests

#### Purpose
- Test complete flows
- Test service integration
- Test with emulators
- Test error scenarios

#### Location
- `test/integration/` directory
- Test file: `*_test.dart`

#### Examples
- Authentication flow
- Chat message flow
- Onboarding flow
- Error recovery flow

#### Best Practices
- Test user journeys
- Use emulators
- Test error scenarios
- Clean up after tests

### End-to-End Tests

#### Purpose
- Test user journeys
- Test on devices
- Test with production (if safe)
- Comprehensive coverage

#### Location
- Manual testing procedures
- Test scripts
- Test documentation

#### Examples
- Complete login flow
- Complete chat flow
- Complete onboarding flow
- Error recovery

#### Best Practices
- Test critical paths
- Test on real devices
- Document test cases
- Record results

## Test Organization

### Directory Structure
```
test/
├── helpers/
│   ├── test_helpers.dart
│   └── mock_helpers.dart
├── unit/
│   ├── services/
│   ├── utils/
│   └── models/
├── widget/
│   ├── screens/
│   └── widgets/
└── integration/
    ├── auth/
    ├── chat/
    └── onboarding/
```

### Test Helpers
- Mock factories
- Test utilities
- Common setup
- Common teardown

## Testing Tools

### Flutter Test Framework
- `flutter test`: Run tests
- `test/` package: Test utilities
- `mockito`: Mocking
- `fake_cloud_firestore`: Firestore mocking

### Firebase Emulator Suite
- Auth emulator
- Firestore emulator
- Functions emulator
- Use for integration tests

### MCP Tools
- `dart-mcp`: Code analysis
- `flutter-docs`: Documentation
- `xcode-mcp`: Build testing

## Test Execution

### Running Tests
```bash
# Run all tests
flutter test

# Run specific test file
flutter test test/unit/services/auth_service_test.dart

# Run with coverage
flutter test --coverage

# Run specific test
flutter test --name "test name"
```

### Test Scripts
- `scripts/full_test_suite.sh`: Run all tests
- `scripts/mcp_flutter_test.sh`: Run via MCP
- `test/run_tests.sh`: Run test suite

## Test Coverage

### Coverage Goals
- Overall: >80%
- Services: >90%
- Utilities: >90%
- UI: >70%

### Coverage Reports
- Generate with `flutter test --coverage`
- Review coverage reports
- Identify gaps
- Add tests for gaps

## Test Maintenance

### Keeping Tests Updated
- Update tests for code changes
- Fix broken tests
- Remove obsolete tests
- Refactor tests

### Test Quality
- Tests should be readable
- Tests should be independent
- Tests should be fast
- Tests should be maintainable

## Common Test Patterns

### Service Testing
```dart
test('should get user profile', () async {
  // Arrange
  final mockFirestore = MockFirestore();
  final service = UserService(mockFirestore);
  
  // Act
  final profile = await service.getUserProfile('userId');
  
  // Assert
  expect(profile, isNotNull);
});
```

### Widget Testing
```dart
testWidgets('should display login screen', (tester) async {
  // Arrange
  await tester.pumpWidget(MyApp());
  
  // Act
  await tester.pumpAndSettle();
  
  // Assert
  expect(find.text('Login'), findsOneWidget);
});
```

### Integration Testing
```dart
test('complete login flow', () async {
  // Setup emulators
  // Test login flow
  // Verify results
});
```

## Best Practices

### Test Design
- Test one thing per test
- Use descriptive names
- Arrange-Act-Assert pattern
- Test edge cases

### Test Execution
- Run tests regularly
- Run before commits
- Run in CI/CD
- Fix failing tests quickly

### Test Maintenance
- Keep tests updated
- Remove obsolete tests
- Refactor tests
- Optimize test suite

## Checklist

### Before Committing
- [ ] All tests pass
- [ ] Coverage meets goals
- [ ] New code has tests
- [ ] Tests are readable
- [ ] Tests are maintainable

### During Review
- [ ] Tests cover functionality
- [ ] Tests cover edge cases
- [ ] Tests cover error cases
- [ ] Tests are well-written
- [ ] Coverage is adequate
