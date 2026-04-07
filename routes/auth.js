const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('crypto');
const { readDB, writeDB } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Helper: generate a simple UUID ──────────────────────────
function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Validation helpers ───────────────────────────────────────
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/register
// Body: { name, email, password }
// ══════════════════════════════════════════════════════════════
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    }

    const db = readDB();

    // Check for duplicate email
    const exists = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = {
      id: newId(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: 'student', // roles: student | moderator | admin
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    writeDB(db);

    // Issue token immediately (log them in after register)
    const token = signToken({ id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role });

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
    });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/login
// Body: { email, password }
// ══════════════════════════════════════════════════════════════
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = readDB();
    const user = db.users.find(u => u.email === email.toLowerCase().trim());

    // Use constant-time comparison (bcrypt) even if user not found to prevent timing attacks
    const dummyHash = '$2a$12$invalidhashforsecuritypurposesonly.........';
    const match = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });

    res.json({
      message: 'Login successful!',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/auth/me  — get current user profile
// ══════════════════════════════════════════════════════════════
router.get('/me', requireAuth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // Return profile without passwordHash
  const { passwordHash, ...profile } = user;
  res.json({ user: profile });
});

// ══════════════════════════════════════════════════════════════
// PUT /api/auth/me  — update name/email
// ══════════════════════════════════════════════════════════════
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const db = readDB();
    const idx = db.users.findIndex(u => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found.' });

    const user = db.users[idx];

    // Update name
    if (name && name.trim().length >= 2) user.name = name.trim();

    // Update email
    if (email && isValidEmail(email)) {
      const taken = db.users.find(u => u.email === email.toLowerCase() && u.id !== user.id);
      if (taken) return res.status(409).json({ error: 'Email already in use.' });
      user.email = email.toLowerCase();
    }

    // Change password (requires currentPassword)
    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required to change password.' });
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
      if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
      user.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    db.users[idx] = user;
    writeDB(db);

    const { passwordHash, ...profile } = user;
    res.json({ message: 'Profile updated.', user: profile });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
