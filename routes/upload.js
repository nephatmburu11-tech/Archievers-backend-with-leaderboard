const express = require('express');
const multer = require('multer');
const supabase = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Multer in memory
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/upload
router.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const { title, subject, description } = req.body;
    const fileExt = req.file.originalname.split('.').pop();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (error) throw error;

    // Save metadata in Supabase table `notes`
    const { data: noteData, error: noteError } = await supabase
      .from('notes')
      .insert([{
        title,
        subject,
        description,
        filename,
        original_name: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        uploader_id: req.user.id,
        uploader_name: req.user.name,
        downloads: 0,
        status: 'published',
      }])
      .select()
      .single();

    if (noteError) throw noteError;

    res.status(201).json({ message: 'File uploaded!', note: noteData });
  } catch (err) {
    next(err);
  }
});

// GET /api/upload/download/:filename
router.get('/download/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;

    // Get public URL (or signed URL if private)
    const { data: urlData, error } = supabase.storage
      .from('uploads')
      .getPublicUrl(filename);

    if (error) throw error;

    res.redirect(urlData.publicUrl);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
