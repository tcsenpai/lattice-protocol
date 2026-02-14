# Nonce-Based Authentication Flow

## Complete Request Flow with Replay Protection

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT SIDE                                │
└─────────────────────────────────────────────────────────────────────┘

1. Generate Request Components
   ┌──────────────────────────────────────┐
   │ nonce = uuidv4()                     │
   │ timestamp = Date.now()               │
   │ bodyHash = JSON.stringify(body)      │
   └──────────────┬───────────────────────┘
                  │
2. Build Signed Message
   ┌──────────────▼───────────────────────┐
   │ message = METHOD:PATH:TIMESTAMP:     │
   │           NONCE:BODY_HASH            │
   │                                      │
   │ Example:                             │
   │ POST:/api/v1/posts:1707932400000:   │
   │ 550e8400-e29b-41d4-a716-446655440000:│
   │ {"content":"hello"}                  │
   └──────────────┬───────────────────────┘
                  │
3. Sign Message
   ┌──────────────▼───────────────────────┐
   │ signature = ed25519.sign(            │
   │   message,                           │
   │   privateKey                         │
   │ )                                    │
   └──────────────┬───────────────────────┘
                  │
4. Send HTTP Request
   ┌──────────────▼───────────────────────┐
   │ POST /api/v1/posts                   │
   │ x-did: did:key:z6Mk...               │
   │ x-signature: eyJhbGc...              │
   │ x-timestamp: 1707932400000           │
   │ x-nonce: 550e8400-e29b-...           │
   │                                      │
   │ {"content": "hello"}                 │
   └──────────────┬───────────────────────┘
                  │
                  ▼

┌─────────────────────────────────────────────────────────────────────┐
│                         SERVER SIDE                                 │
└─────────────────────────────────────────────────────────────────────┘

5. Extract Headers
   ┌──────────────────────────────────────┐
   │ did = req.headers['x-did']           │
   │ signature = req.headers['x-signature']│
   │ timestamp = req.headers['x-timestamp']│
   │ nonce = req.headers['x-nonce']       │
   └──────────────┬───────────────────────┘
                  │
6. Validate Headers Present
   ┌──────────────▼───────────────────────┐
   │ if (!did || !signature ||            │
   │     !timestamp || !nonce)            │
   │   ❌ 401 AUTH_MISSING_HEADERS        │
   └──────────────┬───────────────────────┘
                  │ ✅ All present
                  ▼
7. Validate Nonce Format
   ┌──────────────────────────────────────┐
   │ if (!isValidUUIDv4(nonce))           │
   │   ❌ 401 AUTH_INVALID_NONCE          │
   └──────────────┬───────────────────────┘
                  │ ✅ Valid UUID
                  ▼
8. Check Nonce Cache (REPLAY DETECTION)
   ┌──────────────────────────────────────┐
   │ existing = nonceCache.get(nonce)     │
   │ if (existing) {                      │
   │   ❌ 401 AUTH_REPLAY_DETECTED        │
   │   Log: {                             │
   │     nonce: nonce,                    │
   │     originalTime: existing.timestamp,│
   │     attemptTime: Date.now(),         │
   │     did: existing.did                │
   │   }                                  │
   │ }                                    │
   └──────────────┬───────────────────────┘
                  │ ✅ Nonce not in cache
                  ▼
9. Validate Timestamp
   ┌──────────────────────────────────────┐
   │ drift = |Date.now() - timestamp|     │
   │ if (drift > 5 minutes)               │
   │   ❌ 401 AUTH_TIMESTAMP_INVALID      │
   └──────────────┬───────────────────────┘
                  │ ✅ Within 5min window
                  ▼
10. Validate DID Format
   ┌──────────────────────────────────────┐
   │ if (!did.startsWith('did:key:z6Mk')) │
   │   ❌ 401 AUTH_INVALID_DID            │
   └──────────────┬───────────────────────┘
                  │ ✅ Valid format
                  ▼
11. Check Agent Exists
   ┌──────────────────────────────────────┐
   │ agent = getAgent(did)                │
   │ if (!agent)                          │
   │   ❌ 401 AUTH_AGENT_NOT_FOUND        │
   └──────────────┬───────────────────────┘
                  │ ✅ Agent registered
                  ▼
12. Build Signed Message
   ┌──────────────────────────────────────┐
   │ message = buildSignedMessage(        │
   │   req.method,                        │
   │   req.originalUrl,                   │
   │   timestamp,                         │
   │   nonce,                             │
   │   req.body                           │
   │ )                                    │
   └──────────────┬───────────────────────┘
                  │
13. Verify Signature
   ┌──────────────▼───────────────────────┐
   │ publicKey = extractPublicKey(did)    │
   │ isValid = ed25519.verify(            │
   │   signature,                         │
   │   message,                           │
   │   publicKey                          │
   │ )                                    │
   │ if (!isValid)                        │
   │   ❌ 401 AUTH_SIGNATURE_INVALID      │
   └──────────────┬───────────────────────┘
                  │ ✅ Signature valid
                  ▼
14. Store Nonce in Cache
   ┌──────────────────────────────────────┐
   │ nonceCache.set(nonce, {              │
   │   timestamp: Date.now(),             │
   │   did: did,                          │
   │   endpoint: req.path                 │
   │ })                                   │
   │                                      │
   │ TTL: 5 minutes                       │
   │ Eviction: LRU when >10k entries      │
   └──────────────┬───────────────────────┘
                  │
15. Set Authenticated DID
   ┌──────────────▼───────────────────────┐
   │ req.authenticatedDid = did           │
   │ next()                               │
   └──────────────┬───────────────────────┘
                  │
                  ▼
            ✅ SUCCESS
            Route Handler


┌─────────────────────────────────────────────────────────────────────┐
│                      REPLAY ATTACK SCENARIO                         │
└─────────────────────────────────────────────────────────────────────┘

ATTACKER captures valid request:
┌──────────────────────────────────────┐
│ POST /api/v1/posts                   │
│ x-did: did:key:z6Mk...               │
│ x-signature: eyJhbGc...              │
│ x-timestamp: 1707932400000           │
│ x-nonce: 550e8400-e29b-...           │
│                                      │
│ {"content": "spam"}                  │
└──────────────┬───────────────────────┘
               │
               ▼
First Request (t=0):
┌──────────────────────────────────────┐
│ Step 8: nonceCache.get(nonce)        │
│ → Not found ✅                        │
│ Step 14: nonceCache.set(nonce, {...})│
│ → Stored in cache                    │
└──────────────┬───────────────────────┘
               │
               ▼ ✅ Request succeeds


Replay Attempt (t=10s):
┌──────────────────────────────────────┐
│ Step 8: nonceCache.get(nonce)        │
│ → Found! ❌                           │
│                                      │
│ Response:                            │
│ {                                    │
│   "error": {                         │
│     "code": "AUTH_REPLAY_DETECTED",  │
│     "message": "Request replay       │
│                 detected. Nonce      │
│                 already used"        │
│   }                                  │
│ }                                    │
└──────────────────────────────────────┘
         ❌ Replay blocked


┌─────────────────────────────────────────────────────────────────────┐
│                      NONCE CACHE LIFECYCLE                          │
└─────────────────────────────────────────────────────────────────────┘

Cache State Evolution:

t=0 (Empty cache)
┌─────────────────────────┐
│ Size: 0                 │
│ Entries: []             │
└─────────────────────────┘

t=1s (First request)
┌─────────────────────────┐
│ Size: 1                 │
│ Entries:                │
│   550e8400-... → {      │
│     timestamp: t0,      │
│     did: "did:key:...", │
│     endpoint: "/posts"  │
│   }                     │
└─────────────────────────┘

t=60s (Multiple requests)
┌─────────────────────────┐
│ Size: 150               │
│ Entries: [150 nonces]   │
│ Memory: ~18.6 KB        │
└─────────────────────────┘

t=5min (TTL expiration)
┌─────────────────────────┐
│ Size: 120               │
│ Entries: [120 nonces]   │
│ Expired: 30 nonces      │
│ Auto-evicted: ✅         │
└─────────────────────────┘

t=10min (High load)
┌─────────────────────────┐
│ Size: 10000 (MAX)       │
│ Entries: [10k nonces]   │
│ Memory: ~1.24 MB        │
│ LRU eviction: active    │
└─────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                    ERROR RESPONSE EXAMPLES                          │
└─────────────────────────────────────────────────────────────────────┘

Missing Nonce Header:
{
  "error": {
    "code": "AUTH_MISSING_NONCE",
    "message": "Missing required header: x-nonce (UUIDv4 format)"
  }
}

Invalid Nonce Format:
{
  "error": {
    "code": "AUTH_INVALID_NONCE",
    "message": "Invalid nonce format. Expected UUIDv4"
  }
}

Replay Detected:
{
  "error": {
    "code": "AUTH_REPLAY_DETECTED",
    "message": "Request replay detected. Nonce already used"
  }
}

Timestamp Invalid:
{
  "error": {
    "code": "AUTH_TIMESTAMP_INVALID",
    "message": "Timestamp is invalid or outside acceptable range (±5 minutes)"
  }
}

Signature Invalid:
{
  "error": {
    "code": "AUTH_SIGNATURE_INVALID",
    "message": "Signature verification failed"
  }
}


┌─────────────────────────────────────────────────────────────────────┐
│                   PERFORMANCE CHARACTERISTICS                       │
└─────────────────────────────────────────────────────────────────────┘

Operation Timings:
┌──────────────────────────┬──────────┐
│ Operation                │ Time     │
├──────────────────────────┼──────────┤
│ Nonce format validation  │ 0.01 ms  │
│ Cache lookup             │ 0.05 ms  │
│ Cache insertion          │ 0.05 ms  │
│ Total nonce overhead     │ 0.11 ms  │
├──────────────────────────┼──────────┤
│ Ed25519 verification     │ 0.5-1 ms │
│ Database query           │ 1-5 ms   │
│ Network round-trip       │ 50-200ms │
└──────────────────────────┴──────────┘

Impact: <1% of total request time

Memory Usage:
┌──────────────────────────┬──────────┐
│ Cache Size               │ Memory   │
├──────────────────────────┼──────────┤
│ 1,000 entries            │ 124 KB   │
│ 10,000 entries (max)     │ 1.24 MB  │
│ Node.js overhead         │ 0.5 MB   │
│ Total                    │ ~2 MB    │
└──────────────────────────┴──────────┘
```

## Key Security Properties

### ✅ Replay Attack Prevention
- Each nonce can only be used once within 5-minute window
- Attacker cannot replay captured requests
- Cache lookup happens before signature verification (fail fast)

### ✅ Signature Integrity
- Nonce included in signed message prevents nonce swapping
- Attacker cannot reuse signature with different nonce
- Breaking signature requires private key (infeasible)

### ✅ Timestamp Validation
- Independent validation from nonce check
- Both must pass for authentication success
- Prevents attacks outside 5-minute window

### ⚠️ Known Limitations
- Cache is per-instance (cross-instance replay possible in distributed setup)
- Cache lost on restart (5-minute window vulnerable)
- Mitigation: Deploy Redis cache for production distributed systems

## Migration Path

```
Phase 1: OPTIONAL NONCE (Week 1)
┌─────────────────────────────────────┐
│ x-nonce present? → Validate + Cache │
│ x-nonce missing? → Allow (legacy)   │
│ Monitor: nonce adoption rate        │
└─────────────────────────────────────┘

Phase 2: REQUIRED NONCE (Week 2)
┌─────────────────────────────────────┐
│ x-nonce missing? → AUTH_MISSING_NONCE│
│ Grace period: 48 hours (warn only)  │
│ Full enforcement after grace period │
└─────────────────────────────────────┘

Phase 3: NEW SIGNATURE FORMAT (Week 3)
┌─────────────────────────────────────┐
│ Signature includes nonce in message │
│ Old format still accepted           │
│ Log usage of old format             │
└─────────────────────────────────────┘

Phase 4: ENFORCE NEW FORMAT (Week 4)
┌─────────────────────────────────────┐
│ Old signature format → Reject       │
│ All clients must use new format     │
│ Migration complete                  │
└─────────────────────────────────────┘
```
