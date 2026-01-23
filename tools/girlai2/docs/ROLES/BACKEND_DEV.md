# Backend Developer Role Guide

Responsibilities and workflows for the Backend Developer role.

## Responsibilities

### Cloud Functions Development
- Implement Cloud Functions
- Design API contracts
- Handle authentication
- Implement error handling
- Optimize performance

### Firestore Management
- Design database schema
- Create security rules
- Define indexes
- Optimize queries
- Ensure data consistency

### Integration
- Integrate with external APIs
- Handle API responses
- Implement retry logic
- Manage API keys

## Key Areas of Focus

### Cloud Functions
- TypeScript/Node.js
- Firebase Functions framework
- OpenAI API integration
- Error handling
- Authentication

### Firestore
- Database design
- Security rules
- Indexes
- Query optimization
- Data modeling

### API Design
- Input validation
- Output formatting
- Error responses
- Authentication
- Rate limiting (if needed)

## Workflows

### Creating a New Cloud Function
1. Design function contract
2. Implement function logic
3. Add error handling
4. Add logging
5. Test with emulator
6. Deploy to Firebase
7. Document API

### Updating Firestore Schema
1. Design schema changes
2. Update security rules
3. Create indexes if needed
4. Update data models
5. Migrate existing data (if needed)
6. Test changes
7. Deploy rules/indexes

### Integrating External APIs
1. Research API
2. Design integration
3. Implement client
4. Add error handling
5. Add retry logic
6. Test integration
7. Document usage

## Code Patterns

### Cloud Function Structure
```typescript
export const myFunction = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', '...');
    }
    
    // Validate input
    // Process request
    // Return response
  });
```

### Error Handling
```typescript
try {
  // Process request
} catch (error: any) {
  functions.logger.error('Error in myFunction', {
    error: error.message,
    stack: error.stack,
  });
  
  throw new functions.https.HttpsError(
    'internal',
    'User-friendly error message',
    error.message
  );
}
```

### Firestore Query
```typescript
const db = admin.firestore();
const snapshot = await db
  .collection('collection')
  .where('field', '==', value)
  .orderBy('timestamp', 'desc')
  .limit(10)
  .get();
```

## Best Practices

### Cloud Functions
- Validate all inputs
- Verify authentication
- Handle errors gracefully
- Log important events
- Return user-friendly errors

### Firestore
- Design efficient schemas
- Use appropriate indexes
- Write secure rules
- Optimize queries
- Consider costs

### Security
- Never expose API keys
- Validate all inputs
- Use security rules
- Authenticate requests
- Sanitize outputs

### Performance
- Optimize queries
- Use indexes
- Limit data returned
- Cache when appropriate
- Monitor costs

## Key Documents

- `docs/ARCHITECTURE.md`: System architecture
- `docs/DATA_MODELS.md`: Data models
- `docs/WORKFLOWS/FEATURE_DEVELOPMENT.md`: Feature workflow
- `firestore.rules`: Security rules
- `firestore.indexes.json`: Indexes

## Tools

### Development Tools
- Firebase CLI
- Firebase Emulator Suite
- TypeScript
- Node.js

### Testing Tools
- Firebase emulators
- Unit testing
- Integration testing

## Common Tasks

### Adding a New Function
1. Design API contract
2. Implement function
3. Add tests
4. Test with emulator
5. Deploy
6. Document

### Updating Schema
1. Design changes
2. Update rules
3. Create indexes
4. Test changes
5. Deploy
6. Migrate data (if needed)

### Debugging Functions
1. Check logs
2. Test with emulator
3. Add logging
4. Verify inputs
5. Check outputs
