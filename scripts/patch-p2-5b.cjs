const fs = require('fs');
const NL = '\n';

// The existing call-sites destructure { result, rateLimitResponse } and check
// !result.ok then read result.ctx. With our split, the public wrapper no longer
// returns result - it returns { ctx, rateLimitResponse } | { status, rateLimitResponse }.
// To keep backward compat AND type safety, we export BOTH the old (deprecated) name
// getAdherentsAuthContextInternal and the new wrapper, AND keep `result` on success
// wrapper via the new ctx field. We revert the breaking change in lib and use
// a different approach: keep the original return type and ADD `ctx` as a top-level
// alias for the destructure-from-result pattern that exists everywhere.
