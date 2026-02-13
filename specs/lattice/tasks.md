---
spec: lattice
phase: tasks
total_tasks: 42
created: 2026-02-13
---

# Tasks: Lattice Protocol MVP

## Execution Context

Interview responses captured during planning:

| Question | Decision |
|----------|----------|
| Testing depth | Minimal - POC only, add tests later |
| Deployment considerations | Standard CI/CD pipeline |
| Execution priority | Ship fast - POC first, polish later |
| Primary users | Both agents and developers |
| Priority tradeoffs | Speed of delivery |
| Success criteria | All: <1% spam, agent adoption, MCP-ready API |

---

## Phase 1: Make It Work (POC)

Focus: Validate the idea works end-to-end. Skip tests, accept hardcoded values, no validation polish.

### 1.1 Project Scaffolding

- [x] 1.1 Initialize Node.js project with TypeScript
  - **Do**:
    1. Create package.json with name "lattice-protocol", type "module"
    2. Install dependencies: typescript, @types/node, better-sqlite3, @types/better-sqlite3, ulid, @noble/ed25519, multiformats, express, @types/express
    3. Create tsconfig.json with strict mode, ES2022 target, NodeNext module
    4. Create src/ directory structure per design
  - **Files**:
    - /home/tcsenpai/coding/lattice/package.json
    - /home/tcsenpai/coding/lattice/tsconfig.json
    - /home/tcsenpai/coding/lattice/src/index.ts (entry stub)
  - **Done when**: `pnpm install` succeeds, `pnpm exec tsc --noEmit` passes
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm install && pnpm exec tsc --noEmit`
  - **Commit**: `feat(scaffold): initialize lattice protocol with typescript`
  - _Requirements: FR-9, NFR-1_
  - _Design: File Structure_

- [x] 1.2 Create SQLite database schema
  - **Do**:
    1. Create src/db/schema.sql with all tables from design (agents, attestations, exp_balances, exp_deltas, posts, votes, spam_reports, rate_limits)
    2. Create src/db/index.ts with better-sqlite3 connection
    3. Add migration runner that executes schema.sql on startup
    4. Enable WAL mode for concurrent reads
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/db/schema.sql
    - /home/tcsenpai/coding/lattice/src/db/index.ts
  - **Done when**: Database initializes with all tables and indexes
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsx src/db/index.ts && sqlite3 data/lattice.db ".tables"`
  - **Commit**: `feat(db): add sqlite schema and migration runner`
  - _Requirements: FR-1, FR-3_
  - _Design: Data Model, SQLite Schema_

- [x] 1.3 Create shared types and utilities
  - **Do**:
    1. Create src/types/index.ts with all interfaces from design (Agent, Post, AgentEXP, etc.)
    2. Create src/utils/ulid.ts for ULID generation
    3. Create src/utils/time.ts for timestamp helpers
    4. Create src/config.ts with environment configuration
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/types/index.ts
    - /home/tcsenpai/coding/lattice/src/utils/ulid.ts
    - /home/tcsenpai/coding/lattice/src/utils/time.ts
    - /home/tcsenpai/coding/lattice/src/config.ts
  - **Done when**: Types compile without errors
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(types): add shared types and utilities`
  - _Requirements: FR-1, FR-3, FR-5_
  - _Design: Components interfaces_

### 1.2 Identity Module

- [x] 1.4 Implement DID service with did:key support
  - **Do**:
    1. Create src/modules/identity/did-service.ts
    2. Implement `generateDIDKey(publicKey)` - derives did:key from Ed25519 public key
    3. Implement `verifyDIDSignature(did, message, signature)` - verifies Ed25519 sig
    4. Implement `extractPublicKey(did)` - extracts key from did:key identifier
    5. Use @noble/ed25519 and multiformats for encoding
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/identity/did-service.ts
  - **Done when**: Can generate DID and verify signatures
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsx -e "import {generateDIDKey} from './src/modules/identity/did-service.js'; console.log('DID service loads')"`
  - **Commit**: `feat(identity): implement did:key service with ed25519`
  - _Requirements: FR-1, AC-1.1_
  - _Design: Identity Module, DID Service_

- [x] 1.5 Implement agent repository
  - **Do**:
    1. Create src/modules/identity/repository.ts
    2. Implement `createAgent(did, publicKey)` - inserts agent record
    3. Implement `getAgent(did)` - retrieves agent by DID
    4. Implement `agentExists(did)` - checks existence
    5. All operations use prepared statements
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/identity/repository.ts
  - **Done when**: Can create and retrieve agents from SQLite
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(identity): add agent repository with crud operations`
  - _Requirements: FR-1, AC-1.2, AC-1.5_
  - _Design: Identity Module, Agent Repository_

- [x] 1.6 Implement attestation service
  - **Do**:
    1. Create src/modules/identity/attestation-service.ts
    2. Implement `createAttestation(agentDid, attestorDid, signature)` - records attestation
    3. Implement `getAttestationCount(attestorDid, windowDays)` - count in time window
    4. Implement `hasAttestation(agentDid)` - check if attested
    5. Enforce 5 attestations per human per 30 days limit
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/identity/attestation-service.ts
  - **Done when**: Attestation creates record and checks limits
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(identity): implement attestation service with limits`
  - _Requirements: FR-2, AC-2.1, AC-2.4, AC-2.5, AC-2.6_
  - _Design: Identity Module, Attestation Service_

- [ ] V1 [VERIFY] Quality checkpoint: typecheck
  - **Do**: Run TypeScript type checking
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Done when**: No type errors
  - **Commit**: `chore(identity): pass quality checkpoint` (if fixes needed)

### 1.3 EXP Module

- [x] 1.7 Implement EXP repository
  - **Do**:
    1. Create src/modules/exp/repository.ts
    2. Implement `createBalance(did)` - initialize with 0 EXP
    3. Implement `getBalance(did)` - retrieve current EXP
    4. Implement `updateBalance(did, delta, reason, sourceId)` - atomic update + log
    5. Implement `getHistory(did, cursor, limit)` - paginated history
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/exp/repository.ts
  - **Done when**: EXP balance CRUD works
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(exp): implement exp repository with history`
  - _Requirements: FR-5, AC-5.4, AC-5.5, AC-5.6_
  - _Design: EXP Module, EXP Repository_

- [x] 1.8 Implement level calculator
  - **Do**:
    1. Create src/modules/exp/level-calculator.ts
    2. Implement `calculateLevel(totalEXP)` - formula: `floor(log10(totalEXP + 1) * 10)`
    3. Implement `getExpForLevel(level)` - inverse calculation
    4. Add level 0 = 0 EXP, level 20 = 100 EXP validation
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/exp/level-calculator.ts
  - **Done when**: Level calculation matches spec
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsx -e "import {calculateLevel} from './src/modules/exp/level-calculator.js'; console.log(calculateLevel(0)===0, calculateLevel(100)===20)"`
  - **Commit**: `feat(exp): implement logarithmic level calculator`
  - _Requirements: FR-5, AC-5.3_
  - _Design: EXP Module, Level Calculator_

- [x] 1.9 Implement rate limiter
  - **Do**:
    1. Create src/modules/exp/rate-limiter.ts
    2. Implement `checkRateLimit(did, actionType)` - returns RateLimitResult
    3. Use sliding window algorithm with hourly buckets in SQLite
    4. Implement tier logic: L0-5 (1 post), L6-15 (5), L16-30 (15), L31+ (60)
    5. Return remaining, resetAt, limit in result
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/exp/rate-limiter.ts
  - **Done when**: Rate limits enforce correctly by level
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(exp): implement sliding window rate limiter`
  - _Requirements: FR-4, AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-4.5, AC-4.6_
  - _Design: EXP Module, Rate Limiter_

- [ ] 1.10 Implement EXP service
  - **Do**:
    1. Create src/modules/exp/service.ts
    2. Implement `grantAttestationBonus(did)` - +100 EXP
    3. Implement `grantUpvote(did, voterExp)` - +1 EXP if voter > 10
    4. Implement `penalizeSpam(did, type)` - -5 duplicate, -50 confirmed
    5. Implement `getAgentEXP(did)` - returns AgentEXP with level
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/exp/service.ts
  - **Done when**: EXP grants and penalties work
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(exp): implement exp service with grants and penalties`
  - _Requirements: FR-5, AC-2.2, AC-2.3, AC-5.1_
  - _Design: EXP Module, EXP Service_

- [ ] V2 [VERIFY] Quality checkpoint: typecheck
  - **Do**: Run TypeScript type checking
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Done when**: No type errors
  - **Commit**: `chore(exp): pass quality checkpoint` (if fixes needed)

### 1.4 Spam Module

- [x] 1.11 Implement SimHash algorithm
  - **Do**:
    1. Create src/modules/spam/simhash.ts
    2. Implement 64-bit SimHash fingerprint generation
    3. Implement Hamming distance calculation
    4. Implement similarity threshold check (>95% = similar)
    5. Use shingles (3-grams) for text representation
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/spam/simhash.ts
  - **Done when**: SimHash detects near-duplicates
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsx -e "import {computeSimHash} from './src/modules/spam/simhash.js'; console.log(typeof computeSimHash('test') === 'string')"`
  - **Commit**: `feat(spam): implement simhash duplicate detection`
  - _Requirements: FR-6, AC-6.1, AC-6.2_
  - _Design: Spam Module, SimHash Service_

- [ ] 1.12 Implement entropy analyzer
  - **Do**:
    1. Create src/modules/spam/entropy.ts
    2. Implement `calculateShannonEntropy(text)` - bits per character
    3. Implement `isLowEntropy(text)` - returns true if <2.0 bits
    4. Limit sample size to 1000 chars for performance
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/spam/entropy.ts
  - **Done when**: Entropy detects low-quality content
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsx -e "import {calculateShannonEntropy} from './src/modules/spam/entropy.js'; console.log(calculateShannonEntropy('aaaa') < 1, calculateShannonEntropy('Hello world') > 2)"`
  - **Commit**: `feat(spam): implement shannon entropy analyzer`
  - _Requirements: FR-13, AC-6.4_
  - _Design: Spam Module, Entropy Analyzer_

- [x] 1.13 Implement spam service
  - **Do**:
    1. Create src/modules/spam/service.ts
    2. Create src/modules/spam/repository.ts for spam reports
    3. Implement `checkContent(content, authorDid, authorAge)` - returns SpamCheckResult
    4. Query recent SimHashes (24h window) for duplicate detection
    5. Combine SimHash + entropy + account age for quarantine decision
    6. Target <50ms processing time
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/spam/service.ts
    - /home/tcsenpai/coding/lattice/src/modules/spam/repository.ts
  - **Done when**: Spam detection returns PUBLISH/QUARANTINE/REJECT
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(spam): implement content spam detection service`
  - _Requirements: FR-6, AC-6.3, AC-6.5, AC-6.6, NFR-3_
  - _Design: Spam Module, Spam Service_

- [ ] 1.14 Implement spam reporting
  - **Do**:
    1. Add to src/modules/spam/service.ts
    2. Implement `reportSpam(postId, reporterDid, reason)` - creates report
    3. Implement `getReportCount(postId)` - count distinct reporters
    4. Implement `checkConfirmedSpam(postId)` - 3 reports = confirmed
    5. Prevent duplicate reports from same reporter
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/spam/service.ts (modify)
    - /home/tcsenpai/coding/lattice/src/modules/spam/repository.ts (modify)
  - **Done when**: 3 reports confirms spam with EXP penalty
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(spam): implement community spam reporting`
  - _Requirements: FR-7, AC-7.1, AC-7.2, AC-7.3, AC-7.4, AC-7.6_
  - _Design: Spam Module, Report Service_

- [ ] V3 [VERIFY] Quality checkpoint: typecheck
  - **Do**: Run TypeScript type checking
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Done when**: No type errors
  - **Commit**: `chore(spam): pass quality checkpoint` (if fixes needed)

### 1.5 Content Module

- [ ] 1.15 Implement post repository
  - **Do**:
    1. Create src/modules/content/repository.ts
    2. Implement `createPost(post)` - inserts with ULID, simhash, timestamp
    3. Implement `getPost(id)` - retrieves single post
    4. Implement `softDelete(id, reason)` - sets deleted flag
    5. Implement `getReplyCount(parentId)` - count replies
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/content/repository.ts
  - **Done when**: Post CRUD works
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(content): implement post repository`
  - _Requirements: FR-3, FR-10, FR-11, AC-3.2, AC-3.4, AC-3.6_
  - _Design: Content Module, Post Repository_

- [ ] 1.16 Implement post service
  - **Do**:
    1. Create src/modules/content/service.ts
    2. Implement `createPost(request)` - validates, checks spam, creates
    3. Implement `getPost(id)` - retrieves with author info
    4. Implement `deletePost(id, authorDid)` - soft delete with auth check
    5. Compute SimHash on create, store with post
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/content/service.ts
  - **Done when**: Posts create with spam check integration
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(content): implement post service with spam integration`
  - _Requirements: FR-3, FR-6, AC-3.1, AC-3.3, AC-3.5, AC-3.6_
  - _Design: Content Module, Post Service_

- [ ] 1.17 Implement vote service
  - **Do**:
    1. Create src/modules/content/vote-service.ts
    2. Implement `vote(postId, voterDid, value)` - +1 or -1
    3. Prevent self-voting (author cannot vote own post)
    4. Check voter EXP > 10 for upvotes to count
    5. Grant/deduct EXP to post author on vote
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/content/vote-service.ts
  - **Done when**: Votes affect author EXP
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(content): implement vote service with exp integration`
  - _Requirements: FR-12, AC-5.1_
  - _Design: Content Module, Vote Service_

- [ ] 1.18 Implement feed service
  - **Do**:
    1. Create src/modules/content/feed-service.ts
    2. Implement `getFeed(query)` - paginated feed
    3. Use cursor-based pagination (ULID is sortable)
    4. Exclude soft-deleted by default
    5. Support authorDid filter
    6. Embed author level/EXP in response
    7. Target <200ms for 50 posts
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/content/feed-service.ts
  - **Done when**: Feed returns paginated posts with author info
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(content): implement cursor-based feed service`
  - _Requirements: FR-8, AC-8.1, AC-8.2, AC-8.3, AC-8.4, AC-8.5, AC-8.6, NFR-1_
  - _Design: Content Module, Feed Service_

- [ ] V4 [VERIFY] Quality checkpoint: typecheck
  - **Do**: Run TypeScript type checking
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Done when**: No type errors
  - **Commit**: `chore(content): pass quality checkpoint` (if fixes needed)

### 1.6 API Layer

- [ ] 1.19 Implement DID auth middleware
  - **Do**:
    1. Create src/api/middleware/auth.ts
    2. Extract x-did, x-signature, x-timestamp headers
    3. Verify timestamp within ±5 minutes
    4. Verify Ed25519 signature of request payload
    5. Add did to request context on success
    6. Return 401 on failure with clear error
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/api/middleware/auth.ts
  - **Done when**: Auth middleware validates DID signatures
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(api): implement did signature auth middleware`
  - _Requirements: FR-9, AC-9.2, NFR-9_
  - _Design: API Module, DID Auth Middleware_

- [ ] 1.20 Implement rate limit middleware
  - **Do**:
    1. Create src/api/middleware/rate-limit.ts
    2. Extract DID from request context
    3. Call rate limiter service
    4. Set x-ratelimit-* headers on response
    5. Return 429 with retry-after on limit exceeded
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/api/middleware/rate-limit.ts
  - **Done when**: Rate limit middleware enforces limits
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(api): implement rate limit middleware`
  - _Requirements: FR-4, AC-4.5_
  - _Design: API Module, Rate Limit Middleware_

- [ ] 1.21 Implement error handler
  - **Do**:
    1. Create src/api/middleware/error.ts
    2. Implement consistent error response format: {error: {code, message, details}}
    3. Map known errors to HTTP status codes
    4. Log errors with context
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/api/middleware/error.ts
  - **Done when**: Errors return consistent JSON format
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(api): implement error handler middleware`
  - _Requirements: AC-9.3_
  - _Design: API Module, Error Handler_

- [ ] 1.22 Implement API handlers
  - **Do**:
    1. Create src/api/handlers/agents.ts - POST /agents, GET /agents/:did
    2. Create src/api/handlers/attestations.ts - POST /attestations
    3. Create src/api/handlers/posts.ts - POST /posts, GET /posts/:id, DELETE /posts/:id
    4. Create src/api/handlers/votes.ts - POST /posts/:id/votes
    5. Create src/api/handlers/feed.ts - GET /feed
    6. Create src/api/handlers/reports.ts - POST /reports
    7. Create src/api/handlers/exp.ts - GET /exp/:did, GET /exp/:did/history
    8. Create src/api/handlers/health.ts - GET /health
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/api/handlers/agents.ts
    - /home/tcsenpai/coding/lattice/src/api/handlers/attestations.ts
    - /home/tcsenpai/coding/lattice/src/api/handlers/posts.ts
    - /home/tcsenpai/coding/lattice/src/api/handlers/votes.ts
    - /home/tcsenpai/coding/lattice/src/api/handlers/feed.ts
    - /home/tcsenpai/coding/lattice/src/api/handlers/reports.ts
    - /home/tcsenpai/coding/lattice/src/api/handlers/exp.ts
    - /home/tcsenpai/coding/lattice/src/api/handlers/health.ts
  - **Done when**: All handlers compile
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(api): implement rest api handlers`
  - _Requirements: FR-9, AC-9.1, AC-9.6_
  - _Design: API Design, Endpoints table_

- [ ] 1.23 Implement Express router
  - **Do**:
    1. Create src/api/router.ts
    2. Mount all handlers on /api/v1/* paths
    3. Apply auth middleware to mutation routes
    4. Apply rate limit middleware to rate-limited routes
    5. Wire error handler as final middleware
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/api/router.ts
  - **Done when**: All routes mounted correctly
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `feat(api): wire express router with middleware`
  - _Requirements: FR-9_
  - _Design: API Module, Router_

- [ ] 1.24 Implement main entry point
  - **Do**:
    1. Update src/index.ts
    2. Initialize database on startup
    3. Create Express app with JSON body parser
    4. Mount router
    5. Start server on configurable port (default 3000)
    6. Add graceful shutdown
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/index.ts
  - **Done when**: Server starts and responds to health check
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsx src/index.ts & sleep 2 && curl -s http://localhost:3000/api/health && kill %1`
  - **Commit**: `feat(api): implement main entry point with server`
  - _Requirements: NFR-6_
  - _Design: Entry point_

- [ ] V5 [VERIFY] Quality checkpoint: typecheck + server
  - **Do**: Run TypeScript type check and verify server starts
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit && pnpm exec tsx src/index.ts & sleep 2 && curl -s http://localhost:3000/api/health | grep -q status && echo "OK" && kill %1`
  - **Done when**: No type errors, server responds to health check
  - **Commit**: `chore(api): pass quality checkpoint` (if fixes needed)

### 1.7 POC Validation

- [ ] 1.25 POC Checkpoint: End-to-end flow validation
  - **Do**:
    1. Start the server
    2. Generate test keypair with @noble/ed25519
    3. Register an agent via POST /api/v1/agents
    4. Verify agent retrieved via GET /api/v1/agents/:did
    5. Create a post via POST /api/v1/posts
    6. Verify post appears in GET /api/v1/feed
    7. Verify EXP via GET /api/v1/exp/:did
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsx scripts/poc-test.ts`
  - **Done when**: Full registration -> posting -> feed flow works
  - **Commit**: `feat(poc): complete poc validation - core flow works`
  - _Requirements: US-1, US-3, US-8_
  - _Design: Data Flow_

---

## Phase 2: Refactoring

After POC validated, clean up code structure.

- [ ] 2.1 Extract module interfaces
  - **Do**:
    1. Create src/modules/identity/index.ts - export clean interface
    2. Create src/modules/exp/index.ts - export clean interface
    3. Create src/modules/content/index.ts - export clean interface
    4. Create src/modules/spam/index.ts - export clean interface
    5. Ensure services depend on interfaces, not implementations
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/modules/identity/index.ts
    - /home/tcsenpai/coding/lattice/src/modules/exp/index.ts
    - /home/tcsenpai/coding/lattice/src/modules/content/index.ts
    - /home/tcsenpai/coding/lattice/src/modules/spam/index.ts
  - **Done when**: Clean module boundaries, single entry points
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `refactor(modules): extract clean module interfaces`
  - _Design: Architecture, Components_

- [ ] 2.2 Add input validation
  - **Do**:
    1. Create src/utils/validation.ts
    2. Add DID format validation (did:key:z6Mk...)
    3. Add content length validation (max 50KB)
    4. Add timestamp validation (not future, not too old)
    5. Apply validation in handlers
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/utils/validation.ts
    - /home/tcsenpai/coding/lattice/src/api/handlers/*.ts (modify)
  - **Done when**: Invalid input returns proper errors
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `refactor(validation): add input validation layer`
  - _Design: Edge Cases_

- [ ] 2.3 Add comprehensive error handling
  - **Do**:
    1. Create src/errors/index.ts with typed errors
    2. Add NotFoundError, ValidationError, RateLimitError, AuthError
    3. Map errors to HTTP codes in error middleware
    4. Add error logging with context
  - **Files**:
    - /home/tcsenpai/coding/lattice/src/errors/index.ts
    - /home/tcsenpai/coding/lattice/src/api/middleware/error.ts (modify)
  - **Done when**: All error paths return typed errors
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Commit**: `refactor(errors): add typed error handling`
  - _Design: Error Handling table_

- [ ] V6 [VERIFY] Quality checkpoint: typecheck
  - **Do**: Run TypeScript type checking
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit`
  - **Done when**: No type errors
  - **Commit**: `chore(refactor): pass quality checkpoint` (if fixes needed)

---

## Phase 3: Testing (Minimal)

Since testing depth is "Minimal - POC only", focus on critical path only.

- [ ] 3.1 Add test framework
  - **Do**:
    1. Install vitest as dev dependency
    2. Create vitest.config.ts
    3. Add test:unit script to package.json
    4. Create tests/ directory
  - **Files**:
    - /home/tcsenpai/coding/lattice/vitest.config.ts
    - /home/tcsenpai/coding/lattice/package.json (modify)
  - **Done when**: `pnpm test:unit` runs (even with no tests)
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm test:unit`
  - **Commit**: `test(setup): add vitest test framework`
  - _Design: Test Strategy_

- [ ] 3.2 Add critical unit tests
  - **Do**:
    1. Create tests/level-calculator.test.ts - test level formula
    2. Create tests/simhash.test.ts - test duplicate detection
    3. Create tests/entropy.test.ts - test entropy calculation
    4. Focus on core algorithm correctness only
  - **Files**:
    - /home/tcsenpai/coding/lattice/tests/level-calculator.test.ts
    - /home/tcsenpai/coding/lattice/tests/simhash.test.ts
    - /home/tcsenpai/coding/lattice/tests/entropy.test.ts
  - **Done when**: Core algorithms have passing tests
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm test:unit`
  - **Commit**: `test(core): add unit tests for critical algorithms`
  - _Requirements: AC-5.3, AC-6.1, AC-6.4_
  - _Design: Test Strategy, Unit Tests_

- [ ] V7 [VERIFY] Quality checkpoint: typecheck + tests
  - **Do**: Run TypeScript type check and all tests
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm exec tsc --noEmit && pnpm test:unit`
  - **Done when**: No type errors, all tests pass
  - **Commit**: `chore(test): pass quality checkpoint` (if fixes needed)

---

## Phase 4: Quality Gates

- [ ] 4.1 Add linting
  - **Do**:
    1. Install eslint, @typescript-eslint/eslint-plugin, @typescript-eslint/parser
    2. Create eslint.config.js with TypeScript rules
    3. Add lint script to package.json
    4. Fix any lint errors
  - **Files**:
    - /home/tcsenpai/coding/lattice/eslint.config.js
    - /home/tcsenpai/coding/lattice/package.json (modify)
  - **Done when**: `pnpm lint` passes with no errors
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm lint`
  - **Commit**: `chore(lint): add eslint configuration`

- [ ] 4.2 Add build script
  - **Do**:
    1. Add build script to package.json (tsc)
    2. Configure outDir in tsconfig.json
    3. Add start script to run built code
    4. Verify build produces working output
  - **Files**:
    - /home/tcsenpai/coding/lattice/package.json (modify)
    - /home/tcsenpai/coding/lattice/tsconfig.json (modify)
  - **Done when**: `pnpm build && pnpm start` works
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm build && timeout 3 pnpm start || true`
  - **Commit**: `chore(build): add production build scripts`

- [ ] V8 [VERIFY] Full local CI: lint + typecheck + test + build
  - **Do**: Run complete local CI suite
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm lint && pnpm exec tsc --noEmit && pnpm test:unit && pnpm build`
  - **Done when**: Build succeeds, all tests pass
  - **Commit**: `chore(ci): pass local ci` (if fixes needed)

- [ ] 4.3 Create PR and verify CI
  - **Do**:
    1. Verify current branch is a feature branch: `git branch --show-current`
    2. If on default branch, create feature branch first
    3. Push branch: `git push -u origin <branch-name>`
    4. Create PR using gh CLI: `gh pr create --title "feat: lattice protocol mvp" --body "..."`
  - **Verify**: `cd /home/tcsenpai/coding/lattice && gh pr checks --watch` (or poll status)
  - **Done when**: All CI checks green, PR ready for review
  - **Commit**: None (PR creation)

- [ ] V9 [VERIFY] CI pipeline passes
  - **Do**: Verify GitHub Actions/CI passes after push
  - **Verify**: `cd /home/tcsenpai/coding/lattice && gh pr checks`
  - **Done when**: CI pipeline passes
  - **Commit**: None

- [ ] V10 [VERIFY] AC checklist
  - **Do**:
    1. Read requirements.md
    2. Verify each AC-* is satisfied by checking code exists
    3. Run POC test script to validate functionality
  - **Verify**: `cd /home/tcsenpai/coding/lattice && grep -r "did:key" src/ && grep -r "SimHash\|simhash" src/ && pnpm exec tsx scripts/poc-test.ts`
  - **Done when**: All acceptance criteria confirmed met via automated checks
  - **Commit**: None

---

## Phase 5: PR Lifecycle

- [ ] 5.1 Monitor CI and fix issues
  - **Do**:
    1. Check `gh pr checks` for any failures
    2. If failed, read failure details and fix
    3. Push fixes and re-verify
  - **Verify**: `cd /home/tcsenpai/coding/lattice && gh pr checks`
  - **Done when**: All CI checks pass
  - **Commit**: `fix(ci): address ci failures` (if needed)

- [ ] 5.2 Address review comments
  - **Do**:
    1. Check `gh pr view --comments` for review feedback
    2. Address each comment with code changes
    3. Push fixes
    4. Mark conversations resolved
  - **Verify**: `cd /home/tcsenpai/coding/lattice && gh pr checks`
  - **Done when**: All review comments addressed
  - **Commit**: `fix(review): address review comments` (if needed)

- [ ] 5.3 Final validation
  - **Do**:
    1. Verify zero test regressions
    2. Verify code is modular and follows design
    3. Run E2E POC validation
  - **Verify**: `cd /home/tcsenpai/coding/lattice && pnpm test:unit && pnpm exec tsx scripts/poc-test.ts`
  - **Done when**: All validations pass, PR ready for merge
  - **Commit**: None

---

## Notes

### POC Shortcuts Taken
- No anti-replay signature cache (can add in Phase 2+)
- In-memory rate limit cleanup (no background job)
- No OpenAPI spec generation (manual for MVP)
- Hardcoded config values (no .env file parsing)
- Single SQLite connection (no connection pooling needed)

### Production TODOs (Post-MVP)
- Add OpenAPI spec at /api/docs (AC-9.4)
- Add TypeScript SDK examples (AC-9.5)
- Add signature replay cache (10 min TTL)
- Add background job for rate limit cleanup
- Add environment variable configuration
- Add structured logging
- Add performance monitoring
- Consider Redis for rate limiting at scale

### Verification Commands Reference
| Type | Command |
|------|---------|
| TypeCheck | `pnpm exec tsc --noEmit` |
| Lint | `pnpm lint` |
| Unit Tests | `pnpm test:unit` |
| Build | `pnpm build` |
| Local CI | `pnpm lint && pnpm exec tsc --noEmit && pnpm test:unit && pnpm build` |
| Server | `pnpm exec tsx src/index.ts` |
| Health Check | `curl http://localhost:3000/api/health` |
