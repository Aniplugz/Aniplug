const express = require('express');
const router = express.Router();
const Anime = require('../models/anime');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const fs = require('fs').promises; // Use promises API for async operations
const path = require('path');

// Configure Multer with absolute paths and auto-create directory
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    fs.mkdir(uploadPath, { recursive: true }).then(() => {
      cb(null, uploadPath);
    }).catch(err => cb(err));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage });

// Validation middleware
const validateAnimeCreation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('genre').trim().notEmpty().withMessage('Genre is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('episodes').isInt({ min: 1 }).withMessage('Episodes must be a positive integer'),
  body('releaseDate').isISO8601().toDate().withMessage('Valid ISO8601 date required'),
];

const validateAnimeUpdate = [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
  body('genre').optional().trim().notEmpty().withMessage('Genre cannot be empty'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('episodes').optional().isInt({ min: 1 }).withMessage('Episodes must be a positive integer'),
  body('releaseDate').optional().isISO8601().toDate().withMessage('Valid ISO8601 date required'),
];

// GET all anime with improved validation
router.get('/', async (req, res) => {
  try {
    // Parse and validate pagination parameters
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const genre = req.query.genre;
    const sortBy = ['title', 'genre', 'releaseDate', 'episodes'].includes(req.query.sortBy) 
      ? req.query.sortBy 
      : 'releaseDate';
    const order = req.query.order === 'asc' ? 1 : -1;

    const query = genre ? { genre } : {};
    
    const [animes, count] = await Promise.all([
      Anime.find(query)
        .sort({ [sortBy]: order })
        .limit(limit)
        .skip((page - 1) * limit),
      Anime.countDocuments(query)
    ]);

    res.json({
      animes,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving anime data: ' + err.message });
  }
});

// GET single anime remains the same
router.get('/:id', async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) return res.status(404).json({ error: 'Anime not found' });
    res.json(anime);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving anime: ' + err.message });
  }
});

// POST with image validation
router.post('/', upload.single('imageUrl'), validateAnimeCreation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  if (!req.file) return res.status(400).json({ error: 'Image is required' });

  try {
    const newAnime = new Anime({
      ...req.body,
      imageUrl: `/uploads/${req.file.filename}`, // Store URL path instead of filesystem path
      releaseDate: new Date(req.body.releaseDate)
    });
    await newAnime.save();
    res.status(201).json(newAnime);
  } catch (err) {
    // Clean up uploaded file if save fails
    await fs.unlink(req.file.path);
    res.status(400).json({ error: 'Error creating anime: ' + err.message });
  }
});

// PUT with proper update handling
router.put('/:id', upload.single('imageUrl'), validateAnimeUpdate, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const existingAnime = await Anime.findById(req.params.id);
    if (!existingAnime) return res.status(404).json({ error: 'Anime not found' });

    const updateData = { ...req.body };
    if (req.file) {
      updateData.imageUrl = `/uploads/${req.file.filename}`;
      // Delete old image if it exists
      if (existingAnime.imageUrl) {
        const oldImagePath = path.join(__dirname, '..', existingAnime.imageUrl);
        await fs.unlink(oldImagePath).catch(() => {});
      }
    }

    const updatedAnime = await Anime.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    res.json(updatedAnime);
  } catch (err) {
    if (req.file) await fs.unlink(req.file.path); // Clean up new image if update fails
    res.status(400).json({ error: 'Error updating anime: ' + err.message });
  }
});

// DELETE with async image removal
router.delete('/:id', async (req, res) => {
  try {
    const deletedAnime = await Anime.findByIdAndDelete(req.params.id);
    if (!deletedAnime) return res.status(404).json({ error: 'Anime not found' });

    if (deletedAnime.imageUrl) {
      const imagePath = path.join(__dirname, '..', deletedAnime.imageUrl);
      await fs.unlink(imagePath).catch(() => {});
    }

    res.json(deletedAnime);
  } catch (err) {
    res.status(500).json({ error: 'Error deleting anime: ' + err.message });
  }
});

module.exports = router;