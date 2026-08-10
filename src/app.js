const express = require('express');
const { engine } = require('express-handlebars');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');
const passport = require('passport');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Routes
const authRoutes = require('./routes/auth.routes');
const indexRoutes = require('./routes/index.routes');
const serviceRoutes = require('./routes/service.routes');
const statusRoutes = require('./routes/status.routes');
const analysisRoutes = require('./routes/analysis.routes');

// Config
require('./config/passport');
const { startMonitoring } = require('./services/monitor');

const app = express();

// Start Monitoring
startMonitoring();

// Redis Client
const redisClient = createClient({
    url: process.env.REDIS_URL
});
redisClient.connect().catch(console.error);

// Settings
app.set('views', path.join(__dirname, 'views'));
app.engine('.hbs', engine({
    defaultLayout: 'main',
    layoutsDir: path.join(app.get('views'), 'layouts'),
    partialsDir: path.join(app.get('views'), 'partials'),
    extname: '.hbs',
    helpers: {
            json: (context) => JSON.stringify(context),
            eq: (a, b) => a === b,
            gte: (a, b) => a >= b,
            formatDate: (date) => {
            if (!date) return 'Never';
            return new Date(date).toLocaleString();
        },
        formatTime: (date) => {
            if (!date) return '';
            return new Date(date).toLocaleTimeString();
        },
        statusClass: (status, type) => {
            const colors = {
                UP: {
                    border: 'border-green-500',
                    badge: 'bg-green-100 text-green-800',
                    text: 'text-green-600'
                },
                DOWN: {
                    border: 'border-red-500',
                    badge: 'bg-red-100 text-red-800',
                    text: 'text-red-600'
                },
                PENDING: {
                    border: 'border-yellow-500',
                    badge: 'bg-yellow-100 text-yellow-800',
                    text: 'text-yellow-600'
                }
            };
            const defaultColor = {
                border: 'border-gray-500',
                badge: 'bg-gray-100 text-gray-800',
                text: 'text-gray-600'
            };
            return (colors[status] || defaultColor)[type] || '';
        }
    }
}));
app.set('view engine', '.hbs');

// Middlewares
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
        }
    }
}));
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session
if (!process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET environment variable is not set');
    process.exit(1);
}

// AI Analysis is optional — only validate its config when AI_API_KEY is set.
// Without it, the feature stays disabled (the "Analyze with AI" button is
// hidden server-side) rather than failing startup.
if (process.env.AI_API_KEY) {
    const { AVAILABLE_MODELS } = require('./services/ai/provider');
    const provider = process.env.AI_PROVIDER || 'openai';

    if (!AVAILABLE_MODELS[provider]) {
        console.error(`FATAL: AI_PROVIDER "${provider}" is not supported. Use one of: ${Object.keys(AVAILABLE_MODELS).join(', ')}`);
        process.exit(1);
    }

    if (process.env.AI_MODEL && !AVAILABLE_MODELS[provider].includes(process.env.AI_MODEL)) {
        console.error(`FATAL: AI_MODEL "${process.env.AI_MODEL}" is not available for provider "${provider}". Use one of: ${AVAILABLE_MODELS[provider].join(', ')}`);
        process.exit(1);
    }
}

app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Global Variables
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

// Routes
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/services', serviceRoutes);
app.use('/services', analysisRoutes);
app.use('/status', statusRoutes);

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});