const prisma = require('../config/db');
const { analyzeService, saveAnalysis, classifyError } = require('../services/ai/analyzer');
const { DEFAULT_MODELS } = require('../services/ai/provider');

const GLOBAL_LIMIT = parseInt(process.env.AI_GLOBAL_ANALYSIS_LIMIT || '500', 10);
const USER_LIMIT = parseInt(process.env.AI_USER_ANALYSIS_LIMIT || '50', 10);
const MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '1024', 10);
const TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '15000', 10);

function startOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfDay() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function sendEvent(res, payload) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const analysisController = {};

analysisController.analyze = async (req, res) => {
    const { id } = req.params;

    if (!process.env.AI_API_KEY) {
        return res.status(503).json({
            code: 'AI_NOT_CONFIGURED',
            message: 'La feature de IA no está configurada. Contactá al administrador.',
        });
    }

    try {
        const service = await prisma.service.findFirst({
            where: { id: parseInt(id), userId: req.user.id },
        });

        if (!service) {
            return res.status(404).json({ code: 'NOT_FOUND', message: 'Servicio no encontrado.' });
        }

        const [analysesThisMonth, analysesToday] = await Promise.all([
            prisma.analysis.count({ where: { createdAt: { gte: startOfMonth() } } }),
            prisma.analysis.count({ where: { userId: req.user.id, createdAt: { gte: startOfDay() } } }),
        ]);

        if (analysesThisMonth >= GLOBAL_LIMIT) {
            return res.status(429).json({
                code: 'AI_GLOBAL_LIMIT_EXCEEDED',
                message: 'Se alcanzó el límite global de análisis del mes. Se resetea el mes que viene.',
            });
        }

        if (analysesToday >= USER_LIMIT) {
            return res.status(429).json({
                code: 'AI_USER_LIMIT_EXCEEDED',
                message: `Llegaste al límite diario de análisis (${USER_LIMIT}). Se resetea mañana.`,
            });
        }

        // From here on we've committed to an SSE stream: any further error
        // must be delivered as an "error" SSE event, not an HTTP status.
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });

        const provider = process.env.AI_PROVIDER || 'openai';
        const model = process.env.AI_MODEL || DEFAULT_MODELS[provider];

        try {
            const result = await analyzeService({
                prisma,
                service,
                provider,
                model,
                apiKey: process.env.AI_API_KEY,
                maxOutputTokens: MAX_TOKENS,
                timeoutMs: TIMEOUT_MS,
                onNarrativeChunk: (chunk) => sendEvent(res, { type: 'narrative-chunk', content: chunk }),
                onNarrativeReset: () => sendEvent(res, { type: 'narrative-reset' }),
            });

            const analysis = await saveAnalysis(prisma, {
                serviceId: service.id,
                userId: req.user.id,
                provider: result.provider,
                model: result.model,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                latencyMs: result.latencyMs,
                narrative: result.narrative,
                severity: result.severity,
                category: result.category,
                recommendation: result.recommendation,
                eventWindowStart: result.eventWindowStart,
                eventWindowEnd: result.eventWindowEnd,
            });

            sendEvent(res, {
                type: 'done',
                analysis: {
                    id: analysis.id,
                    narrative: result.narrative,
                    category: result.category,
                    recommendation: result.recommendation,
                    severity: result.severity,
                    provider: result.provider,
                    model: result.model,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    latencyMs: result.latencyMs,
                },
            });
        } catch (error) {
            console.error('AI analysis failed:', error);
            const { code, message } = classifyError(error);
            sendEvent(res, { type: 'error', code, message });
        } finally {
            res.end();
        }
    } catch (error) {
        console.error('AI analysis request failed:', error);
        if (!res.headersSent) {
            res.status(500).json({ code: 'AI_UNKNOWN_ERROR', message: 'Ocurrió un error inesperado. Intentá de nuevo.' });
        } else {
            sendEvent(res, { type: 'error', code: 'AI_UNKNOWN_ERROR', message: 'Ocurrió un error inesperado. Intentá de nuevo.' });
            res.end();
        }
    }
};

analysisController.latest = async (req, res) => {
    const { id } = req.params;

    const service = await prisma.service.findFirst({
        where: { id: parseInt(id), userId: req.user.id },
    });
    if (!service) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Servicio no encontrado.' });
    }

    const analysis = await prisma.analysis.findFirst({
        where: { serviceId: service.id },
        orderBy: { createdAt: 'desc' },
    });

    res.json({ analysis });
};

module.exports = analysisController;
