/**
 * Username Validation
 * Detects AI-generated or spam usernames
 */

export interface UsernameCheckResult {
  score: number;
  action: 'ALLOW' | 'REJECT';
  reasons: string[];
}

const THRESHOLDS = {
  REJECT: 5,
};

/**
 * Check if username looks AI-generated or spammy
 * Returns a score - higher means more likely generated/spam
 */
export function checkGeneratedUsername(username: string): UsernameCheckResult {
  let score = 0;
  const reasons: string[] = [];

  // Rule 1: Too many numbers (+2 per excess)
  // Allow 2-3 numbers at end (common: user123), penalize more
  const numbers = username.match(/\d/g) || [];
  const numberRatio = numbers.length / username.length;
  if (numberRatio > 0.4) {
    score += 3;
    reasons.push('excessive-numbers');
  } else if (numbers.length > 4) {
    score += 2;
    reasons.push('many-numbers');
  }

  // Rule 2: Random-looking strings (low character diversity patterns)
  // e.g., "xkcd7h3m" - alternating consonants/numbers without vowels
  const vowelCount = (username.match(/[aeiou]/gi) || []).length;
  const letterCount = (username.match(/[a-z]/gi) || []).length;
  if (letterCount > 4 && vowelCount === 0) {
    score += 3;
    reasons.push('no-vowels');
  } else if (letterCount > 6 && vowelCount < 2) {
    score += 2;
    reasons.push('few-vowels');
  }

  // Rule 3: Keyboard patterns (+3)
  const keyboardPatterns = [
    /qwerty/i, /asdf/i, /zxcv/i, /qazwsx/i,
    /123456/, /abcdef/i, /aaaaaa/i,
  ];
  for (const pattern of keyboardPatterns) {
    if (pattern.test(username)) {
      score += 3;
      reasons.push('keyboard-pattern');
      break;
    }
  }

  // Rule 4: UUID-like patterns (+4)
  if (/^[a-f0-9]{8,}$/i.test(username) || /[a-f0-9]{4}-[a-f0-9]{4}/i.test(username)) {
    score += 4;
    reasons.push('uuid-like');
  }

  // Rule 5: Repeated characters (+2)
  if (/(.)\1{3,}/.test(username)) {
    score += 2;
    reasons.push('repeated-chars');
  }

  // Rule 6: Suspicious prefixes common in generated names (+2)
  const suspiciousPrefixes = [
    /^user[0-9]/i, /^agent[0-9]/i, /^bot[0-9]/i,
    /^test[0-9]/i, /^temp[0-9]/i, /^guest[0-9]/i,
    /^anon[0-9]/i, /^random/i,
  ];
  for (const pattern of suspiciousPrefixes) {
    if (pattern.test(username)) {
      score += 2;
      reasons.push('suspicious-prefix');
      break;
    }
  }

  // Rule 7: Alternating case abuse (HeLLoWoRLd) (+2)
  let caseChanges = 0;
  for (let i = 1; i < username.length; i++) {
    const prev = username[i - 1];
    const curr = username[i];
    if (/[a-z]/.test(prev) && /[A-Z]/.test(curr)) caseChanges++;
    if (/[A-Z]/.test(prev) && /[a-z]/.test(curr)) caseChanges++;
  }
  if (caseChanges > 4) {
    score += 2;
    reasons.push('excessive-case-changes');
  }

  // Rule 8: Very short with numbers (+1)
  if (username.length <= 4 && numbers.length > 0) {
    score += 1;
    reasons.push('short-with-numbers');
  }

  // Rule 9: Looks like base64 (+3)
  if (/^[A-Za-z0-9+\/]{10,}={0,2}$/.test(username)) {
    score += 3;
    reasons.push('base64-like');
  }

  // Rule 10: Common bot name patterns (+3)
  const botPatterns = [
    /^[a-z]{2,3}[0-9]{5,}$/i,  // ab12345
    /^[0-9]+[a-z]+[0-9]+$/i,    // 123abc456
    /^x{2,}[0-9]/i,             // xxx123
  ];
  for (const pattern of botPatterns) {
    if (pattern.test(username)) {
      score += 3;
      reasons.push('bot-name-pattern');
      break;
    }
  }

  const action = score >= THRESHOLDS.REJECT ? 'REJECT' : 'ALLOW';

  return { score, action, reasons };
}

/**
 * Simple in-memory rate limiter for registration cooldown
 * Uses IP or fingerprint as key
 */
const registrationAttempts = new Map<string, number>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const CLEANUP_THRESHOLD = 60 * 1000; // 1 minute old entries
  for (const [key, timestamp] of registrationAttempts.entries()) {
    if (now - timestamp > CLEANUP_THRESHOLD) {
      registrationAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if registration is allowed (3-second cooldown)
 * @param identifier - IP address or other unique identifier
 * @returns true if allowed, false if rate limited
 */
export function checkRegistrationCooldown(identifier: string): { allowed: boolean; waitMs?: number } {
  const now = Date.now();
  const lastAttempt = registrationAttempts.get(identifier);
  const COOLDOWN_MS = 3000; // 3 seconds

  if (lastAttempt && (now - lastAttempt) < COOLDOWN_MS) {
    const waitMs = COOLDOWN_MS - (now - lastAttempt);
    return { allowed: false, waitMs };
  }

  // Record this attempt
  registrationAttempts.set(identifier, now);
  return { allowed: true };
}

/**
 * Clear cooldown for an identifier (for testing)
 */
export function clearCooldown(identifier: string): void {
  registrationAttempts.delete(identifier);
}
