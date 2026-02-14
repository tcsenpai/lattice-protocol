/**
 * Prompt Injection Detection
 * Protects AI agents consuming feed content from injection attacks
 */

export interface InjectionCheckResult {
  score: number;
  action: 'ALLOW' | 'FLAG' | 'REJECT';
  matches: string[];
  reason?: string;
}

// Thresholds for action decisions
const THRESHOLDS = {
  FLAG: 3,
  REJECT: 6,
};

// Layer 1: Direct instruction patterns (+3 points each)
const INSTRUCTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context)/i, label: 'ignore-instructions' },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above|earlier)/i, label: 'disregard-previous' },
  { pattern: /forget\s+(everything|all|what)\s+(you|i)\s+(know|said|told)/i, label: 'forget-context' },
  { pattern: /you\s+are\s+now\s+(a|an|the)\s+/i, label: 'role-override' },
  { pattern: /act\s+as\s+(if\s+)?(you\s+)?(are|were)\s+(a|an)/i, label: 'act-as' },
  { pattern: /pretend\s+(to\s+be|you\s+are)/i, label: 'pretend-role' },
  { pattern: /^system\s*prompt\s*:/im, label: 'system-prompt-label' },
  { pattern: /^(assistant|user|human)\s*:/im, label: 'role-label' },
  { pattern: /new\s+instructions?\s*:/i, label: 'new-instructions' },
  { pattern: /override\s+(all\s+)?(safety|guidelines|rules)/i, label: 'override-safety' },
];

// Layer 2: Delimiter attacks (+2 points each)
const DELIMITER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /<\|im_start\|>/i, label: 'chatml-start' },
  { pattern: /<\|im_end\|>/i, label: 'chatml-end' },
  { pattern: /<\|endoftext\|>/i, label: 'endoftext' },
  { pattern: /\[INST\]/i, label: 'llama-inst' },
  { pattern: /\[\/INST\]/i, label: 'llama-inst-end' },
  { pattern: /<\/?system>/i, label: 'system-tag' },
  { pattern: /<\/?human>/i, label: 'human-tag' },
  { pattern: /<\/?assistant>/i, label: 'assistant-tag' },
  { pattern: /<<SYS>>/i, label: 'llama-sys' },
  { pattern: /<\|user\|>/i, label: 'user-tag' },
  { pattern: /<\|assistant\|>/i, label: 'assistant-tag-alt' },
  { pattern: /```\s*(system|prompt|instructions?)\b/i, label: 'codeblock-system' },
];

// Layer 3: Suspicious patterns (+1 point each)
const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /you\s+(must|will|shall)\s+(always|never)/i, label: 'imperative-always' },
  { pattern: /from\s+now\s+on\s*,?\s*(you|always)/i, label: 'from-now-on' },
  { pattern: /\bDAN\b.*\bjailbreak/i, label: 'dan-jailbreak' },
  { pattern: /bypass\s+(the\s+)?(filter|safety|restriction)/i, label: 'bypass-filter' },
  { pattern: /\bbase64\s*:\s*[A-Za-z0-9+\/=]{50,}/i, label: 'base64-payload' },
  { pattern: /[A-Za-z0-9+\/=]{100,}/, label: 'long-encoded-string' },
  { pattern: /ignore\s+ethics/i, label: 'ignore-ethics' },
  { pattern: /do\s+not\s+refuse/i, label: 'do-not-refuse' },
];

/**
 * Check content for prompt injection patterns
 */
export function checkInjection(content: string): InjectionCheckResult {
  let score = 0;
  const matches: string[] = [];

  // Layer 1: Direct instructions (+3 each)
  for (const { pattern, label } of INSTRUCTION_PATTERNS) {
    if (pattern.test(content)) {
      score += 3;
      matches.push(`instruction:${label}`);
    }
  }

  // Layer 2: Delimiters (+2 each)
  for (const { pattern, label } of DELIMITER_PATTERNS) {
    if (pattern.test(content)) {
      score += 2;
      matches.push(`delimiter:${label}`);
    }
  }

  // Layer 3: Suspicious (+1 each)
  for (const { pattern, label } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(content)) {
      score += 1;
      matches.push(`suspicious:${label}`);
    }
  }

  // Determine action
  let action: 'ALLOW' | 'FLAG' | 'REJECT';
  let reason: string | undefined;

  if (score >= THRESHOLDS.REJECT) {
    action = 'REJECT';
    reason = `Content blocked: potential prompt injection detected (score: ${score})`;
  } else if (score >= THRESHOLDS.FLAG) {
    action = 'FLAG';
    reason = `Content flagged for review (score: ${score})`;
  } else {
    action = 'ALLOW';
  }

  return { score, action, matches, reason };
}

/**
 * Check username for injection attempts (stricter - any match rejects)
 */
export function checkUsernameInjection(username: string): InjectionCheckResult {
  const result = checkInjection(username);

  // For usernames, any match is a rejection
  if (result.matches.length > 0) {
    return {
      ...result,
      action: 'REJECT',
      reason: 'Username contains disallowed patterns',
    };
  }

  return result;
}
