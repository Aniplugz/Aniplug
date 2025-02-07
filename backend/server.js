const express = require('express');
const Anime = require('../models/Anime');
const router = express.Router();
const { createLogger, transports, format } = require('winston');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');

// Configure logging
const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'server.log' })
    ]
});

// Configure caching
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Configure rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
});

// Configure Swagger
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Anime API',
            version: '1.0.0',
            description: 'API for managing anime data',
        },
        servers: [
            {
                url: 'http://localhost:3000',
            },
        ],
    },
    apis: ['./server.js'], // Path to the API docs
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
router.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Middleware for security and CORS
router.use(helmet());
router.use(cors());
router.use(limiter);

/**
 * @swagger
 * /anime:
 *   get:
 *     summary: Get all anime with pagination
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: The page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: The number of anime per page
 *     responses:
 *       200:
 *         description: A list of anime
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 animeList:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Anime'
 *                 currentPage:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 totalAnime:
 *                   type: integer
 *       500:
 *         description: Failed to fetch anime list
 */
router.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1; // Current page (default: 1)
    const limit = parseInt(req.query.limit) || 20; // Number of anime per page (default: 20)
    const cacheKey = `anime:page:${page}:limit:${limit}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
        logger.info(`Cache hit for anime list: page=${page}, limit=${limit}`);
        return res.json(cachedData);
    }

    try {
        const totalAnime = await Anime.countDocuments(); // Total number of anime
        const totalPages = Math.ceil(totalAnime / limit); // Total pages

        const animeList = await Anime.find()
            .skip((page - 1) * limit) // Skip anime from previous pages
            .limit(limit); // Limit the number of anime per page

        const response = {
            animeList,
            currentPage: page,
            totalPages,
            totalAnime,
        };

        cache.set(cacheKey, response);
        logger.info(`Successfully fetched anime list: page=${page}, limit=${limit}`);
        res.json(response);
    } catch (err) {
        logger.error(`Failed to fetch anime list: ${err.message}`);
        res.status(500).json({ message: 'Failed to fetch anime list', error: err.message });
    }
});

/**
 * @swagger
 * /anime/{id}:
 *   get:
 *     summary: Get a single anime by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The anime ID
 *     responses:
 *       200:
 *         description: A single anime
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Anime'
 *       404:
 *         description: Anime not found
 *       500:
 *         description: Failed to fetch anime
 */
router.get('/:id', async (req, res) => {
    const cacheKey = `anime:${req.params.id}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
        logger.info(`Cache hit for anime ID: ${req.params.id}`);
        return res.json(cachedData);
    }

    try {
        const anime = await Anime.findById(req.params.id);
        if (!anime) {
            logger.warn(`Anime not found: ${req.params.id}`);
            return res.status(404).json({ message: 'Anime not found' });
        }

        cache.set(cacheKey, anime);
        logger.info(`Successfully fetched anime ID: ${req.params.id}`);
        res.json(anime);
    } catch (err) {
        logger.error(`Failed to fetch anime ID: ${req.params.id}, error: ${err.message}`);
        res.status(500).json({ message: 'Failed to fetch anime', error: err.message });
    }
});

/**
 * @swagger
 * /anime:
 *   post:
 *     summary: Add new anime
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Anime'
 *     responses:
 *       201:
 *         description: Anime added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Anime'
 *       400:
 *         description: Missing required fields or failed to add anime
 */
router.post('/', async (req, res) => {
    const { title, genre, episodes, description } = req.body;

    // Input validation
    if (!title || !genre || !episodes || !description) {
        logger.warn('Missing required fields in request body');
        return res.status(400).json({ message: 'Missing required fields: title, genre, episodes, description' });
    }

    const anime = new Anime({ title, genre, episodes, description });

    try {
        const newAnime = await anime.save();
        logger.info(`Successfully added new anime: ${newAnime.title}`);
        res.status(201).json(newAnime);
    } catch (err) {
        logger.error(`Failed to add anime: ${err.message}`);
        res.status(400).json({ message: 'Failed to add anime', error: err.message });
    }
});

/**
 * @swagger
 * /anime/{id}:
 *   patch:
 *     summary: Update an anime by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The anime ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Anime'
 *     responses:
 *       200:
 *         description: Anime updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Anime'
 *       404:
 *         description: Anime not found
 *       400:
 *         description: Failed to update anime
 */
router.patch('/:id', async (req, res) => {
    try {
        const anime = await Anime.findById(req.params.id);
        if (!anime) {
            logger.warn(`Anime not found: ${req.params.id}`);
            return res.status(404).json({ message: 'Anime not found' });
        }

        // Update only the fields provided in the request body
        if (req.body.title) anime.title = req.body.title;
        if (req.body.genre) anime.genre = req.body.genre;
        if (req.body.episodes) anime.episodes = req.body.episodes;
        if (req.body.description) anime.description = req.body.description;

        const updatedAnime = await anime.save();
        cache.del(`anime:${req.params.id}`); // Invalidate cache
        logger.info(`Successfully updated anime ID: ${req.params.id}`);
        res.json(updatedAnime);
    } catch (err) {
        logger.error(`Failed to update anime ID: ${req.params.id}, error: ${err.message}`);
        res.status(400).json({ message: 'Failed to update anime', error: err.message });
    }
});

/**
 * @swagger
 * /anime/{id}:
 *   delete:
 *     summary: Delete an anime by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The anime ID
 *     responses:
 *       200:
 *         description: Anime deleted successfully
 *       404:
 *         description: Anime not found
 *       500:
 *         description: Failed to delete anime
 */
router.delete('/:id', async (req, res) => {
    try {
        const anime = await Anime.findById(req.params.id);
        if (!anime) {
            logger.warn(`Anime not found: ${req.params.id}`);
            return res.status(404).json({ message: 'Anime not found' });
        }

        await anime.remove();
        cache.del(`anime:${req.params.id}`); // Invalidate cache
        logger.info(`Successfully deleted anime ID: ${req.params.id}`);
        res.json({ message: 'Anime deleted successfully' });
    } catch (err) {
        logger.error(`Failed to delete anime ID: ${req.params.id}, error: ${err.message}`);
        res.status(500).json({ message: 'Failed to delete anime', error: err.message });
    }
});

module.exports = router;
const express = require('express');
const { auth, requiredScopes } = require('@kinde-oss/kinde-node-express');

const app = express();

// Initialize Kinde
app.use(
  auth({
    clientId: process.env.KINDE_CLIENT_ID,
    clientSecret: process.env.KINDE_CLIENT_SECRET,
    issuerBaseUrl: process.env.KINDE_ISSUER_URL,
    siteUrl: process.env.KINDE_SITE_URL,
    redirectUrl: process.env.KINDE_REDIRECT_URL
  })
);

// Protected route
app.get('/protected', requiredScopes('read:data'), (req, res) => {
  res.send('Protected data');
});