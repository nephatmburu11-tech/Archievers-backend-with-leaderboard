// routes/notes.js — Supabase version
const express = require('express');
const supabase = require('../db'); // Supabase client
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// GET /api/notes
// List notes with optional search + filter
// Query params: q (search), subject, sort (newest|popular), page, limit
// ──────────────────────────────────────────────────────────────
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { q = '', subject = 'all', sort = 'newest', page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));

    // Build Supabase query
    let query = supabase.from('notes').select('*').eq('status', 'published');

    if (subject !== 'all') query = query.eq('subject', subject.toLowerCase());
    const { data: allNotes, error } = await query;
    if (error) throw error;

    // Search filter
    let notes = allNotes;
    if (q.trim()) {
      const search = q.toLowerCase();
      notes = notes.filter(n =>
        n.title.toLowerCase().includes(search) ||
        n.description.toLowerCase().includes(search) ||
        n.uploader_name.toLowerCase().includes(search)
      );
    }

    // Sort
    if (sort === 'popular') {
      notes.sort((a, b) => b.downloads - a.downloads);
    } else {
      notes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    const total = notes.length;
    const paginated = notes.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    res.json({
      notes: paginated.map(n => ({
        id: n.id,
        title: n.title,
        subject: n.subject,
        description: n.description,
        originalName: n.original_name,
        fileSize: n.file_size,
        uploaderName: n.uploader_name,
        downloads: n.downloads,
        createdAt: n.created_at,
        downloadUrl: `/api/upload/download/${n.id}`,
        ...(req.user ? { uploaderId: n.uploader_id } : {}),
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

// ──────────────────────────────────────────────────────────────
// GET /api/notes/mine — logged-in user's uploads
// ──────────────────────────────────────────────────────────────
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const { data: notes, error } = await supabase
      .from('notes')
      .select('*')
      .eq('uploader_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      notes: notes.map(n => ({
        id: n.id,
        title: n.title,
        subject: n.subject,
        description: n.description,
        originalName: n.original_name,
        fileSize: n.file_size,
        downloads: n.downloads,
        createdAt: n.created_at,
        status: n.status,
        downloadUrl: `/api/upload/download/${n.id}`,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/notes/:id — single note detail
// ──────────────────────────────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { data: note, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', req.params.id)
      .eq('status', 'published')
      .single();

    if (error || !note) return res.status(404).json({ error: 'Note not found.' });

    res.json({
      note: {
        id: note.id,
        title: note.title,
        subject: note.subject,
        description: note.description,
        originalName: note.original_name,
        fileSize: note.file_size,
        uploaderName: note.uploader_name,
        downloads: note.downloads,
        createdAt: note.created_at,
        downloadUrl: `/api/upload/download/${note.id}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
