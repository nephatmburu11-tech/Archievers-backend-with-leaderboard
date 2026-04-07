// db.js — Supabase client
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // service role key
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
