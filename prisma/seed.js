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

    console.log(`Created user with id: ${user.id}`);

    // Create Services
    const service1 = await prisma.service.create({
        data: {
            name: 'Google',
            url: 'https://google.com',
            checkInterval: 60,
            status: 'UP',
            userId: user.id,
        },
    });

    const service2 = await prisma.service.create({
        data: {
            name: 'Example',
            url: 'https://example.com',
            checkInterval: 30,
            status: 'UP',
            userId: user.id,
        },
    });

    // Create some fake events for Google
    const now = new Date();
    for (let i = 0; i < 24; i++) {
        await prisma.event.create({
            data: {
                statusCode: 200,
                responseTime: Math.floor(Math.random() * 200) + 50,
                serviceId: service1.id,
                timestamp: new Date(now.getTime() - i * 60 * 60 * 1000) // 1 event per hour back
            }
        });
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
