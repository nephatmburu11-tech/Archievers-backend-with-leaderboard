const express = require('express');
const { readDB, writeDB } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ══════════════════════════════════════════════════════════════
// GET /api/notes
// List notes with optional search + filter
// Query params: q (search), subject, sort (newest|popular), page, limit
// ══════════════════════════════════════════════════════════════
router.get('/', optionalAuth, (req, res, next) => {
  try {
    const { q = '', subject = 'all', sort = 'newest', page = 1, limit = 20 } = req.query;
    const db = readDB();

    let notes = db.notes.filter(n => n.status === 'published');

    // Search filter
    if (q.trim()) {
      const query = q.toLowerCase();
      notes = notes.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.description.toLowerCase().includes(query) ||
        n.uploaderName.toLowerCase().includes(query)
      );
    }

    // Subject filter
    if (subject !== 'all') {
      notes = notes.filter(n => n.subject === subject.toLowerCase());
    }

    // Sort
    if (sort === 'popular') {
      notes.sort((a, b) => b.downloads - a.downloads);
    } else {
      notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const total = notes.length;
    const paginated = notes.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    res.json({
      notes: paginated.map(n => ({
        id: n.id,
        title: n.title,
        subject: n.subject,
        description: n.description,
        originalName: n.originalName,
        fileSize: n.fileSize,
        uploaderName: n.uploaderName,
        downloads: n.downloads,
        createdAt: n.createdAt,
        downloadUrl: `/api/upload/download/${n.id}`,
        // Only show uploader ID if logged in
        ...(req.user ? { uploaderId: n.uploaderId } : {}),
      })),
      pagination: {
        total,
        page: pageNum,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/notes/mine
// Get the logged-in user's uploads
// ══════════════════════════════════════════════════════════════
router.get('/mine', requireAuth, (req, res, next) => {
  try {
    const db = readDB();
    const notes = db.notes
      .filter(n => n.uploaderId === req.user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(n => ({
        id: n.id,
        title: n.title,
        subject: n.subject,
        description: n.description,
        originalName: n.originalName,
        fileSize: n.fileSize,
        downloads: n.downloads,
        createdAt: n.createdAt,
        status: n.status,
        downloadUrl: `/api/upload/download/${n.id}`,
      }));

    res.json({ notes });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/notes/:id — single note detail
// ══════════════════════════════════════════════════════════════
router.get('/:id', optionalAuth, (req, res, next) => {
  try {
    const db = readDB();
    const note = db.notes.find(n => n.id === req.params.id && n.status === 'published');
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    res.json({
      note: {
        id: note.id,
        title: note.title,
        subject: note.subject,
        description: note.description,
        originalName: note.originalName,
        fileSize: note.fileSize,
        uploaderName: note.uploaderName,
        downloads: note.downloads,
        createdAt: note.createdAt,
        downloadUrl: `/api/upload/download/${note.id}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
