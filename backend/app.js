import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import xss from 'xss-clean';
import hpp from 'hpp';
import compression from 'compression';
import RedisStore from 'rate-limit-redis';
import { createLogger, transports, format } from 'winston';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocs } from './config/swagger.js';
import authRoutes from './routes/authRoutes.js';
import animeRoutes from './routes/animeRoutes.js';
import userRoutes from './routes/userRoutes.js'; // Ensure this is imported
import errorHandler from './middleware/errorHandler.js';
import config from './config/config.js';
import redisClient from './utils/redis.js';
import HianimeAPI from './hianime-api.js';
import fs from 'fs';
import path from 'path';

const app = express();

// ====== LOGGER CONFIGURATION ====== //
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, stack }) => 
          `${timestamp} ${level}: ${message}${stack ? `\n${stack}` : ''}`)
      )
    }),
    new transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880
    })
  ]
});

// ====== SECURITY MIDDLEWARE ====== //
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://*.jikan.moe", "https://*.hianime.to"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://*.jikan.moe", "https://*.hianime.to"],
      mediaSrc: ["'self'", "blob:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(xss());
app.use(hpp());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// ====== BASIC MIDDLEWARE ====== //
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (message) => logger.info(message.trim()) }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(compression());

// ====== RATE LIMITING ====== //
const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 200 : 2000,
  handler: (_, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later'
    });
  }
});

// ====== ROUTES & DOCS ====== //
app.use('/api', apiLimiter);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/anime', animeRoutes);
app.use('/api/v1/users', userRoutes); // Ensure this is imported

// ====== SERVE INDEX.HTML ====== //
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) {
      logger.error(`Failed to read index.html: ${err.message}`);
      return res.status(500).send('Internal Server Error');
    }
    res.send(data);
  });
});

// ====== HIAnime INTEGRATION ====== //
const hianimeProxy = async (req, res, next) => {  
  try {  
    const { episodeId } = req.params;  
    const links = await HianimeAPI.getVideoLinks(episodeId);  
    req.hianimeData = links;
    next();  
  } catch (err) {  
    logger.error(`Hianime Proxy Error: ${err.stack}`);  
    next(err);  
  }  
};

app.get('/api/v1/hianime/:episodeId',  
  rateLimit({  
    windowMs: 5 * 60 * 1000, // 5 minutes  
    max: 300,  
    keyGenerator: (req) => req.ip + req.params.episodeId  
  }),  
  hianimeProxy,  
  (req, res) => {  
    res.json({  
      status: 'success',  
      data: req.hianimeData  
    });  
  }  
);

// ====== HEALTH CHECK ====== //
app.get('/health', (_, res) => {
  const healthCheck = {
    status: 'OK',
    uptime: process.uptime(),
    timestamp: Date.now(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: redisClient.status === 'ready' ? 'connected' : 'disconnected',
    memory: process.memoryUsage(),
    load: process.cpuUsage()
  };
  res.status(200).json(healthCheck);
});

// ====== ERROR HANDLING ====== //
app.use((err, req, res, next) => {  
  if (err.message.includes('Hianime')) {  
    logger.warn(`Hianime-specific error: ${err.message}`);  
    return res.status(503).json({  
      error: 'Video service temporarily unavailable',  
      bypass: 'https://backup-hianime.danbypass.to/'  
    });  
  }  
  next(err);  
});

app.use(errorHandler);

// ====== DATABASE & SERVER ====== //
const connectWithRetry = async () => {
  try {
    await mongoose.connect(config.mongodbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });
    logger.info('Connected to MongoDB');
    await redisClient.ping();
    logger.info('Connected to Redis');
  } catch (err) {
    logger.error(`Connection failed: ${err.message}`);
    setTimeout(connectWithRetry, 10000);
  }
};

connectWithRetry();

const PORT = config.port || 3000;
const server = app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// ====== GRACEFUL SHUTDOWN ====== //
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, initiating graceful shutdown`);
  try {
    await new Promise(resolve => setTimeout(resolve, 10000));
    server.close(() => {
      mongoose.connection.close(false, () => {
        redisClient.quit(() => {
          logger.info('Services closed successfully');
          process.exit(0);
        });
      });
    });
  } catch (err) {
    logger.error(`Forced shutdown: ${err.message}`);
    process.exit(1);
  }
};

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => 
  process.on(signal, () => shutdown(signal))
);

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.stack || err.message}`);
  shutdown('unhandled rejection');
});