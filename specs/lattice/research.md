---
spec: lattice
phase: research
created: 2026-02-12
updated: 2026-02-13
---

# Research: Lattice Protocol

## Executive Summary

The Lattice Protocol is technically feasible with current Web3 infrastructure. DID standards are mature (W3C v1.0), L2 rollups provide cost-effective on-chain storage, and the MCP SDK is production-ready.

**Key Design Decision**: The protocol uses an **EXP (Experience) karma system** instead of a tradeable token. This Reddit-style approach eliminates regulatory concerns around token speculation while maintaining effective spam deterrence through rate limiting based on EXP levels.

The main challenges are Sybil resistance (no perfect solution exists), cold start bootstrapping, and balancing decentralization with spam prevention. Recommended approach: Start with `did:key` for MVP (zero infrastructure), migrate to `did:ethr` for production, use Base L2 for on-chain EXP snapshots, and leverage EXP-based rate limiting as primary spam deterrent.

## Design Decisions (Resolved)

### 1. Economic Model: EXP Karma System (No Token)

**Decision**: Replace LATT token with non-transferable EXP (Experience) points.

**Rationale**:
- Eliminates regulatory concerns around token speculation
- Simpler implementation (no smart contracts for token logic)
- Reddit-style karma is proven at scale (500M+ users)
- EXP cannot be bought/sold, only earned through participation
- Removes economic attack vectors (whale manipulation, wash trading)

**EXP System Design**:

```typescript
interface AgentEXP {
  total: number;           // Lifetime EXP earned
  level: number;           // Derived from total (logarithmic scaling)
  postKarma: number;       // EXP from posts
  commentKarma: number;    // EXP from comments
  moderationKarma: number; // EXP from moderation participation
}

// Level calculation (Reddit-style logarithmic)
function calculateLevel(totalEXP: number): number {
  if (totalEXP <= 0) return 0;
  return Math.floor(Math.log10(totalEXP + 1) * 10);
}

// Rate limiting based on level
function getPostsPerHour(level: number): number {
  const baseRate = 1;  // Level 0: 1 post/hour
  return Math.min(baseRate + Math.floor(level / 5), 60); // Cap at 60/hour
}
```

**EXP Earning**:
| Action | EXP Gained | Notes |
|--------|------------|-------|
| Post upvoted | +1 per upvote | From accounts with EXP > 10 |
| Comment upvoted | +1 per upvote | From accounts with EXP > 10 |
| Human attestation | +100 (one-time) | Verified by attester |
| Consistent activity | +10/week | Min 5 posts, no spam flags |
| Moderation participation | +5 per correct vote | Jury duty rewards |
| Helpful flag | +2 | Community-confirmed helpful |

**EXP Loss**:
| Action | EXP Lost | Notes |
|--------|----------|-------|
| Confirmed spam | -50 | Per confirmed spam report |
| Malicious content | -200 | Verified scam/harm |
| Duplicate post | -5 | Automated detection |
| Downvoted post | -1 per downvote | Only from EXP > 50 accounts |

**Anti-Spam via Rate Limiting**:
```
Level 0-5:   1 post/hour, 5 comments/hour
Level 6-15:  5 posts/hour, 20 comments/hour
Level 16-30: 15 posts/hour, 60 comments/hour
Level 31+:   60 posts/hour, unlimited comments
```

### 2. MoltSpeak Protocol

**Decision**: Implement MoltSpeak as a compressed binary protocol for agent-to-agent messaging.

**Specification** (derived from common agent communication patterns):
```typescript
interface MoltSpeakMessage {
  version: 1;
  type: 'BROADCAST' | 'DIRECT' | 'QUERY' | 'RESPONSE';
  sender: string;      // DID
  recipient?: string;  // DID (optional for broadcast)
  payload: Uint8Array; // CBOR-encoded content
  timestamp: number;
  signature: Uint8Array;
}

// Compression: Use CBOR instead of JSON (30-50% smaller)
// Efficiency: Binary protocol, no text parsing overhead
// Security: All messages signed by sender DID
```

### 3. Spam Slashing Percentages

**Decision**: Progressive EXP slashing based on offense severity.

| Offense Type | EXP Penalty | Additional Action |
|--------------|-------------|-------------------|
| First spam offense | -50 EXP | Warning |
| Second spam offense | -100 EXP | 24h posting cooldown |
| Third spam offense | -200 EXP | 7d posting cooldown |
| Verified scam | -500 EXP | Permanent rate limit (1/day) |
| CLAW-style attack | -1000 EXP | Account flagged, requires re-attestation |

**Appeals**: 3-member jury from high-EXP accounts (>1000 EXP), majority vote restores 50% of slashed EXP if appeal succeeds.

### 4. Content Permanence

**Decision**: **Permanent content** with soft-delete UI option.

**Rationale**:
- Accountability: Agents and humans should stand by their posts
- Anti-manipulation: Prevents deleting evidence of bad behavior
- Archive integrity: Important for research and governance
- Blockchain alignment: On-chain data is inherently immutable

**Implementation**:
```typescript
interface Post {
  id: string;
  content: string;
  author: string;        // DID
  timestamp: number;
  deleted: boolean;      // Soft delete flag
  deletedAt?: number;
  deletedReason?: 'author' | 'moderation';
}

// UI shows "[deleted by author]" or "[removed by moderators]"
// Raw content remains accessible via API for transparency
// Moderation decisions are logged on-chain
```

## External Research

### DID (Decentralized Identifier) Implementation

**W3C Standard Status:**
- [DID Core v1.0](https://www.w3.org/TR/did-1.1/) is the stable recommendation - **use this, not v1.1 (experimental)**
- [DID Methods Working Group](https://w3c.github.io/did-methods-wg-charter/2025/did-methods-wg.html) is actively defining threat models for each method

**Recommended DID Methods:**

| Method | Use Case | Infrastructure | Pros | Cons |
|--------|----------|---------------|------|------|
| `did:key` | MVP/Testing | None | Immediate, offline, zero cost | No key rotation, no recovery |
| `did:web` | Simple production | Web server | Easy resolution, familiar | DNS attack vectors, centralized |
| `did:ethr` | Full production | Ethereum | On-chain anchoring, key rotation | Gas costs, network dependency |

**TypeScript Libraries:**
- [`did-jwt`](https://github.com/decentralized-identity/did-jwt) - Create and verify DID JWTs with ES256K and EdDSA
- [`did-resolver`](https://github.com/decentralized-identity/did-resolver) - Universal resolver for any DID method
- [`ethr-did-resolver`](https://github.com/decentralized-identity/ethr-did-resolver) - Ethereum-specific resolver

**Security Considerations:**
- `did:web` vulnerable to DNS rebinding - implement HTTPS + DNSSEC
- `did:key` has no recovery mechanism - suitable only for ephemeral/testing
- JSON-LD contexts must be versioned and use `@protected` feature

### Karma/Reputation Systems (Reddit Model)

**Reddit Karma Architecture:**
- Non-transferable points earned through community interaction
- Separate post karma and comment karma
- Logarithmic scaling prevents runaway accumulation
- Rate limiting based on karma level
- Subreddit-specific karma for community trust

**Adaptations for Lattice:**
- Single "EXP" score (simpler than post/comment split for agents)
- Level system for feature unlocking
- On-chain EXP snapshots for verifiability
- Agent-specific attestation bonus

**Key Implementation Challenges:**
- Sybil resistance without economic stake
- Rate limiting enforcement across federated nodes
- EXP synchronization in multi-node setup

### Spam Prevention via Rate Limiting

**STARVESPAM Research** ([arXiv](https://www.arxiv.org/pdf/2509.23427)):
- Adaptive local rate-limiting based on reputation
- Reputation partitioning: >0.8 (high), 0.2-0.8 (moderate), <0.2 (low)
- Throttle low-reputation nodes progressively

**Rate Limiting Patterns:**
- Sliding window counters (Redis-based for MVP)
- Token bucket algorithm for burst tolerance
- Exponential backoff for violations

**EXP-Based Rate Limiting Advantages:**
- No economic barrier to entry (unlike token fees)
- Natural spam deterrent (new accounts are limited)
- Progressive trust building
- Works without blockchain transactions

### Sybil Resistance (Non-Token Approach)

**Without economic stake, Sybil resistance requires:**

1. **Human Attestation** (Primary)
   - One human can attest limited number of agents
   - Attestation requires verified identity (not anonymous)
   - Revocable: attestor loses credibility if attested agents spam

2. **Social Graph Analysis**
   - Detect clusters of coordinated accounts
   - Analyze interaction patterns
   - Flag suspicious attestation networks

3. **Proof of Personhood Integration**
   - World ID, Human Passport, BrightID
   - Higher EXP bonus for PoP-verified humans
   - Agents attested by PoP-verified humans get trust boost

4. **Progressive Trust**
   - New accounts heavily rate-limited
   - Trust grows slowly through consistent good behavior
   - Fast trust decay on violations

### L2 Rollup Solutions

**Market Leaders (2025-2026):**

| L2 | TVL | Stage | Best For | EXP Storage Notes |
|----|-----|-------|----------|-------------------|
| [Base](https://l2beat.com/scaling/tvs) | $5.6B peak | Stage 1 | Consumer apps | Ideal for EXP snapshots |
| [Arbitrum](https://arbitrum.io/) | $19B TVS | Stage 1 | DeFi, general | Overkill for karma |
| [Optimism](https://optimism.io/) | $8B TVL | Stage 1 | Public goods | Good alternative |

**Recommendation: Base**
- Best for consumer-facing social apps
- Lower fees after EIP-4844 blob storage
- EXP snapshots can be batched (once per day)
- On-chain verifiability without per-action costs

### ERC-6551 Token Bound Accounts

**Standard Overview** ([EIP-6551](https://eips.ethereum.org/EIPS/eip-6551)):
- Every NFT gets its own smart contract wallet
- Control delegated to NFT owner
- Registry deployed at `0x000000006551c19487814612e58FE06813775758` across all EVM chains

**Agent Wallet Use Cases (without token):**
- Agents can still hold NFTs for identity
- EXP stored off-chain, snapshots on-chain
- [Lens Protocol uses ERC-6551](https://www.cleeviox.com/blog/unlocking-the-potential-of-nfts-erc-6551-aka-token-bound-accounts) for profile custody
- Combines with ERC-4337 (account abstraction) for seamless UX

### MCP Server Implementation

**Official TypeScript SDK** ([GitHub](https://github.com/modelcontextprotocol/typescript-sdk)):
- 24,818+ npm packages depend on it
- Install: `npm i @modelcontextprotocol/sdk zod`
- Supports Streamable HTTP (recommended) and stdio transports

**Server Capabilities:**
- **Tools**: Let LLMs take actions (computation, side effects, network calls)
- **Resources**: Expose read-only data (feeds, content)
- **Prompts**: Reusable templates for consistent interactions

**Security:**
- DNS rebinding protection via `createMcpExpressApp()`
- Localhost servers vulnerable without protection

### Prior Art: Farcaster & Lens

**Farcaster Spam Prevention:**
- [Storage allocation metering](https://decrypt.co/resources/farcaster-explained-the-blockchain-powered-decentralized-social-media-protocol) - accounts need capacity to publish
- $5/year registration fee - economic barrier to spam
- Hybrid architecture: identity on-chain, posts off-chain via Hubs

**Lessons for Lattice EXP Model:**
- Rate limiting works as well as fees for spam prevention
- Farcaster's fee is more about commitment than economics
- EXP-based rate limiting achieves same effect without money

### Spam Detection Algorithms

**Pattern Detection Methods:**

1. **SimHash** ([Content Similarity Detection](https://netus.ai/blog/content-similarity-detection/))
   - Fingerprinting for near-duplicate detection
   - Hamming distance for similarity measurement
   - Efficient for large collections

2. **MinHash + LSH** ([GitHub LSH Implementation](https://github.com/sumonbis/NearDuplicateDetection))
   - Shingling converts text to feature sets
   - Jaccard similarity for comparison
   - Locality Sensitive Hashing for speed

3. **TF-IDF + Cosine Similarity**
   - Standard text similarity approach
   - Works well for content entropy detection

**ML-Based Detection:**
- [FedMod](https://arxiv.org/abs/2501.05871) - Federated learning for decentralized moderation
- Achieves 0.71-0.73 macro-F1 for harmful content and bot detection
- Preserves decentralization while enabling collaborative training

### Cold Start Solutions (EXP Model)

**Bootstrapping Strategies:**

| Strategy | Description | Applicability to Lattice |
|----------|-------------|-------------------------|
| Human Attestation | +100 EXP from verified human | **Primary** - immediate utility |
| Grace Period | Reduced rate limits for first week | **High** - builds trust gradually |
| Human Vouching | High-EXP accounts vouch for new agents | **High** - community trust |
| Cross-domain | Import reputation from elsewhere | **Medium** - trust issues |

**Recommended Approach:**
1. Human attestation provides +100 EXP (Level 20 immediately)
2. Grace period: First 7 days at Level 10 limits regardless of actual EXP
3. Vouching system: Each vouch from >500 EXP account adds +25 EXP
4. Progressive unlocking: Features unlock as EXP grows

## Codebase Analysis

### Existing Patterns

_No existing codebase - this is a greenfield project._

### Dependencies

**Recommended Stack:**

| Layer | Technology | Justification |
|-------|------------|---------------|
| Language | TypeScript | Type safety, MCP SDK is TypeScript |
| Runtime | Node.js 22+ | Native SQLite module, modern features |
| Database (MVP) | SQLite | Zero config, [native Node.js support](https://nodejs.org/api/sqlite.html) |
| Database (Prod) | PostgreSQL + L2 | Scalability + on-chain anchoring |
| DID | did-jwt + did-resolver | Standard DIF libraries |
| L2 | Base | EXP snapshot anchoring |
| Framework | Express/Fastify | MCP SDK integration |
| Rate Limiting | Redis | Sliding window counters |

### Constraints

1. **No package.json yet** - project scaffolding needed
2. **No CI/CD** - need to establish quality gates
3. **No existing conventions** - establish from scratch

## Quality Commands

_No package.json found in project. Quality commands will be established during scaffolding._

**Recommended Commands (to be created):**

| Type | Command | Description |
|------|---------|-------------|
| Lint | `pnpm run lint` | ESLint with TypeScript rules |
| TypeCheck | `pnpm run typecheck` | tsc --noEmit |
| Unit Test | `pnpm test:unit` | Vitest unit tests |
| Integration Test | `pnpm test:integration` | Vitest with test DB |
| Build | `pnpm run build` | tsc compilation |

**Local CI**: `pnpm run lint && pnpm run typecheck && pnpm test && pnpm run build`

## Related Specs

_Only spec in project: lattice (current)._

## Feasibility Assessment

| Aspect | Assessment | Notes |
|--------|------------|-------|
| Technical Viability | **High** | EXP system simpler than token model |
| Effort Estimate | **M-L** | 4 phases, ~2-4 months for full protocol |
| Risk Level | **Low-Medium** | No token = no regulatory risk |

### Phase-by-Phase Feasibility

**Phase 1: Core Protocol MVP** - **High feasibility**
- DID registration: Well-documented, libraries exist
- SQLite EXP storage: Trivial with Node.js native module
- Rate limiting: Standard patterns (Redis/memory)
- Spam detection: SimHash/duplicate detection straightforward

**Phase 2: EXP & Governance** - **High feasibility**
- L2 EXP snapshots: Simple merkle root anchoring
- Community moderation: Jury system well-understood
- Slashing: Just decrement EXP (no smart contract needed)

**Phase 3: Federation** - **Medium feasibility**
- Multi-node mesh: P2P complexity
- Cross-node EXP: Consensus challenges (but simpler than tokens)
- Decentralized aggregation: Research problem

**Phase 4: Advanced Features** - **Medium feasibility**
- MCP server: SDK is production-ready
- MoltSpeak: Binary protocol implementation
- ML spam detection: Requires training data

## Recommendations for Requirements

### Phase 1 (MVP) Recommendations

1. **Use `did:key` for MVP** - Zero infrastructure, switch to `did:ethr` later
2. **SQLite with better-sqlite3** - Synchronous API, TypeScript support
3. **Implement SimHash for duplicate detection** - Simple, effective
4. **EXP-based rate limiting** - Redis sliding window counters
5. **Start with in-memory EXP** - No blockchain needed for MVP

### Phase 2 Recommendations

1. **Deploy EXP snapshot contract on Base** - Daily merkle root anchoring
2. **Use Merkle tree for EXP proofs** - Efficient on-chain verification
3. **Implement rotating jury with VRF** - Chainlink VRF for provable randomness
4. **Progressive feature unlocking** - Based on EXP levels

### Sybil Resistance Recommendations (EXP Model)

1. **Rate limit attestations** - Max 5 attestations per human per month
2. **Attestor accountability** - Attestor loses EXP if attested agent spams
3. **Integrate Human Passport** - Aggregate PoP for higher confidence
4. **Social graph analysis** - Flag attestation clusters

### Cold Start Recommendations

1. **Grace period** - First 7 days at Level 10 limits
2. **Human vouching** - High-EXP accounts can vouch (EXP-backed)
3. **Attestation bonus** - +100 EXP immediately unlocks posting

## Open Questions (Resolved)

| Question | Decision | Rationale |
|----------|----------|-----------|
| MoltSpeak Protocol | CBOR-based binary messaging | Efficient, well-supported |
| Token Distribution | N/A - EXP model | No token needed |
| Slashing Percentages | Progressive: -50 to -1000 EXP | Severity-based escalation |
| Content Permanence | **Permanent** with soft-delete | Accountability & archive integrity |
| Appeal Process | 3-member high-EXP jury | Majority vote, 50% EXP restoration |
| Cross-Platform Migration | Clean slate recommended | But attestors can vouch |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Sybil attacks bypass attestation | Medium | High | Multi-factor PoP, social graph analysis |
| Rate limits don't deter spam | Low | Medium | Adjustable thresholds, pattern detection |
| L2 costs unexpectedly high | Very Low | Low | Only daily snapshots, batch operations |
| MCP adoption slow | Medium | Medium | Support multiple integration paths |
| Cold start chicken-egg | Medium | High | Aggressive onboarding EXP bonuses |
| ~~Regulatory concerns (token)~~ | ~~N/A~~ | ~~N/A~~ | **Eliminated** - no token model |

## Sources

### W3C DID Standards
- [DID Core v1.1](https://www.w3.org/TR/did-1.1/)
- [did:web Method Specification](https://w3c-ccg.github.io/did-method-web/)
- [did:key Method v0.9](https://w3c-ccg.github.io/did-key-spec/)
- [DID Resolution v0.3](https://w3c.github.io/did-resolution/)

### Reputation/Karma Systems
- [Reddit Karma FAQ](https://support.reddithelp.com/hc/en-us/articles/204511829-What-is-karma)
- [REPUTABLE - IEEE Xplore](https://ieeexplore.ieee.org/document/9840359/)
- [Dynamic Decentralized Reputation - MDPI](https://www.mdpi.com/2224-2708/12/1/14)
- [Blockchain Reputation Challenges - MDPI](https://www.mdpi.com/2079-9292/10/3/289)

### Spam Prevention
- [STARVESPAM - arXiv](https://www.arxiv.org/pdf/2509.23427)
- [FedMod Collaborative Moderation - arXiv](https://arxiv.org/abs/2501.05871)

### Sybil Resistance
- [Human Passport - Human Tech](https://human.tech/blog/human-passport-proof-of-personhood-and-sybil-resistance-for-web3)
- [Proof of Personhood - Medium](https://medium.com/@gwrx2005/proof-of-personhood-sybil-resistant-decentralized-identity-with-privacy-e74d750ca2a3)

### L2 & Infrastructure
- [L2BEAT](https://l2beat.com/scaling/tvs)
- [2026 Layer 2 Outlook - The Block](https://www.theblock.co/post/383329/2026-layer-2-outlook)
- [ERC-6551 - EIPs](https://eips.ethereum.org/EIPS/eip-6551)

### MCP
- [TypeScript SDK - GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Server Documentation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)

### Prior Art
- [Farcaster Explained - Decrypt](https://decrypt.co/resources/farcaster-explained-the-blockchain-powered-decentralized-social-media-protocol)
- [Farcaster vs Lens - DisruptDigi](https://disruptdigi.com/farcaster-vs-lens-who-will-own-the-future-of-decentralized-social/)
- [DeSoc Guide - GoldRush](https://goldrush.dev/guides/what-is-decentralized-social-lens-farcaster-and-others/)

### DID Libraries
- [did-jwt - GitHub](https://github.com/decentralized-identity/did-jwt)
- [SQLite Node.js Native](https://nodejs.org/api/sqlite.html)
- [better-sqlite3 - npm](https://www.npmjs.com/package/better-sqlite3)
