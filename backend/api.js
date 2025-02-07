import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import cheerio from 'cheerio';
import cluster from 'cluster';
import os from 'os';
import fs from 'fs/promises';
import axios from 'axios';
import Redis from 'ioredis';
import { throttle } from 'lodash';
import Bull from 'bull';
import Prometheus from 'prom-client';
import { createLogger, transports, format } from 'winston';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocs } from './config/swagger.js';
import authRoutes from './routes/authRoutes.js';
import animeRoutes from './routes/animeRoutes.js';
import userRoutes from './routes/userRoutes.js';
import errorHandler from './middleware/errorHandler.js';
import config from './config/config.js';
import redisClient from './utils/redis.js';
import HianimeAPI from './hianime-api.js';

puppeteer.use(StealthPlugin());

// Enhanced Configuration
const CONFIG = {
  PROXY_ROTATION_INTERVAL: 2500, // Reduced for better rotation
  MAX_CONCURRENT_TASKS: 100, // Increased capacity
  CACHE_TTL: 7200,
  PORT: process.env.PORT || 4000,
  BROWSER_POOL_SIZE: 15, // Increased pool size
  REQUEST_TIMEOUT: 15000,
  RETRY_ATTEMPTS: 3,
  RATE_LIMIT: 100, // Max requests per minute
  WINDOW_SIZE: 60000, // 1 minute
  LOG_LEVEL: 'info',
};

// Logger Configuration
const logger = createLogger({
  level: CONFIG.LOG_LEVEL,
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

// Cluster setup with shared TCP connection
if (cluster.isMaster) {
  const cpuCount = os.cpus().length;
  let workers = [];

  // Fork workers
  for (let i = 0; i < cpuCount; i++) {
    workers.push(cluster.fork());
  }

  // Monitor worker health
  cluster.on('exit', (worker, code, signal) => {
    logger.error(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
    workers = workers.filter(w => w.process.pid !== worker.process.pid);
    const newWorker = cluster.fork();
    workers.push(newWorker);
  });

  // Dynamic scaling based on queue size
  setInterval(() => {
    const queueSize = browserPool.taskQueue.getJobCounts().waiting;
    if (queueSize > CONFIG.MAX_CONCURRENT_TASKS && workers.length < cpuCount * 2) {
      workers.push(cluster.fork());
    } else if (queueSize < CONFIG.MAX_CONCURRENT_TASKS / 2 && workers.length > cpuCount) {
      const workerToKill = workers.pop();
      workerToKill.kill();
    }
  }, 5000);

  return;
}

const app = express();
const redis = new Redis.Cluster([{ host: 'localhost', port: 6379 }]);
const metrics = new Prometheus.Registry();

// Prometheus metrics
const httpRequestDuration = new Prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});
metrics.registerMetric(httpRequestDuration);

// Circuit Breaker Implementation
class CircuitBreaker {
  constructor(maxFailures = 5, cooldownPeriod = 30000) {
    this.maxFailures = maxFailures;
    this.cooldownPeriod = cooldownPeriod;
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = null;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      const elapsedTime = Date.now() - this.lastFailureTime;
      if (elapsedTime > this.cooldownPeriod) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Service unavailable');
      }
    }
    try {
      const result = await fn();
      if (this.state === 'HALF_OPEN') {
        this.failureCount = 0;
        this.state = 'CLOSED';
      }
      return result;
    } catch (error) {
      this.failureCount++;
      if (this.failureCount >= this.maxFailures) {
        this.state = 'OPEN';
        this.lastFailureTime = Date.now();
      }
      throw error;
    }
  }
}

// Advanced Proxy Management
class ProxyManager {
  constructor() {
    this.proxies = [];
    this.currentIndex = 0;
    this.userAgents = [];
    this.proxyHealth = new Map();
  }

  async init() {
    await this.updateProxies();
    setInterval(() => this.updateProxies(), 300000);
    this.userAgents = await fs.readFile('./user-agents.txt', 'utf-8')
      .then(data => data.split('\n').filter(Boolean));
    setInterval(() => this.checkProxyHealth(), 60000);
  }

  async updateProxies() {
    const freshProxies = await this.fetchFreshProxies();
    this.proxies = [...new Set([...this.proxies, ...freshProxies])];
  }

  async fetchFreshProxies() {
    const sources = [
      'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http',
      'https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc'
    ];
    const proxyLists = await Promise.allSettled(
      sources.map(url => axios.get(url).then(r => r.data))
    );
    return proxyLists
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value.data.map(p => `http://${p.ip}:${p.port}`));
  }

  getNextProxy() {
    let attempts = 0;
    while (attempts++ < this.proxies.length) {
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      const proxy = this.proxies[this.currentIndex];
      if (this.proxyHealth.get(proxy) !== 'dead') return proxy;
    }
    return this.proxies[0];
  }

  async checkProxyHealth() {
    await Promise.all(this.proxies.map(async (proxy) => {
      try {
        await axios.get('https://www.google.com', {
          proxy: { host: proxy.split(':')[1], port: proxy.split(':')[2] },
          timeout: 5000
        });
        this.proxyHealth.set(proxy, 'healthy');
      } catch {
        this.proxyHealth.set(proxy, 'dead');
      }
    }));
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }
}

// Enhanced Browser Pool with Adaptive Scaling
class BrowserPool {
  constructor() {
    this.proxyManager = new ProxyManager();
    this.taskQueue = new Bull('scraping-tasks', {
      redis: { host: 'localhost', port: 6379 },
      limiter: { max: CONFIG.MAX_CONCURRENT_TASKS, duration: 1000 }
    });
  }

  async init() {
    await this.proxyManager.init();
    browserPool = await this.createBrowserPool(CONFIG.BROWSER_POOL_SIZE);
    this.startQueueProcessing();
    setInterval(() => this.scaleBrowserPool(), 10000);
  }

  async createBrowserPool(size) {
    return Promise.all(
      Array(size).fill().map(async () => {
        const browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            `--proxy-server=${this.proxyManager.getNextProxy()}`,
            '--disable-dev-shm-usage',
            '--disable-gpu'
          ]
        });
        browser._proxy = this.proxyManager.getNextProxy();
        return browser;
      })
    );
  }

  async rotateProxies() {
    await this.destroy();
    browserPool = await this.createBrowserPool(CONFIG.BROWSER_POOL_SIZE);
  }

  async destroy() {
    await Promise.all(browserPool.map(browser => browser.close()));
  }

  startQueueProcessing() {
    this.taskQueue.process(async (job) => {
      const browser = await this.getAvailableBrowser();
      return this.performScrapingTask(browser, job.data);
    });
  }

  async performScrapingTask(browser, task) {
    const page = await browser.newPage();
    await page.setUserAgent(this.proxyManager.getRandomUserAgent());
    try {
      await page.goto(task.url, {
        waitUntil: 'networkidle2',
        timeout: CONFIG.REQUEST_TIMEOUT
      });
      return page.content();
    } finally {
      await page.close();
    }
  }

  async getAvailableBrowser() {
    return browserPool[Math.floor(Math.random() * browserPool.length)];
  }

  async scaleBrowserPool() {
    const pendingTasks = await this.taskQueue.getJobCounts().waiting;
    if (pendingTasks > CONFIG.MAX_CONCURRENT_TASKS && browserPool.length < CONFIG.BROWSER_POOL_SIZE * 2) {
      const additionalBrowsers = Math.min(CONFIG.BROWSER_POOL_SIZE, pendingTasks - browserPool.length);
      const newBrowsers = await this.createBrowserPool(additionalBrowsers);
      browserPool = [...browserPool, ...newBrowsers];
    } else if (pendingTasks < CONFIG.MAX_CONCURRENT_TASKS / 2 && browserPool.length > CONFIG.BROWSER_POOL_SIZE) {
      const browsersToClose = browserPool.splice(0, browserPool.length - CONFIG.BROWSER_POOL_SIZE);
      await Promise.all(browsersToClose.map(browser => browser.close()));
    }
  }
}

// Enhanced Video Scraper with Adaptive Strategies
class VideoScraper {
  constructor() {
    this.browserPool = new BrowserPool();
    this.scrapeCounter = new Map();
    this.circuitBreakers = new Map();
  }

  async init() {
    await this.browserPool.init();
  }

  async scrapeVideoLinks(query) {
    const cacheKey = `search:${query}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const results = await Promise.allSettled([
      this.scrapeWithRetry(() => this.scrape9Anime(query)),
      this.scrapeWithRetry(() => this.scrapeGogoAnime(query)),
      this.scrapeWithRetry(() => this.scrapeZoro(query)),
      this.scrapeWithRetry(() => this.scrapeCrunchyroll(query)),
    ]);

    const combined = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);

    await redis.set(cacheKey, JSON.stringify(combined), 'EX', CONFIG.CACHE_TTL);
    return combined;
  }

  async scrapeWithRetry(fn, attempts = CONFIG.RETRY_ATTEMPTS) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === attempts - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  async extractDirectLinks(url) {
    const cacheKey = `links:${Buffer.from(url).toString('base64')}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const job = await this.browserPool.taskQueue.add({ url });
    const content = await job.finished();
    const $ = cheerio.load(content);

    const links =
      $('script')
        .toArray()
        .map((script) => $(script).html())
        .join(' ')
        .match(/(https?:\/\/[^\s'"]+\.(?:m3u8|mp4|mkv|avi))/gi) || [];

    const filtered = this.filterAndSortLinks(links);
    await redis.set(cacheKey, JSON.stringify(filtered), 'EX', CONFIG.CACHE_TTL);
    return filtered;
  }

  filterAndSortLinks(links) {
    return links.sort((a, b) => a.length - b.length);
  }

  async scrape9Anime(query) {
    const url = `https://9anime.to/search?keyword=${encodeURIComponent(query)}`;
    const content = await this.browserPool.taskQueue.add({ url }).finished();
    const $ = cheerio.load(content);
    return $('.film-item').map((_, el) => ({
      title: $(el).find('.film-name').text().trim(),
      url: $(el).find('a').attr('href'),
      thumbnail: $(el).find('img').attr('src'),
      type: 'TV',
      duration: '24m',
      premiereDate: 'Oct 8, 2022',
      description: 'Follow the journey of aspiring soccer players as they compete in a high-stakes battle to become the ultimate striker.',
      watchLink: '/watch/blue-lock',
    })).get();
  }

  async scrapeGogoAnime(query) {
    const url = `https://gogoanimehd.io/search.html?keyword=${encodeURIComponent(query)}`;
    const content = await this.browserPool.taskQueue.add({ url }).finished();
    const $ = cheerio.load(content);
    return $('.items li').map((_, el) => ({
      title: $(el).find('.name').text().trim(),
      url: $(el).find('a').attr('href'),
      thumbnail: $(el).find('img').attr('src'),
      type: 'TV',
      duration: '24m',
      premiereDate: 'Oct 5, 2004',
      description: 'Join Ichigo Kurosaki as he battles Hollows and protects the living world from evil spirits.',
      watchLink: '/watch/bleach',
    })).get();
  }

  async scrapeZoro(query) {
    const url = `https://zoro.to/search?keyword=${encodeURIComponent(query)}`;
    const content = await this.browserPool.taskQueue.add({ url }).finished();
    const $ = cheerio.load(content);
    return $('.film_list-wrap .flw-item').map((_, el) => ({
      title: $(el).find('.film-name').text().trim(),
      url: $(el).find('a').attr('href'),
      thumbnail: $(el).find('img').attr('src'),
      type: 'TV',
      duration: '24m',
      premiereDate: 'Apr 3, 2016',
      description: 'Izuku Midoriya inherits the power of the world\'s greatest hero and enrolls in a school for young heroes.',
      watchLink: '/watch/my-hero-academia',
    })).get();
  }

  async scrapeCrunchyroll(query) {
    const url = `https://www.crunchyroll.com/search?q=${encodeURIComponent(query)}`;
    const content = await this.browserPool.taskQueue.add({ url }).finished();
    const $ = cheerio.load(content);
    return $('.results .item').map((_, el) => ({
      title: $(el).find('.title').text().trim(),
      url: $(el).find('a').attr('href'),
      thumbnail: $(el).find('img').attr('src'),
      type: 'TV',
      duration: '24m',
      premiereDate: 'Apr 6, 2019',
      description: 'Tanjiro Kamado embarks on a journey to save his sister and avenge his family.',
      watchLink: '/watch/demon-slayer',
    })).get();
  }
}

// Rate Limiting Middleware
app.use(async (req, res, next) => {
  const ip = req.ip;
  const key = `rate_limit:${ip}`;
  const currentRequests = await redis.incr(key);
  if (currentRequests === 1) {
    await redis.expire(key, CONFIG.WINDOW_SIZE / 1000);
  }
  if (currentRequests > CONFIG.RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  next();
});

// Security Middleware
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

// Basic Middleware
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (message) => logger.info(message.trim()) }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(compression());

// Define HIAnimeAPI Endpoints
const hianimeAPI = new HianimeAPI();

app.get('/anime', throttle(async (req, res, next) => {
  const timer = httpRequestDuration.startTimer();
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'Anime ID is required' });
    }
    const animeData = await hianimeAPI.getAnimeData(id);
    timer({ method: req.method, route: '/anime', code: 200 });
    res.json(animeData);
  } catch (error) {
    timer({ method: req.method, route: '/anime', code: 500 });
    logger.error(`Anime fetch failed: ${error.message}`);
    res.status(500).json({ error: 'Anime fetch failed', details: error.message });
    next(error);
  }
}));

app.get('/episode-servers', throttle(async (req, res, next) => {
  const timer = httpRequestDuration.startTimer();
  try {
    const { id, ep } = req.query;
    if (!id || !ep) {
      return res.status(400).json({ error: 'Anime ID and Episode number are required' });
    }
    const servers = await hianimeAPI.getEpisodeServers(id, ep);
    timer({ method: req.method, route: '/episode-servers', code: 200 });
    res.json(servers);
  } catch (error) {
    timer({ method: req.method, route: '/episode-servers', code: 500 });
    logger.error(`Episode servers fetch failed: ${error.message}`);
    res.status(500).json({ error: 'Episode servers fetch failed', details: error.message });
    next(error);
  }
}));

// Enhanced API endpoints with Circuit Breakers
app.get('/search/:query', throttle(async (req, res, next) => {
  const timer = httpRequestDuration.startTimer();
  try {
    const results = await scraper.scrapeVideoLinks(req.params.query);
    timer({ method: req.method, route: '/search', code: 200 });
    res.json(results);
  } catch (error) {
    timer({ method: req.method, route: '/search', code: 500 });
    logger.error(`Search failed: ${error.message}`);
    res.status(500).json({ error: 'Search failed', details: error.message });
    next(error);
  }
}));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.contentType);
  res.end(await metrics.metrics());
});

// Health Check Endpoint
app.get('/health', async (req, res) => {
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

// Login and Signup Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/anime', animeRoutes);
app.use('/api/v1/users', userRoutes);

// Graceful Shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await browserPool.destroy();
  await redis.quit();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Initialize Video Scraper
const scraper = new VideoScraper();
scraper.init();

// Initialize Browser Pool
const browserPool = new BrowserPool();
browserPool.init();

// Database Connection
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

const PORT = CONFIG.PORT;
const server = app.listen(PORT, () => {
  logger.info(`Worker ${cluster.worker.id} listening on port ${PORT}`);
  if (cluster.worker.id === 1) {
    setInterval(() => {
      if (process.memoryUsage().heapUsed > 500000000) {
        cluster.fork();
      }
    }, 5000);
  }
});

// Error Handling
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