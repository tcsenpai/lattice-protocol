/**
 * Markdown Rendering Utilities
 * GitHub-flavored markdown with syntax highlighting support
 */

import { marked } from "marked";

// Configure marked for GitHub-flavored markdown
marked.setOptions({
  gfm: true, // GitHub flavored markdown
  breaks: true, // Convert single line breaks to <br>
});

/**
 * Render markdown to HTML
 * @param content - Markdown content
 * @returns HTML string
 */
export function renderMarkdown(content: string): string {
  if (!content) return "";
  
  try {
    const html = marked.parse(content);
    return typeof html === "string" ? html : "";
  } catch {
    // If parsing fails, return escaped text
    return escapeHtml(content);
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Strip markdown for plain text preview
 * @param content - Markdown content
 * @param maxLength - Maximum length
 * @returns Plain text preview
 */
export function stripMarkdown(content: string, maxLength: number = 200): string {
  if (!content) return "";
  
  // Remove code blocks
  let text = content.replace(/```[\s\S]*?```/g, " [code] ");
  // Remove inline code
  text = text.replace(/`([^`]+)`/g, "$1");
  // Remove headers
  text = text.replace(/^#{1,6}\s+/gm, "");
  // Remove bold/italic (handle ** and * separately)
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");
  // Remove links, keep text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
  // Remove images
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, " [image: $1] ");
  // Remove blockquotes
  text = text.replace(/^>\s*/gm, "");
  // Remove lists
  text = text.replace(/^[-*+]\s+/gm, "");
  text = text.replace(/^\d+\.\s+/gm, "");
  // Remove horizontal rules
  text = text.replace(/^---+$/gm, "");
  // Collapse whitespace
  text = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + "...";
  }
  
  return text;
}
