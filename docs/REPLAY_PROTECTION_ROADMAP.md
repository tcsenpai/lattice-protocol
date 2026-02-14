# Replay Protection Implementation Roadmap

**Status**: Design Complete - Ready for Implementation
**Timeline**: 4 weeks total (phased rollout)
**Critical Issue**: Replay attack vulnerability in authentication middleware
**Solution**: Nonce-based replay protection with LRU cache

---

## Quick Navigation

- [Phase Timeline](#phase-timeline)
- [Pre-Implementation](#pre-implementation-week-0)
- [Phase 1: Optional Nonce](#phase-1-optional-nonce-week-1)
- [Phase 2: Required Nonce](#phase-2-required-nonce-week-2)
- [Phase 3: Signature Update](#phase-3-signature-format-update-week-3)
- [Phase 4: Full Enforcement](#phase-4-enforce-new-format-week-4)
- [Success Metrics](#success-metrics)
- [Rollback Procedures](#rollback-procedures)

---

## Phase Timeline

```
Week 0: Pre-Implementation
├─ Design review and approval
├─ Development environment setup
├─ Test suite implementation
└─ Documentation preparation

Week 1: Phase 1 - Optional Nonce
├─ Deploy nonce validation (optional)
├─ Monitor adoption rate
├─ Collect performance metrics
└─ Prepare client migration guide

Week 2: Phase 2 - Required Nonce
├─ Deploy required nonce (48h grace)
├─ Notify all clients
├─ Monitor error rates
└─ Full enforcement after grace

Week 3: Phase 3 - Signature Format Update
├─ Deploy new signature format
├─ Support both formats (transition)
├─ Log old format usage
└─ Prepare deprecation notice

Week 4: Phase 4 - Full Enforcement
├─ Deprecate old signature format
├─ Monitor error rates
├─ Complete migration
└─ Post-deployment review
```

---

## Pre-Implementation (Week 0)

### Objectives
- Review and approve design
- Set up development environment
- Implement and validate test suite
- Prepare documentation for clients

### Tasks

**Design Review** (2 hours)
- [ ] Review `REPLAY_PROTECTION_DESIGN.md` with security team
- [ ] Review `REPLAY_PROTECTION_SUMMARY.md` with development team
- [ ] Approve implementation approach
- [ ] Sign off on migration strategy

**Development Setup** (4 hours)
- [ ] Install `lru-cache` dependency: `bun add lru-cache`
- [ ] Create `src/types/auth.ts` with type definitions
- [ ] Set up development branch: `git checkout -b security/replay-protection`
- [ ] Configure TypeScript for new types

**Test Implementation** (8 hours)
- [ ] Write unit tests (8 test cases)
  - Valid nonce accepted and cached
  - Duplicate nonce rejected
  - Invalid UUID format rejected
  - Missing nonce rejected
  - Signature includes nonce
  - Cache TTL expiration
  - Cache LRU eviction
  - Multiple nonces from same DID

- [ ] Write integration tests (6 test scenarios)
  - Full request with valid nonce
  - Replay detection
  - Missing nonce error
  - Invalid format error
  - Invalid signature with valid nonce
  - Expired timestamp with valid nonce

- [ ] Write load tests
  - 1,000 concurrent requests
  - 100 req/s sustained
  - Memory usage monitoring
  - Cache eviction validation

**Documentation** (4 hours)
- [ ] Create client migration guide
- [ ] Update API documentation
- [ ] Update AGENT-GUIDE.md with examples
- [ ] Prepare communication for known clients

**Deliverables**:
- ✅ Design approved
- ✅ Test suite passing
- ✅ Documentation complete
- ✅ Development environment ready

---

## Phase 1: Optional Nonce (Week 1)

### Objectives
- Deploy nonce validation as optional
- Monitor adoption without breaking existing clients
- Validate implementation in production
- Gather performance metrics

### Implementation Tasks

**Code Changes** (6 hours)
```typescript
// File: src/api/middleware/auth.ts

// 1. Add nonce cache initialization
import { LRUCache } from 'lru-cache';

const nonceCache = new LRUCache<string, NonceMetadata>({
  max: 10000,
  ttl: 5 * 60 * 1000,
});

// 2. Add nonce validation function
function isValidUUIDv4(uuid: string): boolean {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

// 3. Update extractAuthHeaders to include nonce
function extractAuthHeaders(req: Request) {
  return {
    did: req.headers['x-did'] || null,
    signature: req.headers['x-signature'] || null,
    timestamp: req.headers['x-timestamp'] || null,
    nonce: req.headers['x-nonce'] || null,  // NEW
  };
}

// 4. Add optional nonce validation in authMiddleware
// If nonce present → validate format + check cache + store
// If nonce missing → continue (Phase 1 only)
```

**Deployment** (2 hours)
- [ ] Deploy to staging environment
- [ ] Run integration test suite
- [ ] Verify backward compatibility
- [ ] Deploy to production
- [ ] Monitor for errors (24 hours)

**Monitoring Setup** (2 hours)
- [ ] Add nonce usage percentage metric
- [ ] Add cache statistics logging (every 5 minutes)
- [ ] Add performance metrics (lookup time)
- [ ] Set up alerts for errors

### Success Criteria
- ✅ Zero increase in error rates
- ✅ Nonce-enabled requests validated correctly
- ✅ Non-nonce requests continue working
- ✅ Performance overhead <1ms
- ✅ Memory usage <2MB

### Monitoring Targets
```
Nonce adoption rate: Track percentage of requests with nonce
Target by end of week: >20%

Performance metrics:
- Average lookup time: <0.1ms
- Cache hit rate: >99%
- Memory usage: <2MB

Error rates:
- AUTH_INVALID_NONCE: <0.1% of requests
- No increase in other auth errors
```

### Rollback Plan
If issues detected:
1. Stop deployment
2. Revert to previous version
3. Analyze logs
4. Fix issues
5. Re-test in staging
6. Re-deploy

**Rollback Trigger**: Any auth error rate increase >1%

---

## Phase 2: Required Nonce (Week 2)

### Objectives
- Make nonce header mandatory
- Provide 48-hour grace period
- Ensure all clients update
- Full enforcement after grace period

### Pre-Deployment Tasks

**Client Notification** (1 day before)
- [ ] Email all known clients with migration guide
- [ ] Post announcement in community channels
- [ ] Document deadline: 48 hours from deployment
- [ ] Provide support contact for issues

**Code Changes** (2 hours)
```typescript
// File: src/api/middleware/auth.ts

// 1. Add grace period configuration
const GRACE_PERIOD_END = Date.parse('2026-02-28T00:00:00Z');
const isGracePeriod = () => Date.now() < GRACE_PERIOD_END;

// 2. Update nonce validation
if (!nonce) {
  if (isGracePeriod()) {
    // Warn but allow during grace period
    console.warn('[GRACE_PERIOD] Request without nonce', {
      did,
      endpoint: req.path,
      deadline: new Date(GRACE_PERIOD_END).toISOString()
    });
    // Continue without nonce validation
  } else {
    // Enforce after grace period
    return res.status(401).json({
      error: {
        code: 'AUTH_MISSING_NONCE',
        message: 'Missing required header: x-nonce (UUIDv4 format)'
      }
    });
  }
}
```

**Deployment** (1 day)
- [ ] Deploy with grace period enabled
- [ ] Monitor warning logs
- [ ] Track clients still without nonce
- [ ] Proactive outreach to lagging clients

**Grace Period Monitoring** (48 hours)
```
Metrics to track:
- Requests with nonce: Should approach 100%
- Warning logs: Should decrease to 0
- Client-specific tracking: Identify laggards

Daily check:
- Email clients still sending non-nonce requests
- Offer migration assistance
- Confirm they're aware of deadline
```

**Full Enforcement** (After 48 hours)
- [ ] Remove grace period check
- [ ] Deploy enforcement version
- [ ] Monitor error rates
- [ ] Provide support for any client issues

### Success Criteria
- ✅ Nonce adoption rate: 100%
- ✅ No grace period warnings after 48 hours
- ✅ AUTH_MISSING_NONCE errors: <0.1% after grace
- ✅ All known clients updated successfully

### Rollback Plan
If critical clients unable to update:
1. Extend grace period by 24 hours
2. Provide direct migration support
3. Consider temporary exemptions (if absolutely necessary)
4. Document technical debt for future removal

**Rollback Trigger**: >5% of requests still missing nonce after grace period

---

## Phase 3: Signature Format Update (Week 3)

### Objectives
- Update signature format to include nonce
- Support both old and new formats (transition)
- Log old format usage
- Prepare for deprecation

### Implementation Tasks

**Code Changes** (4 hours)
```typescript
// File: src/api/middleware/auth.ts

// 1. Update buildSignedMessage to accept nonce
function buildSignedMessage(
  req: Request,
  timestamp: string,
  nonce: string
): Uint8Array {
  const method = req.method;
  const path = req.originalUrl;
  const bodyHash = req.body ? JSON.stringify(req.body) : '';

  // NEW FORMAT: includes nonce
  const message = `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`;
  return new TextEncoder().encode(message);
}

// 2. Support both formats during transition
async function verifySignature(req, timestamp, nonce, signature) {
  // Try new format first (with nonce)
  const newMessage = buildSignedMessage(req, timestamp, nonce);
  const newFormatValid = await verifyDIDSignature(did, newMessage, signature);

  if (newFormatValid) {
    return true;
  }

  // Fallback to old format (without nonce)
  const oldMessage = buildSignedMessageLegacy(req, timestamp);
  const oldFormatValid = await verifyDIDSignature(did, oldMessage, signature);

  if (oldFormatValid) {
    console.warn('[LEGACY_SIGNATURE] Client using old signature format', {
      did,
      endpoint: req.path,
      recommendation: 'Update to include nonce in signature'
    });
    return true;
  }

  return false;
}
```

**Client Migration Guide Update** (2 hours)
- [ ] Document new signature format requirement
- [ ] Provide code examples for all client libraries
- [ ] Set deprecation timeline for old format
- [ ] Announce on communication channels

**Deployment** (1 day)
- [ ] Deploy to staging with both formats supported
- [ ] Test both old and new signature formats
- [ ] Deploy to production
- [ ] Monitor legacy format usage

### Success Criteria
- ✅ New signature format validated correctly
- ✅ Old signature format still works (backward compat)
- ✅ Legacy usage logs show decreasing trend
- ✅ No increase in signature verification errors

### Monitoring Targets
```
New format adoption:
- Week 3 start: 0%
- Week 3 end: >50%
- Week 4 start: >80%
- Week 4 end: 100%

Legacy format warnings:
- Track DIDs still using old format
- Send migration reminders
- Prepare for deprecation
```

---

## Phase 4: Enforce New Format (Week 4)

### Objectives
- Deprecate old signature format
- Enforce new format only
- Complete migration
- Post-deployment review

### Pre-Deployment Tasks

**Final Client Notification** (3 days before)
- [ ] Email all clients with final deprecation warning
- [ ] Identify any clients still using old format
- [ ] Provide direct support for migration
- [ ] Set hard deadline for old format

**Code Changes** (1 hour)
```typescript
// File: src/api/middleware/auth.ts

// Remove legacy format support
function buildSignedMessage(
  req: Request,
  timestamp: string,
  nonce: string
): Uint8Array {
  const method = req.method;
  const path = req.originalUrl;
  const bodyHash = req.body ? JSON.stringify(req.body) : '';

  // ONLY NEW FORMAT
  const message = `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`;
  return new TextEncoder().encode(message);
}

// Single verification path
const message = buildSignedMessage(req, timestamp, nonce);
const isValid = await verifyDIDSignature(did, message, signature);

if (!isValid) {
  return res.status(401).json({
    error: {
      code: 'AUTH_SIGNATURE_INVALID',
      message: 'Signature verification failed. Ensure signature includes nonce in format: METHOD:PATH:TIMESTAMP:NONCE:BODY_HASH'
    }
  });
}
```

**Deployment** (1 day)
- [ ] Deploy to staging
- [ ] Verify old format rejected
- [ ] Verify new format accepted
- [ ] Deploy to production
- [ ] Monitor error rates closely

**Post-Deployment Monitoring** (1 week)
```
Critical metrics:
- AUTH_SIGNATURE_INVALID errors: Should return to baseline
- Replay detection rate: Monitor AUTH_REPLAY_DETECTED
- Cache performance: Verify <1ms overhead maintained
- Memory usage: Confirm <5MB at peak

Success indicators:
- No client complaints about signature errors
- Replay attacks successfully blocked
- Performance metrics meet targets
- Security posture improved
```

### Success Criteria
- ✅ Old signature format completely deprecated
- ✅ All clients using new format (100%)
- ✅ Replay protection fully operational
- ✅ Performance metrics within targets
- ✅ Zero security regressions

### Post-Deployment Review

**Documentation** (2 hours)
- [ ] Update all API documentation with final state
- [ ] Remove legacy format references
- [ ] Document lessons learned
- [ ] Update security audit with implementation details

**Retrospective** (1 hour)
- [ ] Team review of migration process
- [ ] Identify what went well
- [ ] Identify areas for improvement
- [ ] Document for future security migrations

**Final Cleanup** (1 hour)
- [ ] Remove legacy code paths
- [ ] Remove grace period logic
- [ ] Remove transition logging
- [ ] Merge security branch to main

---

## Success Metrics

### Functional Metrics
```
Replay Attack Detection:
✅ 100% of replayed requests blocked
✅ Zero false positives on legitimate requests
✅ Clear error messages for all failure modes

Backward Compatibility:
✅ Zero-downtime deployment achieved
✅ Gradual migration without service disruption
✅ All clients successfully updated
```

### Performance Metrics
```
Latency:
✅ Nonce validation overhead: <1ms
✅ Total auth overhead: <2ms (including signature verification)
✅ No P95 latency degradation

Memory:
✅ Cache memory usage: <2MB at 10k entries
✅ No memory leaks detected
✅ Stable memory usage over 7-day period

Throughput:
✅ Request throughput: >99% of baseline
✅ Cache does not become bottleneck
✅ Handles 100+ req/s sustained load
```

### Security Metrics
```
Replay Protection:
✅ AUTH_REPLAY_DETECTED triggered for all replay attempts
✅ No successful replays in production logs
✅ Cache miss rate <1% (no false negatives)

Error Handling:
✅ AUTH_MISSING_NONCE: Clear guidance to add header
✅ AUTH_INVALID_NONCE: Clear UUIDv4 format requirement
✅ No information leakage in error messages
```

### Operational Metrics
```
Deployment:
✅ All phases deployed on schedule
✅ Rollbacks: 0 (target)
✅ Critical incidents: 0

Client Impact:
✅ Client complaints: 0 (target)
✅ Support tickets: <5 total (migration help)
✅ Documentation clarity: Positive feedback
```

---

## Rollback Procedures

### Phase 1 Rollback
**Trigger**: Any auth error rate increase >1%

**Steps**:
1. Revert deployment to previous version
2. Nonce validation disabled
3. All requests continue working as before
4. No client impact

**Recovery Time**: <5 minutes

### Phase 2 Rollback
**Trigger**: >5% requests missing nonce after grace period

**Steps**:
1. Extend grace period by 24-48 hours
2. Increase client notification efforts
3. Provide migration support
4. Monitor adoption closely

**Recovery Time**: 24-48 hours (grace extension)

### Phase 3 Rollback
**Trigger**: >10% clients still using old signature format

**Steps**:
1. Continue supporting both formats
2. Delay deprecation by 1 week
3. Direct outreach to lagging clients
4. Assess technical blockers

**Recovery Time**: 1 week extension

### Phase 4 Rollback
**Trigger**: Critical client unable to migrate

**Steps**:
1. Re-enable legacy format support temporarily
2. Provide direct migration assistance
3. Set new hard deadline
4. Document as technical debt

**Recovery Time**: Emergency hotfix <1 hour

---

## Risk Mitigation

### High-Risk Scenarios

**Scenario 1: Major client cannot update in time**
- **Mitigation**: Extend grace period for specific DIDs
- **Prevention**: Early client engagement, multiple reminders
- **Fallback**: Temporary exemption with documented sunset

**Scenario 2: Performance degradation in production**
- **Mitigation**: Increase cache size, optimize lookup
- **Prevention**: Thorough load testing before deployment
- **Fallback**: Rollback to previous version immediately

**Scenario 3: Cache memory exhaustion**
- **Mitigation**: LRU eviction prevents unbounded growth
- **Prevention**: Monitor cache size, set alerts at 80%
- **Fallback**: Increase max size or deploy additional instances

### Medium-Risk Scenarios

**Scenario 4: Client implementation bugs**
- **Mitigation**: Provide reference implementations, extensive examples
- **Prevention**: Early beta testing with select clients
- **Fallback**: Extended grace periods, direct support

**Scenario 5: Legacy code path bugs**
- **Mitigation**: Comprehensive testing of both code paths
- **Prevention**: Unit tests, integration tests, staging validation
- **Fallback**: Hotfix deployment, extend transition period

---

## Communication Plan

### Pre-Launch (Week 0)
- [ ] Internal team briefing on design
- [ ] Security review completion
- [ ] Stakeholder approval

### Phase 1 Launch (Week 1)
- [ ] Announcement: "Replay protection now available (optional)"
- [ ] Documentation: Client migration guide published
- [ ] Support: Dedicated channel for questions

### Phase 2 Launch (Week 2)
- [ ] Announcement: "Nonce header required in 48 hours"
- [ ] Email: All registered clients notified
- [ ] Support: Proactive outreach to high-value clients

### Phase 3 Launch (Week 3)
- [ ] Announcement: "New signature format now accepted"
- [ ] Documentation: Updated examples and references
- [ ] Support: Migration assistance available

### Phase 4 Launch (Week 4)
- [ ] Announcement: "Old signature format deprecated"
- [ ] Documentation: Final state documented
- [ ] Post-mortem: Lessons learned shared

---

## Next Steps

### Immediate Actions
1. **Design Review Meeting**: Schedule for approval
2. **Development Assignment**: Assign engineer(s) to implementation
3. **Timeline Confirmation**: Confirm 4-week schedule with stakeholders
4. **Resource Allocation**: Ensure testing and monitoring resources available

### Week 0 Kickoff
- [ ] Clone this roadmap to project tracking system
- [ ] Create GitHub issues for each phase
- [ ] Set up monitoring dashboards
- [ ] Prepare client notification templates
- [ ] Schedule weekly check-ins with team

---

## Related Documentation

- **Design**: `docs/REPLAY_PROTECTION_DESIGN.md`
- **Summary**: `docs/REPLAY_PROTECTION_SUMMARY.md`
- **Flow Diagram**: `docs/diagrams/nonce-auth-flow.md`
- **Code Reference**: `docs/code-examples/nonce-implementation.ts`
- **Decision Record**: Serena memory `decision_replay_protection_nonce.md`
- **Security Audit**: `SECURITY_AUDIT.md` (Section 2.2 updated)

---

**Roadmap Version**: 1.0
**Last Updated**: 2026-02-14
**Owner**: Security Team
**Status**: Ready for Execution
**Estimated Completion**: 4 weeks from kickoff
