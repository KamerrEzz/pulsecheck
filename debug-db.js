const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Current Time:', new Date().toISOString());
    console.log('Querying for events since:', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    const services = await prisma.service.findMany({
        include: {
            _count: {
                select: { events: true }
            }
        }
    });

    console.log('\nServices found:', services.length);

    for (const service of services) {
        const recentEvents = await prisma.event.count({
            where: {
                serviceId: service.id,
                timestamp: {
                    gte: new Date(Date.now() - 60 * 60 * 1000)
                }
            }
        });

        console.log(`Service: ${service.name} (ID: ${service.id})`);
        console.log(`- Total Events: ${service._count.events}`);
        console.log(`- Events last 1h: ${recentEvents}`);
        
        // Get the latest event time
        const lastEvent = await prisma.event.findFirst({
            where: { serviceId: service.id },
            orderBy: { timestamp: 'desc' }
        });
        if (lastEvent) {
            console.log(`- Last Event Time: ${lastEvent.timestamp.toISOString()}`);
        }
        console.log('---');
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
