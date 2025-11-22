'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

async function synthesizeWarmVoice(text, opts = {}) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('Missing ELEVENLABS_API_KEY');
  const voiceId = opts.voiceId || process.env.ELEVENLABS_VOICE_ID || 'Bella';
  const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;
  const body = {
    model_id: modelId,
    text: String(text || '').trim(),
    voice_settings: {
      stability: 0.3,
      similarity_boost: 0.9,
      style: 0.6,
      use_speaker_boost: true,
    },
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': key,
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}`);
  const fileName = `${Date.now()}-tts.mp3`;
  const filePath = path.join(__dirname, '..', 'uploads', fileName);
  await saveStreamToFile(resp.body, filePath);
  return `/uploads/${fileName}`;
}

function saveStreamToFile(stream, filePath) {
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath);
    stream.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
    stream.on('error', reject);
  });
}

module.exports = { synthesizeWarmVoice };