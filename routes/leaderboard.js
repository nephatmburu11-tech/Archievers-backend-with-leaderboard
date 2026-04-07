const express = require('express');
const { readDB } = require('../db');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ══════════════════════════════════════════════════════════════
// GET /api/leaderboard
// Returns top contributors ranked by total downloads, uploads,
// and a combined score.
//
// Query params:
//   sort   — "score" (default) | "downloads" | "uploads"
//   period — "all" (default)   | "month" | "week"
//   limit  — number of entries to return (default 10, max 50)
// ══════════════════════════════════════════════════════════════
router.get('/', optionalAuth, (req, res, next) => {
  try {
    const {
      sort = 'score',
      period = 'all',
      limit = 10,
    } = req.query;

    const pageSize = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const db = readDB();

    // ── Date filter ──────────────────────────────────────────
    let since = null;
    if (period === 'week') {
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Only consider published notes (optionally filtered by period)
    const notes = db.notes.filter(n => {
      if (n.status !== 'published') return false;
      if (since && new Date(n.createdAt) < since) return false;
      return true;
    });

    // ── Aggregate stats per user ─────────────────────────────
    // Map: userId → { name, uploads, totalDownloads }
    const statsMap = {};

    // Pre-seed all registered users so people with 0 uploads still exist
    db.users.forEach(u => {
      statsMap[u.id] = {
        userId: u.id,
        name: u.name,
        uploads: 0,
        totalDownloads: 0,
        score: 0,
      };
    });

    notes.forEach(note => {
      if (!statsMap[note.uploaderId]) {
        // Uploader may have been deleted; still credit them by name
        statsMap[note.uploaderId] = {
          userId: note.uploaderId,
          name: note.uploaderName,
          uploads: 0,
          totalDownloads: 0,
          score: 0,
        };
      }
      statsMap[note.uploaderId].uploads += 1;
      statsMap[note.uploaderId].totalDownloads += note.downloads || 0;
    });

    // ── Score formula ────────────────────────────────────────
    // score = (downloads × 1) + (uploads × 5)
    // Adjust weights here if you want a different ranking feel.
    const DOWNLOAD_WEIGHT = 1;
    const UPLOAD_WEIGHT = 5;

    const ranked = Object.values(statsMap)
      .map(entry => ({
        ...entry,
        score: entry.totalDownloads * DOWNLOAD_WEIGHT + entry.uploads * UPLOAD_WEIGHT,
      }))
      // Only include users who have contributed at least once
      .filter(e => e.uploads > 0 || e.totalDownloads > 0);

    // ── Sort ─────────────────────────────────────────────────
    const VALID_SORTS = ['score', 'downloads', 'uploads'];
    const sortKey = VALID_SORTS.includes(sort) ? sort : 'score';

    const sortField = {
      score: 'score',
      downloads: 'totalDownloads',
      uploads: 'uploads',
    }[sortKey];

    ranked.sort((a, b) => b[sortField] - a[sortField]);

    // ── Assign ranks (ties share a rank) ─────────────────────
    let currentRank = 1;
    const withRanks = ranked.map((entry, idx) => {
      if (idx > 0 && entry[sortField] < ranked[idx - 1][sortField]) {
        currentRank = idx + 1;
      }
      return { rank: currentRank, ...entry };
    });

    // ── Paginate ─────────────────────────────────────────────
    const top = withRanks.slice(0, pageSize);

    // ── Caller's own rank (if logged in) ────────────────────
    let myEntry = null;
    if (req.user) {
      const me = withRanks.find(e => e.userId === req.user.id);
      if (me) {
        myEntry = me;
      }
    }

    res.json({
      period,
      sort: sortKey,
      total: withRanks.length,
      leaderboard: top,
      ...(myEntry ? { myRank: myEntry } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/leaderboard/user/:userId
// Public profile of a single user's contribution stats
// ══════════════════════════════════════════════════════════════
router.get('/user/:userId', (req, res, next) => {
  try {
    const db = readDB();
    const user = db.users.find(u => u.id === req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const userNotes = db.notes.filter(
      n => n.uploaderId === user.id && n.status === 'published'
    );

    const totalDownloads = userNotes.reduce((sum, n) => sum + (n.downloads || 0), 0);
    const uploads = userNotes.length;
    const score = totalDownloads * 1 + uploads * 5;

    // Rank: count how many other users score higher
    const allNotes = db.notes.filter(n => n.status === 'published');
    const scoresMap = {};
    allNotes.forEach(n => {
      scoresMap[n.uploaderId] = (scoresMap[n.uploaderId] || { uploads: 0, downloads: 0 });
      scoresMap[n.uploaderId].uploads += 1;
      scoresMap[n.uploaderId].downloads += n.downloads || 0;
    });
    const allScores = Object.values(scoresMap).map(
      s => s.downloads * 1 + s.uploads * 5
    );
    const rank = allScores.filter(s => s > score).length + 1;

    // Top 3 notes by downloads
    const topNotes = [...userNotes]
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 3)
      .map(n => ({
        id: n.id,
        title: n.title,
        subject: n.subject,
        downloads: n.downloads,
        createdAt: n.createdAt,
      }));

    res.json({
      user: {
        id: user.id,
        name: user.name,
        joinedAt: user.createdAt,
      },
      stats: {
        uploads,
        totalDownloads,
        score,
        rank,
      },
      topNotes,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
