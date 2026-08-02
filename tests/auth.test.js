describe('Auth Controller', () => {
    let authController;
    let prismaMock;
    let bcryptMock;

    beforeEach(() => {
        jest.resetModules();

        bcryptMock = {
            hash: jest.fn().mockResolvedValue('hashedpassword123'),
            compare: jest.fn().mockResolvedValue(true)
        };

        prismaMock = {
            user: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({ id: '1', email: 'new@test.com' })
            },
            service: { findMany: jest.fn(), update: jest.fn() },
            event: { create: jest.fn().mockResolvedValue(null) }
        };

        jest.doMock('bcrypt', () => bcryptMock);
        jest.doMock('../src/config/db', () => prismaMock);

        authController = require('../src/controllers/auth.controller');
    });

    describe('register', () => {
        it('should render with error when passwords do not match', async () => {
            const mockReq = {
                body: {
                    email: 'user@test.com',
                    password: 'pass123',
                    confirmPassword: 'different'
                }
            };
            const mockRes = { render: jest.fn() };

            await authController.register(mockReq, mockRes);

            expect(mockRes.render).toHaveBeenCalledWith('auth/register', { error: 'Passwords do not match' });
            expect(bcryptMock.hash).not.toHaveBeenCalled();
        });

        it('should render with error when email already exists', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce({ id: '1', email: 'exist@test.com' });

            const mockReq = {
                body: {
                    email: 'exist@test.com',
                    password: 'pass123',
                    confirmPassword: 'pass123'
                }
            };
            const mockRes = { render: jest.fn() };

            await authController.register(mockReq, mockRes);

            expect(mockRes.render).toHaveBeenCalledWith('auth/register', { error: 'Email already exists' });
            expect(bcryptMock.hash).not.toHaveBeenCalled();
            expect(prismaMock.user.create).not.toHaveBeenCalled();
        });

        it('should hash password and create user when valid', async () => {
            const mockReq = {
                body: {
                    email: 'new@test.com',
                    password: 's3cur3Pass',
                    confirmPassword: 's3cur3Pass'
                }
            };
            const mockRes = { redirect: jest.fn() };

            prismaMock.user.findUnique.mockResolvedValue(null);

            await authController.register(mockReq, mockRes);

            expect(bcryptMock.hash).toHaveBeenCalledWith('s3cur3Pass', 10);
            expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    email: 'new@test.com',
                    password: 'hashedpassword123'
                })
            }));
            expect(mockRes.redirect).toHaveBeenCalledWith('/auth/login');
        });

        it('should render error page on create failure', async () => {
            prismaMock.user.create.mockRejectedValueOnce(new Error('DB error'));

            const mockReq = {
                body: {
                    email: 'fail@test.com',
                    password: 'pass123',
                    confirmPassword: 'pass123'
                }
            };
            const mockRes = { render: jest.fn() };

            await authController.register(mockReq, mockRes);

            expect(mockRes.render).toHaveBeenCalledWith('auth/register', { error: 'Something went wrong' });
        });
    });

    describe('renderLogin', () => {
        it('should render login template', () => {
            const mockRes = { render: jest.fn() };
            authController.renderLogin(null, mockRes);
            expect(mockRes.render).toHaveBeenCalledWith('auth/login');
        });
    });

    describe('renderRegister', () => {
        it('should render register template', () => {
            const mockRes = { render: jest.fn() };
            authController.renderRegister(null, mockRes);
            expect(mockRes.render).toHaveBeenCalledWith('auth/register');
        });
    });

    describe('logout', () => {
        it('should call req.logout and redirect to root', async () => {
            const mockReq = {
                logout: jest.fn((cb) => { cb && cb(null); })
            };
            const mockRes = { redirect: jest.fn() };

            await authController.logout(mockReq, mockRes, () => {});

            expect(mockRes.redirect).toHaveBeenCalledWith('/');
        });
    });
});