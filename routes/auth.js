// routes/auth.js — Supabase version
const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../db'); // Supabase client
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

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
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email, and password are required.' });

    if (!isValidEmail(email))
      return res.status(400).json({ error: 'Invalid email address.' });

    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    if (name.trim().length < 2)
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });

    // Check for existing user
    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase());

    if (fetchError) throw fetchError;
    if (existing.length > 0)
      return res.status(409).json({ error: 'An account with that email already exists.' });

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert new user
    const { data, error } = await supabase.from('users').insert([{
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      role: 'student', // roles: student | moderator | admin
    }]).select().single();

    if (error) throw error;

    const token = signToken({
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role
    });

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: { id: data.id, name: data.name, email: data.email, role: data.role }
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
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    // Fetch user by email
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .limit(1);

    if (error) throw error;
    if (!users || users.length === 0)
      return res.status(401).json({ error: 'Invalid email or password.' });

    const user = users[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    });

    res.json({
      message: 'Login successful!',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });

  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/auth/me — get current user profile
// ══════════════════════════════════════════════════════════════
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) return res.status(404).json({ error: 'User not found.' });

    const { password_hash, ...profile } = data;
    res.json({ user: profile });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// PUT /api/auth/me — update name/email/password
// ══════════════════════════════════════════════════════════════
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;

    // Fetch user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) return res.status(404).json({ error: 'User not found.' });

    const updates = {};

    if (name && name.trim().length >= 2) updates.name = name.trim();

    if (email && isValidEmail(email)) {
      // Check if email is taken
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase())
        .neq('id', user.id)
        .limit(1);

      if (existing.length > 0) return res.status(409).json({ error: 'Email already in use.' });
      updates.email = email.toLowerCase();
    }

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required.' });
      const match = await bcrypt.compare(currentPassword, user.password_hash);
      if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });
      if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
      updates.password_hash = await bcrypt.hash(newPassword, 12);
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    const { password_hash, ...profile } = updatedUser;
    res.json({ message: 'Profile updated.', user: profile });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
