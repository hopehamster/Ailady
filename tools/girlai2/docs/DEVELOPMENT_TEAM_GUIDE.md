# Development Team Guide

Complete guide for acting as a full development team on the AI Girlfriend App project.

## Overview

This guide provides comprehensive documentation for all aspects of the project, enabling effective operation as a complete development team with all roles and responsibilities.

## Quick Reference

### Architecture
- [System Architecture](ARCHITECTURE.md) - Complete system architecture
- [Component Inventory](COMPONENT_INVENTORY.md) - All components catalog
- [Data Flows](DATA_FLOWS.md) - All data flow diagrams
- [Service Interactions](SERVICE_INTERACTIONS.md) - Service dependencies

### Workflows
- [Feature Development](WORKFLOWS/FEATURE_DEVELOPMENT.md) - New feature workflow
- [Bug Fix](WORKFLOWS/BUG_FIX.md) - Bug fixing workflow
- [Release](WORKFLOWS/RELEASE.md) - Release workflow
- [Code Review](WORKFLOWS/CODE_REVIEW.md) - Code review process

### Quality Assurance
- [Code Quality Standards](QA/CODE_QUALITY_STANDARDS.md) - Quality standards
- [Testing Strategy](QA/TESTING_STRATEGY.md) - Testing approach
- [Review Checklist](QA/REVIEW_CHECKLIST.md) - Review checklist
- [Performance Benchmarks](QA/PERFORMANCE_BENCHMARKS.md) - Performance targets

### Roles
- [Architect](ROLES/ARCHITECT.md) - Architecture responsibilities
- [Frontend Developer](ROLES/FRONTEND_DEV.md) - Frontend development
- [Backend Developer](ROLES/BACKEND_DEV.md) - Backend development
- [DevOps](ROLES/DEVOPS.md) - Build and deployment
- [QA Engineer](ROLES/QA.md) - Testing and quality
- [Product Manager](ROLES/PM.md) - Product planning

### Operations
- [Monitoring and Maintenance](MONITORING_AND_MAINTENANCE.md) - Operations procedures
- [Documentation Standards](DOCUMENTATION_STANDARDS.md) - Documentation guidelines
- [MCP Tools and Automation](MCP_TOOLS_AND_AUTOMATION.md) - Tools and scripts

## Role-Based Quick Start

### As Architect
1. Review [ARCHITECTURE.md](ARCHITECTURE.md)
2. Review [SERVICE_INTERACTIONS.md](SERVICE_INTERACTIONS.md)
3. Review [ROLES/ARCHITECT.md](ROLES/ARCHITECT.md)
4. Make design decisions
5. Document decisions

### As Frontend Developer
1. Review [ARCHITECTURE.md](ARCHITECTURE.md)
2. Review [COMPONENT_INVENTORY.md](COMPONENT_INVENTORY.md)
3. Review [ROLES/FRONTEND_DEV.md](ROLES/FRONTEND_DEV.md)
4. Follow [WORKFLOWS/FEATURE_DEVELOPMENT.md](WORKFLOWS/FEATURE_DEVELOPMENT.md)
5. Follow [QA/CODE_QUALITY_STANDARDS.md](QA/CODE_QUALITY_STANDARDS.md)

### As Backend Developer
1. Review [ARCHITECTURE.md](ARCHITECTURE.md)
2. Review [DATA_FLOWS.md](DATA_FLOWS.md)
3. Review [ROLES/BACKEND_DEV.md](ROLES/BACKEND_DEV.md)
4. Follow [WORKFLOWS/FEATURE_DEVELOPMENT.md](WORKFLOWS/FEATURE_DEVELOPMENT.md)
5. Follow [QA/CODE_QUALITY_STANDARDS.md](QA/CODE_QUALITY_STANDARDS.md)

### As DevOps Engineer
1. Review [MCP_TOOLS_AND_AUTOMATION.md](MCP_TOOLS_AND_AUTOMATION.md)
2. Review [ROLES/DEVOPS.md](ROLES/DEVOPS.md)
3. Review [WORKFLOWS/RELEASE.md](WORKFLOWS/RELEASE.md)
4. Use automation scripts
5. Monitor deployments

### As QA Engineer
1. Review [QA/TESTING_STRATEGY.md](QA/TESTING_STRATEGY.md)
2. Review [QA/REVIEW_CHECKLIST.md](QA/REVIEW_CHECKLIST.md)
3. Review [ROLES/QA.md](ROLES/QA.md)
4. Follow [WORKFLOWS/BUG_FIX.md](WORKFLOWS/BUG_FIX.md)
5. Execute test strategy

### As Product Manager
1. Review [ROLES/PM.md](ROLES/PM.md)
2. Review [WORKFLOWS/RELEASE.md](WORKFLOWS/RELEASE.md)
3. Plan features
4. Manage releases
5. Collect feedback

## Common Tasks

### Starting a New Feature
1. Review [WORKFLOWS/FEATURE_DEVELOPMENT.md](WORKFLOWS/FEATURE_DEVELOPMENT.md)
2. Review [ARCHITECTURE.md](ARCHITECTURE.md)
3. Design feature
4. Implement feature
5. Test feature
6. Review code
7. Deploy feature

### Fixing a Bug
1. Review [WORKFLOWS/BUG_FIX.md](WORKFLOWS/BUG_FIX.md)
2. Reproduce bug
3. Identify root cause
4. Implement fix
5. Test fix
6. Review code
7. Deploy fix

### Releasing a Version
1. Review [WORKFLOWS/RELEASE.md](WORKFLOWS/RELEASE.md)
2. Freeze features
3. Test thoroughly
4. Fix bugs
5. Update documentation
6. Deploy
7. Monitor

## Key Principles

### Code Quality
- Follow [QA/CODE_QUALITY_STANDARDS.md](QA/CODE_QUALITY_STANDARDS.md)
- Write tests
- Handle errors
- Document code
- Review code

### Architecture
- Follow established patterns
- Maintain consistency
- Consider scalability
- Ensure security
- Optimize performance

### Documentation
- Follow [DOCUMENTATION_STANDARDS.md](DOCUMENTATION_STANDARDS.md)
- Update with changes
- Keep it current
- Make it clear
- Review regularly

## Tools and Resources

### MCP Tools
- `dart-mcp`: Code analysis
- `xcode-mcp`: Build and deploy
- `flutter-docs`: Documentation
- `mac-commander`: Automation
- `memory-journal-mcp`: Knowledge storage

### Scripts
- Build scripts: `scripts/build_*.sh`
- Test scripts: `scripts/*_test.sh`
- Debug scripts: `scripts/*_debug.sh`
- Utility scripts: `scripts/safe_run.sh`, etc.

### Documentation
- All documentation in `docs/` directory
- Architecture in `docs/ARCHITECTURE.md`
- Workflows in `docs/WORKFLOWS/`
- QA in `docs/QA/`
- Roles in `docs/ROLES/`

## Success Criteria

### Complete Understanding
- ✅ All components documented
- ✅ All data flows documented
- ✅ All services documented
- ✅ All workflows documented

### Quality Standards
- ✅ Code quality standards established
- ✅ Testing strategy defined
- ✅ Review process documented
- ✅ Performance benchmarks set

### Team Operations
- ✅ All roles defined
- ✅ All workflows documented
- ✅ All tools documented
- ✅ All procedures documented

### Knowledge Management
- ✅ Architecture documented
- ✅ Decisions recorded
- ✅ Patterns documented
- ✅ Issues tracked

## Maintenance

### Regular Updates
- Update documentation with code changes
- Review documentation regularly
- Improve documentation continuously
- Keep knowledge base current

### Continuous Improvement
- Refine workflows based on experience
- Improve processes
- Update standards
- Enhance tools

## Getting Help

### Documentation
- Check relevant documentation first
- Review architecture docs
- Check workflow docs
- Consult role guides

### Tools
- Use MCP tools for analysis
- Use scripts for automation
- Use memory tools for knowledge
- Use debugging tools

### Support
- Review error logs
- Check known issues
- Consult team members
- Document solutions

## Next Steps

1. Review all documentation
2. Familiarize with tools
3. Understand workflows
4. Practice with examples
5. Start contributing

## Summary

This guide provides everything needed to operate as a complete development team:
- Complete architecture understanding
- All workflows and procedures
- Quality standards and testing
- Role-specific guides
- Tools and automation
- Monitoring and maintenance

Use this guide as your primary reference for all development activities.
