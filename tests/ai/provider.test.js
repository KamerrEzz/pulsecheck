// '@ai-sdk/*' packages are ESM-only and Jest's CJS runtime can't parse them
// directly, so they're mocked here — provider.js require()s them lazily
// (only when createProvider() runs), which is exactly what lets this work
// both in production (plain Node, which supports require(esm)) and in Jest.

describe('createProvider', () => {
    let createProvider, DEFAULT_MODELS, AVAILABLE_MODELS;
    let createOpenAIMock, createAnthropicMock, createGoogleMock;

    beforeEach(() => {
        jest.resetModules();

        createOpenAIMock = jest.fn((opts) => (modelId) => ({ provider: 'openai', modelId, apiKey: opts.apiKey }));
        createAnthropicMock = jest.fn((opts) => (modelId) => ({ provider: 'anthropic', modelId, apiKey: opts.apiKey }));
        createGoogleMock = jest.fn((opts) => (modelId) => ({ provider: 'google', modelId, apiKey: opts.apiKey }));

        jest.doMock('@ai-sdk/openai', () => ({ createOpenAI: createOpenAIMock }));
        jest.doMock('@ai-sdk/anthropic', () => ({ createAnthropic: createAnthropicMock }));
        jest.doMock('@ai-sdk/google', () => ({ createGoogle: createGoogleMock }));

        ({ createProvider, DEFAULT_MODELS, AVAILABLE_MODELS } = require('../../src/services/ai/provider'));
    });

    it('creates an OpenAI language model with the given api key', () => {
        const model = createProvider('openai', DEFAULT_MODELS.openai, 'sk-test');
        expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: 'sk-test' });
        expect(model).toEqual({ provider: 'openai', modelId: DEFAULT_MODELS.openai, apiKey: 'sk-test' });
    });

    it('creates an Anthropic language model with the given api key', () => {
        const model = createProvider('anthropic', DEFAULT_MODELS.anthropic, 'sk-test');
        expect(createAnthropicMock).toHaveBeenCalledWith({ apiKey: 'sk-test' });
        expect(model).toEqual({ provider: 'anthropic', modelId: DEFAULT_MODELS.anthropic, apiKey: 'sk-test' });
    });

    it('creates a Google language model with the given api key', () => {
        const model = createProvider('google', DEFAULT_MODELS.google, 'sk-test');
        expect(createGoogleMock).toHaveBeenCalledWith({ apiKey: 'sk-test' });
        expect(model).toEqual({ provider: 'google', modelId: DEFAULT_MODELS.google, apiKey: 'sk-test' });
    });

    it('throws for an unsupported provider name', () => {
        expect(() => createProvider('unsupported', 'some-model', 'sk-test'))
            .toThrow('AI provider no soportado: unsupported');
    });

    it('has a default model included in the available models for each provider', () => {
        for (const provider of Object.keys(DEFAULT_MODELS)) {
            expect(AVAILABLE_MODELS[provider]).toContain(DEFAULT_MODELS[provider]);
        }
    });
});
