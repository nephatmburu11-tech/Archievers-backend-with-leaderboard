const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const { readDB, writeDB } = require('../db');

const router = express.Router();

// ── Allowed file types ────────────────────────────────────────
const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/gif',
  'text/plain',
];

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.gif', '.txt'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// ── Multer storage config ─────────────────────────────────────
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME.includes(file.mimetype) && ALLOWED_EXT.includes(ext)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `File type not allowed. Accepted: ${ALLOWED_EXT.join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ── Helper: generate a simple ID ─────────────────────────────
function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ══════════════════════════════════════════════════════════════
// POST /api/upload
// Upload a study note/resource (requires login)
// Form fields: title, subject, description
// File field:  file
// ══════════════════════════════════════════════════════════════
router.post('/', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
          ? `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`
          : err.message;
        return res.status(400).json({ error: msg });
      }
      return res.status(400).json({ error: err.message });
    }

    try {
      const { title, subject, description } = req.body;

      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
      if (!title || title.trim().length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
      if (!subject) return res.status(400).json({ error: 'Subject is required.' });

      const VALID_SUBJECTS = ['cs', 'math', 'business', 'engineering', 'science', 'other'];
      if (!VALID_SUBJECTS.includes(subject.toLowerCase())) {
        return res.status(400).json({ error: `Subject must be one of: ${VALID_SUBJECTS.join(', ')}` });
      }

      const db = readDB();

      const note = {
        id: newId(),
        title: title.trim(),
        subject: subject.toLowerCase(),
        description: (description || '').trim().slice(0, 500),
        filename: req.file.filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploaderId: req.user.id,
        uploaderName: req.user.name,
        downloads: 0,
        createdAt: new Date().toISOString(),
        status: 'published', // could be 'pending' for moderation
      };

      db.notes.push(note);
      writeDB(db);

      res.status(201).json({
        message: 'File uploaded successfully!',
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
});

// ══════════════════════════════════════════════════════════════
// GET /api/upload/download/:id
// Download a file (public, but tracks download count)
// ══════════════════════════════════════════════════════════════
router.get('/download/:id', (req, res, next) => {
  try {
    const db = readDB();
    const note = db.notes.find(n => n.id === req.params.id);

    if (!note) return res.status(404).json({ error: 'File not found.' });
    if (note.status !== 'published') return res.status(403).json({ error: 'This file is not available.' });

    const filePath = path.join(__dirname, '..', 'uploads', note.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server.' });

    // Increment download counter
    const idx = db.notes.findIndex(n => n.id === note.id);
    db.notes[idx].downloads += 1;
    writeDB(db);

    res.download(filePath, note.originalName);
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE /api/upload/:id
// Delete a file (uploader or admin only)
// ══════════════════════════════════════════════════════════════
router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const db = readDB();
    const idx = db.notes.findIndex(n => n.id === req.params.id);

    if (idx === -1) return res.status(404).json({ error: 'File not found.' });

    const note = db.notes[idx];
    const isOwner = note.uploaderId === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own uploads.' });
    }

    // Remove physical file
    const filePath = path.join(__dirname, '..', 'uploads', note.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.notes.splice(idx, 1);
    writeDB(db);

    res.json({ message: 'File deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
