# Lattice Project State

## Core Vision
> **Lattice = Reddit + StackOverflow for AI Agents**
> Programmatic, useful, agent-oriented social platform.

## Current Position
- **Milestone**: MVP Complete
- **Phase**: 1.1 (MVP Fix - Web UI, OpenAPI & Search)
- **Current Plan**: 2 of 3
- **Status**: Executing

## Progress
- [x] 01.1-01-PLAN: OpenAPI/Swagger specification
- [x] 01.1-02-PLAN: Search Engine (FTS5 + fuzzy)
- [ ] 01.1-03-PLAN: Web UI for human users

## Accumulated Context

### Roadmap Structure (Updated 2026-02-13)
| Phase | Name | Status |
|-------|------|--------|
| 1 | Core MVP | ✅ COMPLETE |
| 1.1 | MVP Fix - Web UI, OpenAPI & Search | 🔵 INSERTED |
| 2 | Token Economy & Decentralization Architecture | 🆕 NEW |
| 3 | Testing & Quality | (was Phase 2) |
| 4 | Advanced Features | (was Phase 3) |
| 5 | Production Readiness | (was Phase 4) |

### Phase 1.1 Scope
1. Web UI for human users
2. OpenAPI/Swagger specification
3. Verify upvotes/downvotes/comments
4. **Search Engine Design** (agent-first, fuzzy, semantic)

### Phase 2 Scope (NEW)
1. **Token Economy Stubs**
   - Reputation → token conversion abstraction
   - Token operation interfaces (mint, burn, transfer)
   - Migration path from EXP → tokens
2. **Decentralization Architecture**
   - Abstract storage layer (SQLite → pluggable)
   - IPFS-based content storage patterns
   - Custom endpoint distributed storage
   - CID-compatible content addressing

### Verified Features (from Phase 1)
- **Upvotes/Downvotes**: ✅ `POST /posts/:id/votes` (value: 1 or -1)
- **Comments/Replies**: ✅ `parentId` in `POST /posts` + `GET /posts/:id/replies`
- **Feed**: ✅ `GET /feed`

### Missing for MVP
- **Web UI**: No frontend exists
- ~~**OpenAPI Spec**: No swagger/openapi configuration~~ **DONE** (01.1-01)
- ~~**Search**: No search endpoint exists~~ **DONE** (01.1-02)

## Decisions Made (Phase 1.1)
- Manual OpenAPI spec over swagger-autogen (custom DID auth scheme)
- Export static openapi.json for SDK generation tooling
- FTS5 with porter stemmer for keyword search (better for English text)
- fast-fuzzy over fastest-levenshtein for fuzzy matching (better scoring API)
- Hybrid mode as default search mode (best balance of precision and recall)
- Search endpoint requires no auth (easy agent access)

## Beads Issues
| ID | Title | Type | Priority |
|----|-------|------|----------|
| LATTICE-3sz | Phase 1.1: MVP Fix - Web UI, OpenAPI & Search | Epic | Critical |
| LATTICE-g5z | Build Web UI for human users | Feature | Critical |
| LATTICE-ej4 | Add OpenAPI/Swagger specification | Feature | High |
| LATTICE-k2e | Verify upvotes/downvotes/comments | Task | Medium |
| LATTICE-waz | Design agent-first search engine | Feature | High |
| LATTICE-0ph | Phase 2: Token Economy & Decentralization | Epic | High |

## Design Principles
- **Agent-first**: APIs optimized for programmatic consumption
- **Human-readable**: Web UI for oversight and debugging
- **Future-proof**: Abstractions for token economy and decentralization
- **No blockchain**: Distributed storage without consensus overhead

## Performance Metrics
| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 1.1 | 01 | 4 min | 3 | 6 |
| 1.1 | 02 | 3 min | 3 | 7 |

## Last Session
- **Stopped At**: Completed 01.1-01-PLAN.md (OpenAPI Specification)
- **Next**: 01.1-03-PLAN.md (Web UI)

## Last Updated
2026-02-13 - Completed OpenAPI specification with Swagger UI at /api-docs
