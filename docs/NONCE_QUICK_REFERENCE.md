# Nonce-Based Authentication Quick Reference

**Quick navigation for developers implementing or debugging nonce-based replay protection**

---

## For Server Developers

### Adding Nonce Validation

**1. Install dependency**
```bash
bun add lru-cache
```

**2. Initialize cache**
```typescript
import { LRUCache } from 'lru-cache';

const nonceCache = new LRUCache<string, NonceMetadata>({
  max: 10000,
  ttl: 5 * 60 * 1000, // 5 minutes
});
```

**3. Validate nonce format**
```typescript
function isValidUUIDv4(uuid: string): boolean {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}
```

**4. Check for replay**
```typescript
const existing = nonceCache.get(nonce);
if (existing) {
  return res.status(401).json({
    error: {
      code: 'AUTH_REPLAY_DETECTED',
      message: 'Request replay detected. Nonce already used'
    }
  });
}
```

**5. Update signature builder**
```typescript
// OLD FORMAT
const message = `${method}:${path}:${timestamp}:${bodyHash}`;

// NEW FORMAT (with nonce)
const message = `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`;
```

**6. Store nonce after success**
```typescript
nonceCache.set(nonce, {
  timestamp: Date.now(),
  did: authenticatedDid,
  endpoint: req.path
});
```

---

## For Client Developers

### Generating Authenticated Requests

**1. Install UUID library**
```bash
npm install uuid
# or
bun add uuid
```

**2. Import UUID generator**
```typescript
import { v4 as uuidv4 } from 'uuid';
```

**3. Generate nonce**
```typescript
const nonce = uuidv4();
// Example: "550e8400-e29b-41d4-a716-446655440000"
```

**4. Build signed message**
```typescript
const timestamp = Date.now().toString();
const bodyHash = body ? JSON.stringify(body) : '';
const message = `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`;
```

**5. Sign message**
```typescript
import * as ed25519 from '@noble/ed25519';

const messageBytes = new TextEncoder().encode(message);
const signature = await ed25519.signAsync(messageBytes, privateKey);
const signatureBase64 = Buffer.from(signature).toString('base64');
```

**6. Send request**
```typescript
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'x-did': did,
    'x-signature': signatureBase64,
    'x-timestamp': timestamp,
    'x-nonce': nonce, // REQUIRED
    'content-type': 'application/json'
  },
  body: JSON.stringify(body)
});
```

---

## Error Codes Reference

| Code | Meaning | Fix |
|------|---------|-----|
| `AUTH_MISSING_NONCE` | No `x-nonce` header | Add `x-nonce: <uuid>` header |
| `AUTH_INVALID_NONCE` | Nonce not UUIDv4 format | Use `uuidv4()` to generate valid nonce |
| `AUTH_REPLAY_DETECTED` | Nonce already used | Generate new nonce for each request |
| `AUTH_SIGNATURE_INVALID` | Signature doesn't match | Include nonce in signed message |
| `AUTH_TIMESTAMP_INVALID` | Timestamp outside 5-min window | Check system clock, use current time |

---

## Common Issues & Fixes

### Issue: "AUTH_INVALID_NONCE"

**Cause**: Nonce is not valid UUIDv4 format

**Wrong**:
```typescript
const nonce = Math.random().toString(); // ❌
const nonce = Date.now().toString();    // ❌
const nonce = "my-custom-nonce";        // ❌
```

**Right**:
```typescript
import { v4 as uuidv4 } from 'uuid';
const nonce = uuidv4(); // ✅
// "550e8400-e29b-41d4-a716-446655440000"
```

---

### Issue: "AUTH_REPLAY_DETECTED"

**Cause**: Reusing the same nonce in multiple requests

**Wrong**:
```typescript
const nonce = uuidv4(); // Generated once
await fetch(url1, { headers: { 'x-nonce': nonce } }); // ✅
await fetch(url2, { headers: { 'x-nonce': nonce } }); // ❌ REPLAY!
```

**Right**:
```typescript
const nonce1 = uuidv4(); // Generate new nonce
await fetch(url1, { headers: { 'x-nonce': nonce1 } }); // ✅

const nonce2 = uuidv4(); // Generate new nonce
await fetch(url2, { headers: { 'x-nonce': nonce2 } }); // ✅
```

---

### Issue: "AUTH_SIGNATURE_INVALID"

**Cause**: Nonce not included in signed message

**Wrong**:
```typescript
// OLD FORMAT (without nonce)
const message = `${method}:${path}:${timestamp}:${bodyHash}`;
const signature = await sign(message);

// Headers include nonce, but signature doesn't
headers['x-nonce'] = nonce; // ❌ MISMATCH
```

**Right**:
```typescript
// NEW FORMAT (with nonce)
const nonce = uuidv4();
const message = `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`;
const signature = await sign(message); // ✅

headers['x-nonce'] = nonce; // ✅ MATCHES
```

---

## Complete Request Example

```typescript
import { v4 as uuidv4 } from 'uuid';
import * as ed25519 from '@noble/ed25519';

async function sendAuthenticatedRequest(
  url: string,
  method: string,
  body: object | null,
  privateKey: Uint8Array,
  did: string
) {
  // 1. Generate nonce
  const nonce = uuidv4();

  // 2. Generate timestamp
  const timestamp = Date.now().toString();

  // 3. Build message to sign
  const path = new URL(url).pathname;
  const bodyHash = body ? JSON.stringify(body) : '';
  const message = `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`;

  // 4. Sign message
  const messageBytes = new TextEncoder().encode(message);
  const signature = await ed25519.signAsync(messageBytes, privateKey);
  const signatureBase64 = Buffer.from(signature).toString('base64');

  // 5. Send request
  const response = await fetch(url, {
    method: method,
    headers: {
      'x-did': did,
      'x-signature': signatureBase64,
      'x-timestamp': timestamp,
      'x-nonce': nonce,
      'content-type': 'application/json'
    },
    body: body ? JSON.stringify(body) : null
  });

  return response;
}

// Usage
const response = await sendAuthenticatedRequest(
  'https://lattice.example/api/v1/posts',
  'POST',
  { content: 'Hello, world!' },
  myPrivateKey,
  myDid
);
```

---

## Testing Your Implementation

### Unit Test: Valid Nonce

```typescript
test('accepts valid nonce', async () => {
  const nonce = uuidv4();
  const response = await sendRequest({ nonce });
  expect(response.status).toBe(200);
});
```

### Unit Test: Replay Detection

```typescript
test('rejects replayed nonce', async () => {
  const nonce = uuidv4();

  // First request succeeds
  const response1 = await sendRequest({ nonce });
  expect(response1.status).toBe(200);

  // Second request with same nonce fails
  const response2 = await sendRequest({ nonce });
  expect(response2.status).toBe(401);
  expect(response2.json()).toMatchObject({
    error: { code: 'AUTH_REPLAY_DETECTED' }
  });
});
```

### Unit Test: Invalid Format

```typescript
test('rejects invalid nonce format', async () => {
  const nonce = 'not-a-uuid';
  const response = await sendRequest({ nonce });
  expect(response.status).toBe(401);
  expect(response.json()).toMatchObject({
    error: { code: 'AUTH_INVALID_NONCE' }
  });
});
```

---

## Debugging Checklist

When authentication fails, check:

- [ ] **Nonce present?** Check `x-nonce` header exists
- [ ] **Nonce format?** Verify UUIDv4 format with regex
- [ ] **Nonce unique?** Ensure new nonce for each request
- [ ] **Signature includes nonce?** Verify message format: `METHOD:PATH:TIMESTAMP:NONCE:BODY`
- [ ] **Timestamp valid?** Check within ±5 minutes
- [ ] **Clock synchronized?** Verify system time accuracy
- [ ] **DID registered?** Confirm DID exists in system
- [ ] **Signature valid?** Test signature verification separately

---

## Performance Targets

| Metric | Target | Actual (Production) |
|--------|--------|---------------------|
| Nonce validation | <0.1ms | TBD |
| Cache lookup | <0.05ms | TBD |
| Total overhead | <1ms | TBD |
| Memory usage | <2MB @ 10k entries | TBD |
| Cache hit rate | >99% | TBD |

Monitor these metrics in production and alert if targets exceeded.

---

## Migration Timeline

| Phase | Week | Status | Action Required |
|-------|------|--------|-----------------|
| Phase 1: Optional | Week 1 | ⏳ Pending | Deploy with nonce support |
| Phase 2: Required | Week 2 | ⏳ Pending | Add nonce header to all requests |
| Phase 3: Signature Update | Week 3 | ⏳ Pending | Include nonce in signature |
| Phase 4: Full Enforcement | Week 4 | ⏳ Pending | Verify all clients updated |

---

## Additional Resources

- **Full Design**: `docs/REPLAY_PROTECTION_DESIGN.md`
- **Implementation Guide**: `docs/REPLAY_PROTECTION_SUMMARY.md`
- **Roadmap**: `docs/REPLAY_PROTECTION_ROADMAP.md`
- **Flow Diagrams**: `docs/diagrams/nonce-auth-flow.md`
- **Code Examples**: `docs/code-examples/nonce-implementation.ts`

---

## Support

**Issues?** Check:
1. This quick reference
2. Full documentation in `docs/`
3. Code examples in `docs/code-examples/`
4. Security audit in `SECURITY_AUDIT.md`

**Still stuck?** Contact security team with:
- Error code received
- Request details (method, path, headers)
- Nonce value used
- Timestamp used
- Expected vs actual behavior

---

**Quick Reference Version**: 1.0
**Last Updated**: 2026-02-14
**Status**: Ready for Use
