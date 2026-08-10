// 'ai' and '@ai-sdk/*' ship ESM-only (no "require" export condition) and
// require Node >=22. Node >=22.12 supports require()-ing synchronous ESM
// graphs natively, so plain require() below works without dynamic import().

const DEFAULT_MODELS = {
    openai: 'gpt-5-nano',
    anthropic: 'claude-haiku-4-5',
    google: 'gemini-2.5-flash',
};

const AVAILABLE_MODELS = {
    openai: ['gpt-5-nano', 'gpt-5-mini'],
    anthropic: ['claude-haiku-4-5', 'claude-haiku-20240307'],
    google: ['gemini-2.5-flash'],
};

/**
 * @param {string} providerName — "openai" | "anthropic" | "google"
 * @param {string} modelId
 * @param {string} apiKey
 * @returns {import('ai').LanguageModel}
 */
function createProvider(providerName, modelId, apiKey) {
    switch (providerName) {
        case 'openai': {
            const { createOpenAI } = require('@ai-sdk/openai');
            return createOpenAI({ apiKey })(modelId);
        }
        case 'anthropic': {
            const { createAnthropic } = require('@ai-sdk/anthropic');
            return createAnthropic({ apiKey })(modelId);
        }
        case 'google': {
            const { createGoogle } = require('@ai-sdk/google');
            return createGoogle({ apiKey })(modelId);
        }
        default:
            throw new Error(`AI provider no soportado: ${providerName}`);
    }
}

module.exports = { createProvider, DEFAULT_MODELS, AVAILABLE_MODELS };
