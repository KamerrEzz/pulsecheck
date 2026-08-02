const prisma = require('../config/db');
const { createClient } = require('redis');

const redisClient = createClient({
    url: process.env.REDIS_URL
});
redisClient.connect().catch(console.error);

const statusController = {};

statusController.publicStatus = async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(userId) },
            select: { id: true, email: true, createdAt: true }
        });

        if (!user) {
            return res.status(404).send('User not found');
        }

        const services = await prisma.service.findMany({
            where: { userId: parseInt(userId) },
            orderBy: { id: 'desc' }
        });

        const enrichedServices = await Promise.all(services.map(async (service) => {
            const status = await redisClient.get(`service:${service.id}:status`) || service.status;
            const responseTime = await redisClient.get(`service:${service.id}:responseTime`);
            const history = await redisClient.lRange(`service:${service.id}:history`, 0, -1) || [];
            return { ...service, status, responseTime, history };
        }));

        res.render('status/public', {
            layout: false,
            user,
            services: enrichedServices
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading status page');
    }
};

module.exports = statusController;