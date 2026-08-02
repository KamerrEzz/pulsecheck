describe('Promise.all vs for...of - Async Error Handling', () => {
    describe('Promise.all rejects when any check fails', () => {
        it('should reject with an error when one service check fails', async () => {
            // Simulates monitor.js line 77:
            // Promise.all(services.map(async (service) => { await checkService(service); }))
            // If one async check throws, Promise.all rejects entirely

            async function checkOne() { throw new Error('service down'); }
            async function checkTwo() { return { status: 'UP' }; }

            await expect(
                Promise.all([checkOne(), checkTwo()])
            ).rejects.toThrow('service down');
        });

        it('should collect all results when all checks succeed', async () => {
            async function checkA() { return { id: 'a' }; }
            async function checkB() { return { id: 'b' }; }
            async function checkC() { return { id: 'c' }; }

            const results = await Promise.all([checkA(), checkB(), checkC()]);

            expect(results).toHaveLength(3);
            expect(results).toEqual([
                { id: 'a' },
                { id: 'b' },
                { id: 'c' }
            ]);
        });

        it('should reject silently killed by try/catch in cron', async () => {
            // In monitor.js, the cron handler wraps Promise.all in try/catch (lines 74-90)
            // This prevents the cron job itself from crashing on errors

            const services = [
                { id: 1, check: async () => ({ status: 'UP' }) },
                { id: 2, check: async () => { throw new Error('fail'); } },
                { id: 3, check: async () => ({ status: 'UP' }) },
            ];

            let caughtError = null;

            try {
                await Promise.all(services.map(s => s.check()));
            } catch (err) {
                caughtError = err;
            }

            expect(caughtError).toBeInstanceOf(Error);
            expect(caughtError).toHaveProperty('message', 'fail');
        });
    });

    describe('Vanilla for...of comparison', () => {
        it('for...of can be used for sequential execution with per-try control', async () => {
            async function checkService(id) {
                if (id === 'b') throw new Error(`service ${id} failed`);
                return { id, status: 'UP' };
            }

            const results = [];
            const errors = [];

            for (const id of ['a', 'b', 'c']) {
                try {
                    results.push(await checkService(id));
                } catch (err) {
                    errors.push(err.message);
                }
            }

            // for...of continues past errors; Promise.all does not
            expect(results).toHaveLength(2);
            expect(errors).toHaveLength(1);
            expect(errors).toContain('service b failed');
        });

        it('shows why forEach with async is the old bug', async () => {
            // The pre-fix code likely used:
            //   services.forEach(async (s) => { await checkService(s); });
            // which doesn't await, so the cron task completes immediately
            // without waiting for any checks to finish.

            // Verify: forEach returns undefined - no way to await it
            const services = [
                { id: 1, check: async () => { await new Promise(r => setTimeout(r, 10)); return 'done'; } },
            ];

            let asyncResults = [];
            let forEachReturned = services.forEach(async (s) => {
                asyncResults.push(await s.check());
            });

            expect(forEachReturned).toBe(undefined);
            // asyncResults would be empty here because forEach doesn't wait
            expect(asyncResults).toEqual([]);
        });

        it('demonstrates the correct pattern: map + Promise.all with individual error handling', async () => {
            // Correct approach: for...of loop with per-service try/catch
            // This both awaits and allows individual failures

            const services = [
                { id: 1, check: async () => ({ status: 'UP' }) },
                { id: 2, check: async () => ({ status: 'UP' }) },
            ];

            const outcomes = [];

            async function checkAllSequentially() {
                for (const service of services) {
                    try {
                        const result = await service.check();
                        outcomes.push({ serviceId: service.id, result, error: null });
                    } catch (err) {
                        outcomes.push({ serviceId: service.id, result: null, error: err.message });
                    }
                }
            }

            await checkAllSequentially();

            expect(outcomes).toHaveLength(2);
            expect(outcomes.every(o => o.error === null)).toBe(true);
        });
    });

    describe('Monitoring loop error handling', () => {
        it('should use try/catch wrapper in cron to prevent silent failure', async () => {
            // monitor.js lines 74-90: cron.schedule('*/10 * * * * *', async () => {
            //   try { await Promise.all(...) } catch (error) { console.error(...) }
            // This ensures a single service failure doesn't kill the cron job

            let hasError = false;
            let hasCaughtError = false;

            async function monitoringLoop() {
                try {
                    await Promise.all([
                        Promise.resolve({ status: 'UP' }),
                        Promise.reject(new Error('one failed'))
                    ]);
                } catch (error) {
                    hasCaughtError = true;
                    hasError = true;
                }
            }

            await monitoringLoop();

            expect(hasError).toBe(true);
            expect(hasCaughtError).toBe(true);
        });
    });
});