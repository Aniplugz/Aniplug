import express from 'express';
import {
  searchAnime,
  getAnimeDetails,
  getEpisodeSources
} from '../services/animeService.js';

const router = express.Router();

// Search endpoint
router.get('/search', async (req, res) => {
  try {
    const results = await searchAnime(req.query.q);
    res.json({
      status: 'success',
      data: results
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Search failed'
    });
  }
});

// Anime details endpoint
router.get('/info/:id', async (req, res) => {
  try {
    const details = await getAnimeDetails(req.params.id);
    res.json({
      status: 'success',
      data: details
    });
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: 'Anime not found'
    });
  }
});

// Video sources endpoint
router.get('/watch/:episodeId', async (req, res) => {
  try {
    const sources = await getEpisodeSources(req.params.episodeId);
    res.json({
      status: 'success',
      data: sources
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to load sources'
    });
  }
});

export default router;