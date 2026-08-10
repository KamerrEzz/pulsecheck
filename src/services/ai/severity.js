/**
 * Computes service severity deterministically from metrics. The model
 * never decides severity — it only receives this pre-computed value as context.
 * @param {{ uptimePercent: number, avgResponseTime: number, trend: string, failureRate: number }} metrics
 * @returns {'info'|'warning'|'critical'}
 */
function calculateSeverity(metrics) {
    const { uptimePercent, avgResponseTime, trend, failureRate } = metrics;

    if (uptimePercent < 95) {
        return 'critical';
    }

    if (trend === 'degrading' && avgResponseTime > 500) {
        return 'warning';
    }

    if (trend === 'degrading') {
        return 'warning';
    }

    if (failureRate > 0.10) {
        return 'warning';
    }

    if (uptimePercent < 99.5) {
        return 'warning';
    }

    return 'info';
}

module.exports = { calculateSeverity };
