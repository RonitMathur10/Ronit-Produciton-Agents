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
const { transcribeAudio } = require('./services/stt');
const { synthesizeWarmVoice } = require('./services/tts');

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

    let tr = (transcript || '').trim();
    if (!tr && audioUrl) {
      try {
        const p = resolveUploadPath(audioUrl);
        tr = await transcribeAudio(p);
      } catch (e) {
        console.error('transcription error', e.message);
      }
    }
    const analysis = await analyzePerformanceWithClaude({ skill: s, criteria, transcript: tr });

    return res.json({ skill: s, criteria, analysis, audioUrl });
  } catch (err) {
    console.error('coach error', err);
    return res.status(500).json({ error: 'Failed to run coaching analysis' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceId } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Missing text' });
    const url = await synthesizeWarmVoice(text, { voiceId });
    return res.json({ url });
  } catch (err) {
    console.error('tts error', err.message);
    return res.status(500).json({ error: 'TTS failed' });
  }
});

function safeJson(text) { try { return JSON.parse(text); } catch { return null; } }

function resolveUploadPath(url) {
  try {
    const u = new URL(url, `http://localhost:${process.env.PORT || 3000}`);
    const base = path.join(__dirname, 'uploads');
    const name = path.basename(u.pathname);
    return path.join(base, name);
  } catch {
    const base = path.join(__dirname, 'uploads');
    const idx = String(url || '').lastIndexOf('/');
    const name = idx >= 0 ? String(url).slice(idx + 1) : String(url);
    return path.join(base, name);
  }
}

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