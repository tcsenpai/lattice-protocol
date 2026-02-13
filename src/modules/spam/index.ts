/**
 * Spam Module
 * Handles detection, reporting, and rate limiting
 */

// SimHash and entropy utilities
export { computeSimHash, hammingDistance, similarity, areSimilar } from './simhash.js';
export { calculateShannonEntropy, isLowEntropy, analyzeEntropy } from './entropy.js';

// Service layer
export {
  checkContent,
  getContentSimHash,
  hasLowEntropy as checkLowEntropy,
  getEntropyScore
} from './service.js';

// Repository layer
export {
  getRecentSimHashes,
  createSpamReport,
  getSpamReportsForPost,
  countSpamReports,
  hasUserReportedPost,
  getPostsWithHighReportCount
} from './repository.js';
