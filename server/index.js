'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();

const { getRedis } = require('./services/redis');
const { fetchIdealTechnique } = require('./services/lightpanda');
const { analyzePerformanceWithClaude } = require('./services/anthropic');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors());

const redis = getRedis();

// Serve static frontend
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));
// Serve uploaded videos
const uploadsDir = path.join(__dirname, 'uploads');
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch {}
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${(file.originalname || 'recording').replace(/[^a-zA-Z0-9_.-]/g, '')}`)
});
const upload = multer({ storage });

// Fetch ideal criteria (cached in Redis)
app.get('/api/criteria', async (req, res) => {
  const skill = (req.query.skill || '').toString().trim().toLowerCase();
  const fresh = (req.query.fresh || '').toString() === '1';
  if (!skill) return res.status(400).json({ error: 'Missing skill' });
  const key = `criteria:${skill}`;
  try {
    if (!fresh) {
      const cached = await redis.get(key);
      if (cached) {
        const obj = safeJson(cached);
        if (obj && obj.criteria) return res.json({ skill, criteria: obj.criteria, summary: obj.summary || '', source: obj.from || 'cache' });
        return res.json({ skill, criteria: obj || [], source: 'cache' });
      }
    }
    const result = await fetchIdealTechnique(skill);
    await redis.set(key, JSON.stringify(result), 'EX', 60 * 60 * 24);
    return res.json({ skill, criteria: result.criteria, summary: result.summary || '', source: result.from || 'lightpanda' });
  } catch (err) {
    console.error('criteria error', err);
    return res.status(500).json({ error: 'Failed to fetch criteria' });
  }
});

// Full coaching pipeline
app.post('/api/coach', async (req, res) => {
  const { skill, transcript, audioUrl } = req.body || {};
  if (!skill || typeof skill !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing skill' });
  }
  const s = skill.trim().toLowerCase();
  const key = `criteria:${s}`;
  try {
    let criteria;
    const cached = await redis.get(key);
    if (cached) {
      const obj = safeJson(cached);
      criteria = obj && obj.criteria ? obj.criteria : Array.isArray(obj) ? obj : [];
    } else {
      const result = await fetchIdealTechnique(s);
      criteria = result.criteria;
      await redis.set(key, JSON.stringify(result), 'EX', 60 * 60 * 24);
    }

    const analysis = await analyzePerformanceWithClaude({ skill: s, criteria, transcript: transcript || '' });

    return res.json({ skill: s, criteria, analysis, audioUrl });
  } catch (err) {
    console.error('coach error', err);
    return res.status(500).json({ error: 'Failed to run coaching analysis' });
  }
});

function safeJson(text) { try { return JSON.parse(text); } catch { return null; } }

// Upload recorded video and return a URL to use in analysis
app.post('/api/upload', upload.any(), async (req, res) => {
  try {
    const file = (req.files || [])[0];
    if (!file) return res.status(400).json({ error: 'No media provided' });
    const url = `/uploads/${file.filename}`;
    return res.json({ url });
  } catch (err) {
    return res.status(500).json({ error: 'Upload failed' });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`AI Skill Coach server running at http://localhost:${port}`);
});