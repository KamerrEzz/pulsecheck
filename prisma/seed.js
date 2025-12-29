const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding ...');

    // Create User
    const hashedPassword = await bcrypt.hash('password123', 10);
    const user = await prisma.user.upsert({
        where: { email: 'test@example.com' },
        update: {},
        create: {
            email: 'test@example.com',
            password: hashedPassword,
        },
    });

    console.log(`User ID: ${user.id}`);

    // Define Services
    const servicesData = [
        {
            name: 'Google Production',
            url: 'https://google.com',
            checkInterval: 60,
            status: 'UP'
        },
        {
            name: 'Legacy API (Unstable)',
            url: 'https://example.com/api',
            checkInterval: 30,
            status: 'DOWN'
        },
        {
            name: 'Internal Dashboard (Slow)',
            url: 'http://localhost:3000/slow',
            checkInterval: 60,
            status: 'UP'
        }
    ];

    // Create/Update Services & Generate Events
    for (const sData of servicesData) {
        // Upsert Service
        // Note: Prisma doesn't support upsert by non-unique fields easily, so we findFirst then update or create
        let service = await prisma.service.findFirst({
            where: { name: sData.name, userId: user.id }
        });

        if (service) {
            service = await prisma.service.update({
                where: { id: service.id },
                data: { ...sData }
            });
        } else {
            service = await prisma.service.create({
                data: { ...sData, userId: user.id }
            });
        }
        
        console.log(`Processing service: ${service.name}`);

        // Clear existing events to avoid clutter
        await prisma.event.deleteMany({
            where: { serviceId: service.id }
        });

        // Generate Events for the last 2 hours (to cover the 1h window comfortably)
        const now = new Date();
        const events = [];
        // Generate a check every minute for 120 minutes
        for (let i = 0; i < 120; i++) {
            const time = new Date(now.getTime() - i * 60 * 1000);
            
            let statusCode = 200;
            let responseTime = 50;
            let message = 'OK';

            // Simulate different behaviors
            if (sData.name.includes('Unstable')) {
                // 20% chance of failure
                if (Math.random() < 0.2) {
                    statusCode = 500;
                    message = 'Internal Server Error';
                    responseTime = Math.floor(Math.random() * 100) + 10;
                } else {
                    responseTime = Math.floor(Math.random() * 300) + 100;
                }
            } else if (sData.name.includes('Slow')) {
                // Always OK but slow
                responseTime = Math.floor(Math.random() * 500) + 400; // 400-900ms
            } else {
                // Google (Stable)
                responseTime = Math.floor(Math.random() * 100) + 20; // 20-120ms
            }

            events.push({
                serviceId: service.id,
                statusCode,
                responseTime,
                message,
                timestamp: time
            });
        }

        await prisma.event.createMany({
            data: events
        });
        console.log(`Generated ${events.length} events for ${service.name}`);
    }

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
