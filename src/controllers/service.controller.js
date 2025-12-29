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
            return { ...service, status, responseTime };
        }));

        res.render('dashboard', { services: enrichedServices });
    } catch (error) {
        console.error(error);
        res.render('dashboard', { error: 'Error loading dashboard' });
    }
};

serviceController.listPartial = async (req, res) => {
    try {
        const { search } = req.query;
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
            return { ...service, status, responseTime };
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
        await prisma.service.deleteMany({
            where: { id: parseInt(id), userId: req.user.id }
        });
        // Also cleanup redis keys if needed
        await redisClient.del(`service:${id}:status`);
        await redisClient.del(`service:${id}:responseTime`);
        
        // Handle HTMX request
        if (req.headers['hx-request']) {
            return res.status(200).send('');
        }

        res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
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

        // Fetch events for chart (last 24 hours)
        const events = await prisma.event.findMany({
            where: { 
                serviceId: service.id,
                timestamp: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            },
            orderBy: { timestamp: 'asc' }
        });

        // Get live status from Redis
        const liveStatus = await redisClient.get(`service:${service.id}:status`) || service.status;
        const liveResponseTime = await redisClient.get(`service:${service.id}:responseTime`) || 0;

        res.render('services/show', { 
            service: { ...service, status: liveStatus, responseTime: liveResponseTime }, 
            events: JSON.stringify(events)
        });
    } catch (error) {
        console.error(error);
        res.redirect('/dashboard');
    }
};

module.exports = serviceController;
