# The Dawn Trader - Development Principles

## Architectural Philosophy

### 1. Safety First
- All autonomous actions require safety validation
- Kill switch capability for emergency halts
- Comprehensive audit logging
- Ethical reasoning integrated into decision-making
- Manual approval for high-risk operations

### 2. Database-First Design
- Single source of truth in PostgreSQL
- State persistence over in-memory storage
- Reconciliation diagnostics for consistency
- Idempotent operations
- Comprehensive error handling

### 3. Event-Driven Architecture
- Cluster bus for distributed coordination
- WebSocket broadcasting for real-time updates
- Event sourcing for audit trails
- Asynchronous task queues
- Decoupled service communication

### 4. Intelligent Caching
- Bob Core multi-module system
- Context-aware TTL management
- Cache invalidation strategies
- Performance monitoring
- Prefetch optimization

### 5. Cognitive Architecture
- Hybrid Cognitive-Operational design
- Domain-specific reasoning agents
- Meta-cognitive oversight
- Continuous learning pipeline
- Adaptive parameter tuning

## Code Quality Standards

### Testing Requirements
- Automated test harness for critical flows
- End-to-end scenario validation
- Performance benchmarking
- Load testing for scalability
- Security vulnerability scanning

### Code Conventions
- TypeScript for type safety
- Zod for runtime validation
- Drizzle ORM for database access
- RESTful API design
- WebSocket for real-time features

### Documentation Standards
- API endpoint documentation
- Service architecture diagrams
- Database schema documentation
- Deployment procedures
- Incident response playbooks

## Operational Principles

### 1. Observability
- Comprehensive logging
- Performance metrics collection
- Health check endpoints
- Error tracking and alerting
- User activity monitoring

### 2. Resilience
- Graceful degradation
- Automatic recovery mechanisms
- Heartbeat monitoring
- State reconciliation
- Circuit breakers

### 3. Scalability
- Stateless service design
- Horizontal scaling capability
- Queue-based processing
- Distributed coordination
- Resource optimization

### 4. Security
- Authentication via JWT
- Role-based access control
- Secret management
- Input validation
- Rate limiting

## Feature Development Process

### Phase Structure
Each development phase includes:
1. Planning and design
2. Implementation
3. Testing and validation
4. Code review (architect)
5. Deployment
6. Documentation
7. Status report

### Quality Gates
Before completion:
- All tests passing
- Code reviewed
- Documentation updated
- Performance validated
- Security verified

## Continuous Improvement

### Learning Cycle
- Collect experience data
- Analyze performance
- Identify improvements
- Test optimizations
- Deploy enhancements
- Monitor results

### Feedback Loops
- User feedback integration
- System performance monitoring
- Error pattern analysis
- Strategy optimization
- Parameter tuning

## Technology Stack

### Backend
- Node.js + Express
- TypeScript
- PostgreSQL (Neon)
- Drizzle ORM
- WebSocket

### Frontend
- React + Vite
- TypeScript
- TailwindCSS + shadcn/ui
- TanStack Query
- Wouter routing

### AI/ML
- OpenAI GPT-4o
- Vector embeddings (pgvector)
- Semantic search
- Natural language processing

### DevOps
- Replit deployment
- Environment-based config
- Automated backups
- Health monitoring
- Log aggregation

## Anti-Patterns to Avoid

### Don't
- Skip safety validation
- Mutate state directly
- Use magic numbers
- Ignore error handling
- Bypass audit logging
- Create tightly coupled services
- Store secrets in code
- Skip documentation

### Do
- Validate all inputs
- Use configuration management
- Handle errors gracefully
- Log important events
- Maintain service boundaries
- Use environment variables
- Document thoroughly

## Success Metrics

### Technical Health
- Uptime percentage
- Response time
- Error rate
- Cache hit ratio
- Queue depth

### Business Value
- Trading performance
- User engagement
- Feature adoption
- System reliability
- Cost efficiency

## Community & Collaboration

### Code Reviews
- Architect reviews for major changes
- Peer reviews for features
- Security reviews for sensitive code
- Performance reviews for bottlenecks

### Knowledge Sharing
- Architecture documentation
- API references
- Best practices guides
- Troubleshooting guides
- Deployment procedures

## Conclusion
These principles guide all development decisions for The Dawn Trader platform, ensuring we build a robust, scalable, and valuable trading system.
