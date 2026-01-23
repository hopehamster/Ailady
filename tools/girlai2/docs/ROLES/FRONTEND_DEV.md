# Frontend Developer Role Guide

Responsibilities and workflows for the Frontend Developer role.

## Responsibilities

### UI Development
- Implement Flutter screens
- Create reusable widgets
- Implement user interactions
- Ensure responsive design
- Optimize UI performance

### State Management
- Implement Provider patterns
- Manage service state
- Handle state updates
- Ensure proper disposal

### Integration
- Integrate with backend services
- Handle API responses
- Implement error handling
- Add loading states

## Key Areas of Focus

### Flutter Development
- Flutter/Dart best practices
- Material 3 design
- Widget composition
- State management with Provider

### UI/UX
- User experience
- Accessibility
- Responsive design
- Error states
- Loading states

### Integration
- Firebase services
- Cloud Functions
- Firestore streams
- Error handling

## Workflows

### Creating a New Screen
1. Create screen widget
2. Add navigation route
3. Implement UI
4. Integrate with services
5. Add error handling
6. Test screen
7. Update documentation

### Implementing State Management
1. Identify state needs
2. Choose service or widget state
3. Implement ChangeNotifier if needed
4. Add to Provider
5. Update UI to use state
6. Test state changes

### Integrating with Backend
1. Identify required data
2. Use appropriate service
3. Handle loading states
4. Handle error states
5. Update UI on data changes
6. Test integration

## Code Patterns

### Screen Structure
```dart
class MyScreen extends StatefulWidget {
  @override
  State<MyScreen> createState() => _MyScreenState();
}

class _MyScreenState extends State<MyScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // Screen content
    );
  }
}
```

### Service Integration
```dart
// Using Provider
final service = context.watch<MyService>();
// or
final service = context.read<MyService>();
```

### Error Handling
```dart
try {
  await service.doSomething();
} catch (e) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text('Error: ${e.toString()}')),
  );
}
```

## Best Practices

### Widget Design
- Keep widgets small (<100 lines)
- Use composition over inheritance
- Extract reusable widgets
- Follow single responsibility

### State Management
- Use Provider for UI state
- Minimize state
- Dispose subscriptions
- Avoid unnecessary rebuilds

### Error Handling
- Always handle errors
- Show user-friendly messages
- Log errors via DebugLogger
- Never expose sensitive data

### Performance
- Avoid unnecessary rebuilds
- Use const constructors
- Cache expensive computations
- Optimize images

## Key Documents

- `docs/ARCHITECTURE.md`: System architecture
- `docs/COMPONENT_INVENTORY.md`: Component catalog
- `docs/DATA_FLOWS.md`: Data flow diagrams
- `docs/WORKFLOWS/FEATURE_DEVELOPMENT.md`: Feature workflow
- `docs/QA/CODE_QUALITY_STANDARDS.md`: Quality standards

## Tools

### Development Tools
- Flutter SDK
- Flutter DevTools
- `dart-mcp`: Code analysis
- `flutter-docs`: Documentation

### Testing Tools
- Flutter test framework
- Widget testing
- Integration testing

## Common Tasks

### Adding a New Feature
1. Create feature module
2. Implement models
3. Implement services
4. Implement UI
5. Add tests
6. Update documentation

### Fixing UI Bugs
1. Reproduce bug
2. Identify root cause
3. Implement fix
4. Test fix
5. Verify no regressions

### Optimizing Performance
1. Identify bottlenecks
2. Profile with DevTools
3. Optimize code
4. Test improvements
5. Verify performance gain
