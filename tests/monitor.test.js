beforeEach(() => {
    jest.resetModules();
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.NODE_ENV = 'test';
});

describe('checkService - Monitor Logic', () => {
    // Per-test setup
    let axiosGet;
    let mockRedis;
    let callLog;
    let dbMock;

    beforeEach(() => {
        callLog = [];
        axiosGet = jest.fn();
        dbMock = {
            event: { create: jest.fn().mockResolvedValue(null) },
            service: { findMany: jest.fn(), update: jest.fn() }
        };

        mockRedis = {
            connect: jest.fn().mockResolvedValue(undefined),
            set: jest.fn(function(...args) {
                callLog.push({ method: 'set', args });
                return Promise.resolve('OK');
            }),
            lPush: jest.fn(function(...args) {
                callLog.push({ method: 'lPush', args });
                return Promise.resolve(1);
            }),
            lTrim: jest.fn(function(...args) {
                callLog.push({ method: 'lTrim', args });
                return Promise.resolve(0);
            }),
            get: jest.fn().mockResolvedValue(null),
        };
    });

    function setupMocks() {
        jest.doMock('axios', () => ({ get: axiosGet }));
        jest.doMock('../src/config/db', () => dbMock);
        jest.doMock('redis', () => ({ createClient: jest.fn(() => mockRedis) }));
    }

    it('should call axios.get with service URL on 200 response', async () => {
        setupMocks();
        axiosGet.mockResolvedValueOnce({ status: 200 });

        const { checkService } = require('../src/services/monitor');
        const service = { id: '1', name: 'test', url: 'http://test.com', status: 'PENDING', checkInterval: 60 };
        await checkService(service);

        expect(axiosGet).toHaveBeenCalledWith(service.url, { timeout: 5000 });
    });

    it('should call axios.get twice when service fails both checks', async () => {
        setupMocks();
        axiosGet.mockRejectedValue(new Error('ECONNREFUSED'));

        const { checkService } = require('../src/services/monitor');
        const service = { id: '2', name: 'down', url: 'http://down.com', status: 'PENDING', checkInterval: 60 };
        await checkService(service);

        expect(axiosGet).toHaveBeenCalledTimes(2);
    });

    it('should set DOWN status in Redis when both checks fail', async () => {
        setupMocks();
        axiosGet.mockRejectedValue(new Error('ECONNREFUSED'));

        const { checkService } = require('../src/services/monitor');
        const service = { id: '3', name: 'down2', url: 'http://down2.com', status: 'PENDING', checkInterval: 60 };
        await checkService(service);

        const statusCalls = callLog.filter(c => c.method === 'set' && c.args[0] && c.args[0].includes('status'));
        const lastStatus = statusCalls[statusCalls.length - 1]?.args[1];
        expect(lastStatus).toBe('DOWN');
    });

    it('should recover status to UP on successful retry', async () => {
        setupMocks();
        axiosGet.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce({ status: 200 });

        const { checkService } = require('../src/services/monitor');
        const service = { id: '4', name: 'recover', url: 'http://recover.com', status: 'DOWN', checkInterval: 60 };
        await checkService(service);

        const statusCalls = callLog.filter(c => c.method === 'set' && c.args[0] && c.args[0].includes('status'));
        const lastUpStatus = statusCalls[statusCalls.length - 1]?.args[1];
        expect(lastUpStatus).toBe('UP');
    });

    it('should write status, responseTime, and lastCheck to Redis', async () => {
        setupMocks();
        axiosGet.mockResolvedValue({ status: 200 });

        const { checkService } = require('../src/services/monitor');
        const service = { id: '5', name: 'multi', url: 'http://multi.com', status: 'PENDING', checkInterval: 60 };
        await checkService(service);

        const setKeys = callLog
            .filter(c => c.method === 'set')
            .map(c => c.args[0]);

        expect(setKeys.some(k => k && k.includes(':status'))).toBe(true);
        expect(setKeys.some(k => k && k.includes(':responseTime'))).toBe(true);
        expect(setKeys.some(k => k && k.includes(':lastCheck'))).toBe(true);
    });

    it('should use lPush + lTrim for bounded history list', async () => {
        setupMocks();
        axiosGet.mockResolvedValue({ status: 200 });

        const { checkService } = require('../src/services/monitor');
        const service = { id: '6', name: 'hist', url: 'http://hist.com', status: 'PENDING', checkInterval: 60 };
        await checkService(service);

        expect(callLog.some(c => c.method === 'lPush')).toBe(true);
        expect(callLog.some(c => c.method === 'lTrim')).toBe(true);
    });

    it('should create prisma event with service details', async () => {
        setupMocks();
        axiosGet.mockResolvedValue({ status: 200 });

        const { checkService } = require('../src/services/monitor');
        const service = { id: '7', name: 'event', url: 'http://event.com', status: 'PENDING', checkInterval: 60 };
        await checkService(service);

        expect(dbMock.event.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ serviceId: '7' }) })
        );
    });

    it('should NOT update service in DB when status unchanged', async () => {
        setupMocks();
        axiosGet.mockResolvedValue({ status: 200 });

        const { checkService } = require('../src/services/monitor');
        const service = { id: '8', name: 'same', url: 'http://same.com', status: 'UP', checkInterval: 60 };
        await checkService(service);

        expect(dbMock.service.update).not.toHaveBeenCalled();
    });

    it('should update service in DB when status changed', async () => {
        setupMocks();
        axiosGet.mockResolvedValueOnce({ status: 200 });

        const { checkService } = require('../src/services/monitor');
        const service = { id: '9', name: 'changed', url: 'http://changed.com', status: 'DOWN', checkInterval: 60 };
        await checkService(service);

        expect(dbMock.service.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: '9' }, data: { status: 'UP' } })
        );
    });
});