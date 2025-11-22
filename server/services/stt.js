'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

async function transcribeAudio(filePath) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error('Missing DEEPGRAM_API_KEY');
  const stream = fs.createReadStream(filePath);
  const url = 'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${key}`,
      'Content-Type': guessContentType(filePath),
    },
    body: stream,
  });
  if (!resp.ok) throw new Error(`Deepgram ${resp.status}`);
  const data = await resp.json();
  const t = extractTranscript(data);
  return String(t || '').trim();
}

function guessContentType(fp) {
  const ext = path.extname(fp).toLowerCase();
  if (ext === '.webm') return 'audio/webm';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.ogg' || ext === '.opus') return 'audio/ogg';
  return 'application/octet-stream';
}

function extractTranscript(d) {
  try {
    if (d && d.results && d.results.channels && d.results.channels[0] && d.results.channels[0].alternatives && d.results.channels[0].alternatives[0]) {
      const alt = d.results.channels[0].alternatives[0];
      if (alt.transcript) return alt.transcript;
      if (Array.isArray(alt.words)) return alt.words.map(w => w.punctuated_word || w.word || '').join(' ').trim();
    }
  } catch {}
  return '';
}

module.exports = { transcribeAudio };