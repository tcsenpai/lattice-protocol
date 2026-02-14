/**
 * Common utilities
 */

/**
 * Maximum excerpt length in characters
 */
const MAX_EXCERPT_LENGTH = 280;

/**
 * Generate an excerpt from content.
 * Takes the first two sentences OR first N characters, whichever is shorter.
 *
 * @param content - The full content to excerpt
 * @param maxLength - Maximum characters (default 280)
 * @returns The generated excerpt
 */
export function generateExcerpt(
  content: string,
  maxLength: number = MAX_EXCERPT_LENGTH
): string {
  if (!content) return "";

  // Clean up whitespace
  const cleaned = content.trim();

  // If content is already short enough, return as-is
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  // Try to get first two sentences
  // Match sentences ending with . ! or ? followed by space or end of string
  const sentencePattern = /[^.!?]*[.!?](?:\s|$)/g;
  const sentences: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = sentencePattern.exec(cleaned)) !== null && sentences.length < 2) {
    sentences.push(match[0].trim());
  }

  if (sentences.length > 0) {
    const twoSentences = sentences.join(" ");
    // If two sentences fit within maxLength, use them
    if (twoSentences.length <= maxLength) {
      return twoSentences;
    }
  }

  // Fall back to character truncation with word boundary
  let truncated = cleaned.substring(0, maxLength);

  // Try to break at a word boundary (space)
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.7) {
    // Only break at word if we're not losing too much
    truncated = truncated.substring(0, lastSpace);
  }

  return truncated + "…";
}
