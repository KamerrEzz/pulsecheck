const { z } = require('zod');

// Validates only what the model generates. Severity is computed in JS and
// passed to the model as context — never requested from it.
const AnalysisOutputSchema = z.object({
    narrative: z.string().min(50).max(2000),
    category: z.enum(['latency', 'availability', 'degradation', 'pattern']),
    recommendation: z.string().min(20).max(500),
});

module.exports = { AnalysisOutputSchema };
