const prisma = require('../config/db');
const { createClient } = require('redis');
const { checkService } = require('../services/monitor');

const redisClient = createClient({
    url: process.env.REDIS_URL
});
redisClient.connect().catch(console.error);

const serviceController = {};

serviceController.dashboard = async (req, res) => {
    try {
        const services = await prisma.service.findMany({
            where: { userId: req.user.id },
            orderBy: { id: 'desc' }
        });

        // Enrich with Redis data
        const enrichedServices = await Promise.all(services.map(async (service) => {
            const status = await redisClient.get(`service:${service.id}:status`) || service.status;
            const responseTime = await redisClient.get(`service:${service.id}:responseTime`);
            const history = await redisClient.lRange(`service:${service.id}:history`, 0, -1) || [];
            return { ...service, status, responseTime, history };
        }));

        res.render('dashboard', { services: enrichedServices });
    } catch (error) {
        console.error(error);
        res.render('dashboard', { error: 'Error loading dashboard' });
    }
};

serviceController.listPartial = async (req, res) => {
    try {
        let { search } = req.query;
        // Handle case where search is an array (e.g. duplicate query params)
        if (Array.isArray(search)) {
            search = search[0];
        }

        const where = {
            userId: req.user.id
        };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { url: { contains: search, mode: 'insensitive' } }
            ];
        }

        const services = await prisma.service.findMany({
            where,
            orderBy: { id: 'desc' }
        });

        const enrichedServices = await Promise.all(services.map(async (service) => {
            const status = await redisClient.get(`service:${service.id}:status`) || service.status;
            const responseTime = await redisClient.get(`service:${service.id}:responseTime`);
            const history = await redisClient.lRange(`service:${service.id}:history`, 0, -1) || [];
            return { ...service, status, responseTime, history };
        }));

        res.render('partials/service-list', { layout: false, services: enrichedServices });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading services');
    }
};

serviceController.renderNew = (req, res) => {
    res.render('services/new');
};

serviceController.create = async (req, res) => {
    const { name, url, checkInterval } = req.body;
    try {
        await prisma.service.create({
            data: {
                name,
                url,
                checkInterval: parseInt(checkInterval),
                userId: req.user.id
            }
        });
        res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
        res.render('services/new', { error: 'Error creating service', service: req.body });
    }
};

serviceController.renderEdit = async (req, res) => {
    const { id } = req.params;
    try {
        const service = await prisma.service.findFirst({
            where: { id: parseInt(id), userId: req.user.id }
        });
        if (!service) return res.redirect('/dashboard');
        res.render('services/edit', { service });
    } catch (error) {
        console.error(error);
        res.redirect('/dashboard');
    }
};

serviceController.update = async (req, res) => {
    const { id } = req.params;
    const { name, url, checkInterval } = req.body;
    try {
        await prisma.service.updateMany({
            where: { id: parseInt(id), userId: req.user.id },
            data: {
                name,
                url,
                checkInterval: parseInt(checkInterval)
            }
        });
        res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
        res.redirect('/dashboard');
    }
};

serviceController.checkNow = async (req, res) => {
    const { id } = req.params;
    try {
        const service = await prisma.service.findFirst({
            where: { id: parseInt(id), userId: req.user.id }
        });

        if (!service) return res.status(404).send();

        // Perform immediate check
        await checkService(service);

        // Get updated status
        const status = await redisClient.get(`service:${service.id}:status`) || service.status;
        const responseTime = await redisClient.get(`service:${service.id}:responseTime`);
        const history = await redisClient.lRange(`service:${service.id}:history`, 0, -1) || [];
        
        const enrichedService = { ...service, status, responseTime, history };

        // Handle details view request
        if (req.query.view === 'details') {
            return res.render('partials/service-status-card', { layout: false, service: enrichedService });
        }

        // Render just the single service card
        res.render('partials/single-service', { layout: false, service: enrichedService });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error checking service');
    }
};

serviceController.delete = async (req, res) => {
    const { id } = req.params;
    try {
        const serviceId = parseInt(id);
        
        // Delete related events first (Fix for foreign key constraint)
        await prisma.event.deleteMany({
            where: { serviceId: serviceId }
        });

        // Delete the service
        await prisma.service.deleteMany({
            where: { id: serviceId, userId: req.user.id }
        });

        // Also cleanup redis keys
        await redisClient.del(`service:${id}:status`);
        await redisClient.del(`service:${id}:responseTime`);
        await redisClient.del(`service:${id}:history`);
        await redisClient.del(`service:${id}:lastCheck`);
        
        // Handle HTMX request
        if (req.headers['hx-request']) {
            return res.status(200).send('');
        }

        res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
        // If HTMX request fails, don't redirect to dashboard (causes visual bug)
        if (req.headers['hx-request']) {
            return res.status(500).send('<div class="bg-red-100 text-red-700 p-2 rounded">Error deleting service</div>');
        }
        res.redirect('/dashboard');
    }
};

serviceController.show = async (req, res) => {
    const { id } = req.params;
    try {
        const service = await prisma.service.findFirst({
            where: { id: parseInt(id), userId: req.user.id }
        });
        
        if (!service) return res.redirect('/dashboard');

        // Fetch events for chart (last 1 hour)
        const events = await prisma.event.findMany({
            where: { 
                serviceId: service.id,
                timestamp: {
                    gte: new Date(Date.now() - 60 * 60 * 1000)
                }
            },
            orderBy: { timestamp: 'asc' }
        });

        // Calculate Stats
        const totalChecks = events.length;
        const upChecks = events.filter(e => e.statusCode >= 200 && e.statusCode < 400).length;
        const uptime = totalChecks > 0 ? ((upChecks / totalChecks) * 100).toFixed(2) : 100;
        
        const totalResponseTime = events.reduce((acc, curr) => acc + curr.responseTime, 0);
        const avgResponseTime = totalChecks > 0 ? Math.round(totalResponseTime / totalChecks) : 0;

        // Get live status from Redis
        const liveStatus = await redisClient.get(`service:${service.id}:status`) || service.status;
        const liveResponseTime = await redisClient.get(`service:${service.id}:responseTime`) || 0;
        const lastCheck = await redisClient.get(`service:${service.id}:lastCheck`); // We need to store this in monitor.js

        // Recent Logs (Reverse order for table)
        const logs = [...events].reverse().slice(0, 50);

        res.render('services/show', { 
            service: { 
                ...service, 
                status: liveStatus, 
                responseTime: liveResponseTime,
                lastCheck: lastCheck ? new Date(parseInt(lastCheck)) : null
            }, 
            stats: {
                uptime,
                avgResponseTime,
                totalChecks
            },
            events: events, // For Chart
            logs, // For Table
            aiEnabled: Boolean(process.env.AI_API_KEY)
        });
    } catch (error) {
        console.error(error);
        res.redirect('/dashboard');
    }
};

serviceController.logsPartial = async (req, res) => {
    const { id } = req.params;
    try {
        const events = await prisma.event.findMany({
            where: { serviceId: parseInt(id) },
            orderBy: { timestamp: 'desc' },
            take: 20
        });
        res.render('partials/service-logs', { layout: false, logs: events });
    } catch (error) {
        res.status(500).send('');
    }
};

module.exports = serviceController;
