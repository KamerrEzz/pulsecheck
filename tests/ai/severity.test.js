const { calculateSeverity } = require('../../src/services/ai/severity');

describe('calculateSeverity', () => {
    it('returns critical when uptime < 95%, regardless of other metrics', () => {
        expect(calculateSeverity({
            uptimePercent: 94.9, avgResponseTime: 50, trend: 'stable', failureRate: 0.01
        })).toBe('critical');
    });

    it('returns warning when trend is degrading and response time > 500ms', () => {
        expect(calculateSeverity({
            uptimePercent: 99.9, avgResponseTime: 600, trend: 'degrading', failureRate: 0.01
        })).toBe('warning');
    });

    it('returns warning when trend is degrading even with low response time', () => {
        expect(calculateSeverity({
            uptimePercent: 99.9, avgResponseTime: 100, trend: 'degrading', failureRate: 0.01
        })).toBe('warning');
    });

    it('returns warning when failure rate exceeds 10%', () => {
        expect(calculateSeverity({
            uptimePercent: 99.9, avgResponseTime: 100, trend: 'stable', failureRate: 0.15
        })).toBe('warning');
    });

    it('returns warning when uptime is below 99.5% but above 95%', () => {
        expect(calculateSeverity({
            uptimePercent: 98, avgResponseTime: 100, trend: 'stable', failureRate: 0.01
        })).toBe('warning');
    });

    it('returns info for a healthy, stable service', () => {
        expect(calculateSeverity({
            uptimePercent: 99.9, avgResponseTime: 80, trend: 'stable', failureRate: 0.001
        })).toBe('info');
    });

    it('returns info for perfect uptime', () => {
        expect(calculateSeverity({
            uptimePercent: 100, avgResponseTime: 50, trend: 'stable', failureRate: 0
        })).toBe('info');
    });
});
