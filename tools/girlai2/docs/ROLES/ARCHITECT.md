# Architect Role Guide

Responsibilities and workflows for the Architect role in the AI Girlfriend App project.

## Responsibilities

### System Design
- Design overall system architecture
- Make technology decisions
- Plan scalability
- Ensure security
- Optimize performance

### Code Review
- Review architectural changes
- Ensure patterns are followed
- Verify design decisions
- Check for technical debt

### Technical Leadership
- Guide technical direction
- Resolve technical conflicts
- Mentor developers
- Document decisions

## Key Areas of Focus

### Architecture
- Review `docs/ARCHITECTURE.md`
- Understand system components
- Understand data flows
- Understand service interactions

### Technology Stack
- Flutter/Dart (frontend)
- Firebase (backend)
- Provider (state management)
- TypeScript/Node.js (Cloud Functions)

### Design Patterns
- Service layer pattern
- Singleton pattern (FirebaseService)
- ChangeNotifier pattern (state management)
- Repository pattern (implicit in services)

## Workflows

### Reviewing New Features
1. Review feature design
2. Assess architectural impact
3. Verify pattern compliance
4. Check scalability
5. Approve or request changes

### Making Technology Decisions
1. Research options
2. Evaluate trade-offs
3. Document decision
4. Record in knowledge base
5. Communicate to team

### Resolving Technical Issues
1. Understand issue
2. Research solutions
3. Evaluate options
4. Make decision
5. Document solution

## Decision Framework

### When to Make a Decision
- New technology adoption
- Architecture changes
- Performance issues
- Scalability concerns
- Security concerns

### Decision Criteria
- Alignment with project goals
- Maintainability
- Performance impact
- Security implications
- Team expertise
- Timeline constraints

## Documentation Responsibilities

### Architecture Documentation
- Maintain `docs/ARCHITECTURE.md`
- Update component inventory
- Update data flow diagrams
- Update service interactions

### Decision Log
- Record all architectural decisions
- Document alternatives considered
- Note trade-offs
- Link to related code

## Best Practices

### Design Principles
- Keep it simple
- Follow established patterns
- Consider scalability
- Ensure security
- Optimize performance

### Communication
- Document decisions clearly
- Explain rationale
- Share knowledge
- Mentor team members

### Continuous Improvement
- Review architecture regularly
- Identify technical debt
- Plan improvements
- Refactor when needed

## Key Documents

- `docs/ARCHITECTURE.md`: System architecture
- `docs/COMPONENT_INVENTORY.md`: Component catalog
- `docs/DATA_FLOWS.md`: Data flow diagrams
- `docs/SERVICE_INTERACTIONS.md`: Service dependencies
- `docs/QA/CODE_QUALITY_STANDARDS.md`: Quality standards

## Tools

### Analysis Tools
- `dart-mcp`: Code analysis
- `flutter-docs`: Documentation lookup
- Architecture diagrams: Mermaid

### Review Tools
- Code review process
- Architecture review
- Design review
