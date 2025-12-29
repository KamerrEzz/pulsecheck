const prisma = require('../config/db');
const bcrypt = require('bcrypt');

const authController = {};

authController.renderRegister = (req, res) => {
    res.render('auth/register');
};

authController.register = async (req, res) => {
    const { email, password, confirmPassword } = req.body;
    
    if (password !== confirmPassword) {
        return res.render('auth/register', { error: 'Passwords do not match' });
    }

    try {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.render('auth/register', { error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                email,
                password: hashedPassword
            }
        });

        res.redirect('/auth/login');
    } catch (error) {
        console.error(error);
        res.render('auth/register', { error: 'Something went wrong' });
    }
};

authController.renderLogin = (req, res) => {
    res.render('auth/login');
};

authController.logout = (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
};

module.exports = authController;
