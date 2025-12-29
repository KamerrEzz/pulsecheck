const cron = require('node-cron');
const axios = require('axios');
const prisma = require('../config/db');
const { createClient } = require('redis');

const redisClient = createClient({ url: process.env.REDIS_URL });

redisClient.connect().catch(console.error);

const checkService = async (service) => {
    const start = Date.now();
    let status = 'UP';
    let statusCode = 200;
    let errorMessage = null;

    try {
        const response = await axios.get(service.url, { timeout: 5000 });
        statusCode = response.status;
    } catch (error) {
        status = 'DOWN';
        statusCode = error.response ? error.response.status : 0;
        errorMessage = error.message;
        
        // Debounce: Retry once immediately
        console.log(`Service ${service.name} failed first check. Retrying...`);
        try {
            const retryResponse = await axios.get(service.url, { timeout: 5000 });
            status = 'UP';
            statusCode = retryResponse.status;
            errorMessage = null;
        } catch (retryError) {
             status = 'DOWN';
             statusCode = retryError.response ? retryError.response.status : 0;
             errorMessage = retryError.message;
        }
    }

    const responseTime = Date.now() - start;

    // Update Redis
    // Set TTL slightly longer than check interval to ensure data availability
    const ttl = service.checkInterval * 2; 
    await redisClient.set(`service:${service.id}:status`, status, { EX: ttl });
    await redisClient.set(`service:${service.id}:responseTime`, responseTime, { EX: ttl });

    // Update History List (Keep last 20)
    await redisClient.lPush(`service:${service.id}:history`, status);
    await redisClient.lTrim(`service:${service.id}:history`, 0, 19);

    // Log Event
    await prisma.event.create({
        data: {
            statusCode,
            responseTime: parseInt(responseTime),
            message: errorMessage,
            serviceId: service.id
        }
    });

    // Update Service status in DB if changed
    if (service.status !== status) {
        await prisma.service.update({
            where: { id: service.id },
            data: { status }
        });
    }
};

const startMonitoring = () => {
    console.log('Monitoring worker initialized');
    // Run every 10 seconds to find services that need checking
    cron.schedule('*/10 * * * * *', async () => {
        try {
            const services = await prisma.service.findMany();
            
            services.forEach(async (service) => {
                // Check if it's time to check this service
                const lastCheckKey = `service:${service.id}:lastCheck`;
                const lastCheck = await redisClient.get(lastCheckKey);
                
                if (!lastCheck || (Date.now() - parseInt(lastCheck)) >= service.checkInterval * 1000) {
                    await redisClient.set(lastCheckKey, Date.now().toString());
                    checkService(service);
                }
            });
        } catch (error) {
            console.error('Error in monitoring loop:', error);
        }
    });
};

module.exports = { startMonitoring, checkService };
