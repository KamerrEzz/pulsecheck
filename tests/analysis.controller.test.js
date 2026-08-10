function createMockRes() {
    return {
        statusCode: null,
        headersSent: false,
        headers: null,
        chunks: [],
        jsonBody: null,
        ended: false,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.jsonBody = body; return this; },
        writeHead(code, headers) {
            this.statusCode = code;
            this.headers = headers;
            this.headersSent = true;
            return this;
        },
        write(chunk) { this.chunks.push(chunk); return true; },
        end() { this.ended = true; },
        events() {
            return this.chunks
                .map((c) => c.toString())
                .filter((c) => c.startsWith('data: '))
                .map((c) => JSON.parse(c.slice('data: '.length).trim()));
        },
    };
}

describe('Analysis Controller', () => {
    let analysisController;
    let prismaMock;
    let analyzeServiceMock;
    let saveAnalysisMock;
    let classifyErrorMock;

    beforeEach(() => {
        jest.resetModules();
        process.env.AI_API_KEY = 'sk-test';
        process.env.AI_GLOBAL_ANALYSIS_LIMIT = '500';
        process.env.AI_USER_ANALYSIS_LIMIT = '50';

        prismaMock = {
            service: { findFirst: jest.fn() },
            analysis: {
                count: jest.fn().mockResolvedValue(0),
                create: jest.fn(),
                findFirst: jest.fn(),
            },
        };

        analyzeServiceMock = jest.fn();
        saveAnalysisMock = jest.fn();
        classifyErrorMock = jest.fn().mockReturnValue({ code: 'AI_UNKNOWN_ERROR', message: 'unexpected' });

        jest.doMock('../src/config/db', () => prismaMock);
        jest.doMock('../src/services/ai/analyzer', () => ({
            analyzeService: analyzeServiceMock,
            saveAnalysis: saveAnalysisMock,
            classifyError: classifyErrorMock,
        }));
        jest.doMock('../src/services/ai/provider', () => ({
            DEFAULT_MODELS: { openai: 'gpt-5-nano', anthropic: 'claude-haiku-4-5', google: 'gemini-2.5-flash' },
        }));

        analysisController = require('../src/controllers/analysis.controller');
    });

    afterEach(() => {
        delete process.env.AI_API_KEY;
        delete process.env.AI_GLOBAL_ANALYSIS_LIMIT;
        delete process.env.AI_USER_ANALYSIS_LIMIT;
    });

    describe('analyze', () => {
        it('returns 503 when AI_API_KEY is not configured', async () => {
            delete process.env.AI_API_KEY;
            jest.resetModules();
            jest.doMock('../src/config/db', () => prismaMock);
            jest.doMock('../src/services/ai/analyzer', () => ({
                analyzeService: analyzeServiceMock, saveAnalysis: saveAnalysisMock, classifyError: classifyErrorMock,
            }));
            jest.doMock('../src/services/ai/provider', () => ({ DEFAULT_MODELS: { openai: 'gpt-5-nano' } }));
            analysisController = require('../src/controllers/analysis.controller');

            const req = { params: { id: '1' }, user: { id: 1 } };
            const res = createMockRes();

            await analysisController.analyze(req, res);

            expect(res.statusCode).toBe(503);
            expect(res.jsonBody.code).toBe('AI_NOT_CONFIGURED');
            expect(prismaMock.service.findFirst).not.toHaveBeenCalled();
        });

        it('returns 404 when the service does not exist or is not owned by the user', async () => {
            prismaMock.service.findFirst.mockResolvedValue(null);

            const req = { params: { id: '1' }, user: { id: 1 } };
            const res = createMockRes();

            await analysisController.analyze(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.jsonBody.code).toBe('NOT_FOUND');
        });

        it('returns 429 AI_GLOBAL_LIMIT_EXCEEDED when the global monthly limit is reached', async () => {
            prismaMock.service.findFirst.mockResolvedValue({ id: 1, name: 'API', url: 'https://a.com', userId: 1 });
            prismaMock.analysis.count.mockResolvedValueOnce(500).mockResolvedValueOnce(0);

            const req = { params: { id: '1' }, user: { id: 1 } };
            const res = createMockRes();

            await analysisController.analyze(req, res);

            expect(res.statusCode).toBe(429);
            expect(res.jsonBody.code).toBe('AI_GLOBAL_LIMIT_EXCEEDED');
            expect(analyzeServiceMock).not.toHaveBeenCalled();
        });

        it('returns 429 AI_USER_LIMIT_EXCEEDED when the per-user daily limit is reached', async () => {
            prismaMock.service.findFirst.mockResolvedValue({ id: 1, name: 'API', url: 'https://a.com', userId: 1 });
            prismaMock.analysis.count.mockResolvedValueOnce(0).mockResolvedValueOnce(50);

            const req = { params: { id: '1' }, user: { id: 1 } };
            const res = createMockRes();

            await analysisController.analyze(req, res);

            expect(res.statusCode).toBe(429);
            expect(res.jsonBody.code).toBe('AI_USER_LIMIT_EXCEEDED');
            expect(analyzeServiceMock).not.toHaveBeenCalled();
        });

        it('streams narrative chunks and a final done event on success', async () => {
            prismaMock.service.findFirst.mockResolvedValue({ id: 1, name: 'API', url: 'https://a.com', userId: 1 });
            prismaMock.analysis.count.mockResolvedValue(0);

            analyzeServiceMock.mockImplementation(async ({ onNarrativeChunk }) => {
                onNarrativeChunk('Hello ');
                onNarrativeChunk('world.');
                return {
                    narrative: 'Hello world.',
                    category: 'pattern',
                    recommendation: 'Do nothing, it is healthy.',
                    severity: 'info',
                    provider: 'openai',
                    model: 'gpt-5-nano',
                    inputTokens: 100,
                    outputTokens: 50,
                    latencyMs: 1200,
                    eventWindowStart: new Date('2026-01-01'),
                    eventWindowEnd: new Date('2026-01-02'),
                };
            });
            saveAnalysisMock.mockResolvedValue({ id: 99 });

            const req = { params: { id: '1' }, user: { id: 1 } };
            const res = createMockRes();

            await analysisController.analyze(req, res);

            expect(res.headers['Content-Type']).toBe('text/event-stream');
            const events = res.events();
            expect(events[0]).toEqual({ type: 'narrative-chunk', content: 'Hello ' });
            expect(events[1]).toEqual({ type: 'narrative-chunk', content: 'world.' });
            const doneEvent = events.find((e) => e.type === 'done');
            expect(doneEvent.analysis).toEqual(expect.objectContaining({
                id: 99, narrative: 'Hello world.', category: 'pattern', severity: 'info',
            }));
            expect(saveAnalysisMock).toHaveBeenCalledWith(prismaMock, expect.objectContaining({
                serviceId: 1, userId: 1, narrative: 'Hello world.',
            }));
            expect(res.ended).toBe(true);
        });

        it('sends an error SSE event when the model call fails after streaming started', async () => {
            prismaMock.service.findFirst.mockResolvedValue({ id: 1, name: 'API', url: 'https://a.com', userId: 1 });
            prismaMock.analysis.count.mockResolvedValue(0);

            const modelError = new Error('boom');
            analyzeServiceMock.mockRejectedValue(modelError);
            classifyErrorMock.mockReturnValue({ code: 'AI_TIMEOUT', message: 'El servicio de IA no respondió a tiempo.' });

            const req = { params: { id: '1' }, user: { id: 1 } };
            const res = createMockRes();

            await analysisController.analyze(req, res);

            expect(classifyErrorMock).toHaveBeenCalledWith(modelError);
            const events = res.events();
            expect(events).toEqual([{ type: 'error', code: 'AI_TIMEOUT', message: 'El servicio de IA no respondió a tiempo.' }]);
            expect(saveAnalysisMock).not.toHaveBeenCalled();
            expect(res.ended).toBe(true);
        });
    });

    describe('latest', () => {
        it('returns 404 when the service does not belong to the user', async () => {
            prismaMock.service.findFirst.mockResolvedValue(null);
            const req = { params: { id: '1' }, user: { id: 1 } };
            const res = createMockRes();

            await analysisController.latest(req, res);

            expect(res.statusCode).toBe(404);
        });

        it('returns the most recent analysis for the service', async () => {
            prismaMock.service.findFirst.mockResolvedValue({ id: 1, userId: 1 });
            prismaMock.analysis.findFirst.mockResolvedValue({ id: 5, narrative: 'text' });

            const req = { params: { id: '1' }, user: { id: 1 } };
            const res = createMockRes();

            await analysisController.latest(req, res);

            expect(res.jsonBody.analysis).toEqual({ id: 5, narrative: 'text' });
        });

        it('returns null when there is no prior analysis', async () => {
            prismaMock.service.findFirst.mockResolvedValue({ id: 1, userId: 1 });
            prismaMock.analysis.findFirst.mockResolvedValue(null);

            const req = { params: { id: '1' }, user: { id: 1 } };
            const res = createMockRes();

            await analysisController.latest(req, res);

            expect(res.jsonBody.analysis).toBeNull();
        });
    });
});
