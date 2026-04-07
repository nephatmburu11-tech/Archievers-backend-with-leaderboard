// routes/leaderboard.js — Supabase version
const express = require('express');
const supabase = require('../db'); // Supabase client
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// GET /api/leaderboard
// Returns top contributors ranked by total downloads, uploads,
// and a combined score.
// Query params:
//   sort   — "score" (default) | "downloads" | "uploads"
//   period — "all" (default)   | "month" | "week"
//   limit  — number of entries to return (default 10, max 50)
// ──────────────────────────────────────────────────────────────
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { sort = 'score', period = 'all', limit = 10 } = req.query;
    const pageSize = Math.min(50, Math.max(1, parseInt(limit) || 10));

    // Calculate date filter if period is week/month
    let since = null;
    if (period === 'week') since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    if (period === 'month') since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch users
    const { data: users, error: usersError } = await supabase.from('users').select('*');
    if (usersError) throw usersError;

    // Fetch notes (with optional period filter)
    let query = supabase.from('notes').select('*').eq('status', 'published');
    if (since) query = query.gte('created_at', since);
    const { data: notes, error: notesError } = await query;
    if (notesError) throw notesError;

    // Aggregate stats
    const statsMap = {};
    users.forEach(u => {
      statsMap[u.id] = { userId: u.id, name: u.name, uploads: 0, totalDownloads: 0, score: 0 };
    });

    notes.forEach(n => {
      if (!statsMap[n.uploader_id]) {
        statsMap[n.uploader_id] = { userId: n.uploader_id, name: n.uploader_name, uploads: 0, totalDownloads: 0, score: 0 };
      }
      statsMap[n.uploader_id].uploads += 1;
      statsMap[n.uploader_id].totalDownloads += n.downloads || 0;
    });

    const DOWNLOAD_WEIGHT = 1;
    const UPLOAD_WEIGHT = 5;

    const ranked = Object.values(statsMap)
      .map(e => ({ ...e, score: e.totalDownloads * DOWNLOAD_WEIGHT + e.uploads * UPLOAD_WEIGHT }))
      .filter(e => e.uploads > 0 || e.totalDownloads > 0);

    // Sort
    const VALID_SORTS = ['score', 'downloads', 'uploads'];
    const sortKey = VALID_SORTS.includes(sort) ? sort : 'score';
    const sortField = { score: 'score', downloads: 'totalDownloads', uploads: 'uploads' }[sortKey];
    ranked.sort((a, b) => b[sortField] - a[sortField]);

    // Assign ranks
    let currentRank = 1;
    const withRanks = ranked.map((entry, idx) => {
      if (idx > 0 && entry[sortField] < ranked[idx - 1][sortField]) currentRank = idx + 1;
      return { rank: currentRank, ...entry };
    });

    const top = withRanks.slice(0, pageSize);
    let myEntry = null;
    if (req.user) myEntry = withRanks.find(e => e.userId === req.user.id) || null;

    res.json({ period, sort: sortKey, total: withRanks.length, leaderboard: top, ...(myEntry ? { myRank: myEntry } : {}) });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/leaderboard/user/:userId
// Public profile of a single user's contribution stats
// ──────────────────────────────────────────────────────────────
router.get('/user/:userId', async (req, res, next) => {
  try {
    const userId = req.params.userId;

    // Fetch user
    const { data: users, error: userError } = await supabase.from('users').select('*').eq('id', userId).single();
    if (userError || !users) return res.status(404).json({ error: 'User not found.' });

    // Fetch their notes
    const { data: userNotes, error: notesError } = await supabase
      .from('notes')
      .select('*')
      .eq('uploader_id', userId)
      .eq('status', 'published');
    if (notesError) throw notesError;

    const totalDownloads = userNotes.reduce((sum, n) => sum + (n.downloads || 0), 0);
    const uploads = userNotes.length;
    const score = totalDownloads * 1 + uploads * 5;

    // Calculate rank
    const { data: allNotes } = await supabase.from('notes').select('*').eq('status', 'published');
    const scoresMap = {};
    allNotes.forEach(n => {
      scoresMap[n.uploader_id] = scoresMap[n.uploader_id] || { uploads: 0, downloads: 0 };
      scoresMap[n.uploader_id].uploads += 1;
      scoresMap[n.uploader_id].downloads += n.downloads || 0;
    });
    const allScores = Object.values(scoresMap).map(s => s.downloads * 1 + s.uploads * 5);
    const rank = allScores.filter(s => s > score).length + 1;

    // Top 3 notes
    const topNotes = [...userNotes]
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 3)
      .map(n => ({ id: n.id, title: n.title, subject: n.subject, downloads: n.downloads, createdAt: n.created_at }));

    res.json({
      user: { id: users.id, name: users.name, joinedAt: users.created_at },
      stats: { uploads, totalDownloads, score, rank },
      topNotes,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
