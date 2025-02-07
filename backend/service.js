import axios from 'axios';
import Bottleneck from 'bottleneck';
import config from '../config/config';
import { createLogger, transports, format } from 'winston';
import NodeCache from 'node-cache';

// Configure logging
const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'jikan-service.log' })
    ]
});

// Configure caching
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

/**
 * Custom error class for Jikan API errors.
 */
class JikanApiError extends Error {
    constructor(message, statusCode, endpoint) {
        super(message);
        this.name = 'JikanApiError';
        this.statusCode = statusCode;
        this.endpoint = endpoint;
    }
}

class JikanService {
    constructor() {
        this.baseUrl = config.jikanBaseUrl;
        this.limiter = new Bottleneck({
            minTime: config.rateLimitMinTime || 334, // ~3 requests per second by default
            maxConcurrent: config.rateLimitMaxConcurrent || 1,
        });
    }

    /**
     * Makes a request to the Jikan API with caching and retry mechanism.
     * @param {string} endpoint - The API endpoint to request.
     * @param {number} retries - The number of retries for failed requests.
     * @returns {Promise<Object>} - The response data.
     * @throws {JikanApiError} - If the request fails after retries.
     */
    async request(endpoint, retries = 3) {
        const cacheKey = `jikan:${endpoint}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            logger.info(`Cache hit for endpoint: ${endpoint}`);
            return cachedData;
        }

        try {
            const response = await this.limiter.schedule(() => axios.get(`${this.baseUrl}${endpoint}`));
            cache.set(cacheKey, response.data);
            logger.info(`Successfully fetched data from endpoint: ${endpoint}`);
            return response.data;
        } catch (error) {
            if (retries > 0) {
                logger.warn(`Retrying request to endpoint: ${endpoint}. Retries left: ${retries}`);
                return this.request(endpoint, retries - 1);
            } else {
                logger.error(`Failed to fetch data from endpoint: ${endpoint}`, error);
                throw new JikanApiError(error.message, error.response?.status, endpoint);
            }
        }
    }

    /**
     * Fetches anime details by ID.
     * @param {number} id - The anime ID.
     * @returns {Promise<Object>} - The anime details.
     */
    async getAnimeById(id) {
        if (!id || typeof id !== 'number') {
            throw new Error('Invalid anime ID');
        }
        return this.request(`/anime/${id}`);
    }

    /**
     * Fetches anime characters by ID.
     * @param {number} id - The anime ID.
     * @returns {Promise<Object>} - The anime characters.
     */
    async getAnimeCharacters(id) {
        if (!id || typeof id !== 'number') {
            throw new Error('Invalid anime ID');
        }
        return this.request(`/anime/${id}/characters`);
    }

    /**
     * Fetches anime staff by ID.
     * @param {number} id - The anime ID.
     * @returns {Promise<Object>} - The anime staff.
     */
    async getAnimeStaff(id) {
        if (!id || typeof id !== 'number') {
            throw new Error('Invalid anime ID');
        }
        return this.request(`/anime/${id}/staff`);
    }

    /**
     * Fetches anime episodes by ID.
     * @param {number} id - The anime ID.
     * @param {number} page - The page number.
     * @returns {Promise<Object>} - The anime episodes.
     */
    async getAnimeEpisodes(id, page = 1) {
        if (!id || typeof id !== 'number') {
            throw new Error('Invalid anime ID');
        }
        return this.request(`/anime/${id}/episodes?page=${page}`);
    }

    /**
     * Fetches anime news by ID.
     * @param {number} id - The anime ID.
     * @param {number} page - The page number.
     * @returns {Promise<Object>} - The anime news.
     */
    async getAnimeNews(id, page = 1) {
        if (!id || typeof id !== 'number') {
            throw new Error('Invalid anime ID');
        }
        return this.request(`/anime/${id}/news?page=${page}`);
    }

    /**
     * Fetches anime videos by ID.
     * @param {number} id - The anime ID.
     * @returns {Promise<Object>} - The anime videos.
     */
    async getAnimeVideos(id) {
        if (!id || typeof id !== 'number') {
            throw new Error('Invalid anime ID');
        }
        return this.request(`/anime/${id}/videos`);
    }

    /**
     * Fetches anime statistics by ID.
     * @param {number} id - The anime ID.
     * @returns {Promise<Object>} - The anime statistics.
     */
    async getAnimeStatistics(id) {
        if (!id || typeof id !== 'number') {
            throw new Error('Invalid anime ID');
        }
        return this.request(`/anime/${id}/statistics`);
    }

    /**
     * Fetches anime recommendations by ID.
     * @param {number} id - The anime ID.
     * @returns {Promise<Object>} - The anime recommendations.
     */
    async getAnimeRecommendations(id) {
        if (!id || typeof id !== 'number') {
            throw new Error('Invalid anime ID');
        }
        return this.request(`/anime/${id}/recommendations`);
    }

    /**
     * Fetches anime reviews by ID.
     * @param {number} id - The anime ID.
     * @param {number} page - The page number.
     * @param {boolean} preliminary - Include preliminary reviews.
     * @param {boolean} spoilers - Include spoilers.
     * @returns {Promise<Object>} - The anime reviews.
     */
    async getAnimeReviews(id, page = 1, preliminary = true, spoilers = true) {
        if (!id || typeof id !== 'number') {
            throw new Error('Invalid anime ID');
        }
        return this.request(`/anime/${id}/reviews?page=${page}&preliminary=${preliminary}&spoilers=${spoilers}`);
    }
}

export default new JikanService();