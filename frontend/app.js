const form = document.getElementById('coach-form');
const skillInput = document.getElementById('skill');
const fetchBtn = document.getElementById('fetchCriteria');
const criteriaList = document.getElementById('criteriaList');
const criteriaSummary = document.getElementById('criteriaSummary');
const criteriaSource = document.getElementById('criteriaSource');
const scoresList = document.getElementById('scores');
const totalEl = document.getElementById('scoreTotal');
const feedbackText = document.getElementById('feedbackText');
const speakBtn = document.getElementById('speakBtn');
const preview = document.getElementById('preview');
const startCamBtn = document.getElementById('startCam');
const startRecBtn = document.getElementById('startRec');
const stopRecBtn = document.getElementById('stopRec');
const recStatus = document.getElementById('recStatus');
const analysisStatus = document.getElementById('analysisStatus');
const startCoachBtn = document.getElementById('startCoach');
let mediaStream = null;
let recorder = null;
let chunks = [];
let audioUrl = '';
let recognizer = null;
let transcriptText = '';

function renderCriteria(criteria) {
  criteriaList.innerHTML = criteria.map(c => `
    <li>
      <div><strong>${escapeHtml(c.name)}</strong></div>
      <div class="meta">Weight: ${c.weight}</div>
      <div class="meta">${escapeHtml(c.description)}</div>
    </li>
  `).join('');
}

function renderAnalysis(a) {
  totalEl.textContent = `Total Score: ${a.total}/100`;
  scoresList.innerHTML = (a.scores || []).map(s => `
    <li>
      <div><strong>${escapeHtml(s.name)}</strong> — ${s.score}/10</div>
      <div class="meta">${escapeHtml(s.notes || '')}</div>
    </li>
  `).join('');
  feedbackText.textContent = a.feedback || '';
}

fetchBtn.addEventListener('click', async () => {
  const skill = skillInput.value.trim();
  if (!skill) return alert('Enter a skill');
  toggleLoading(fetchBtn, true);
  try {
    const res = await fetch(`/api/criteria?skill=${encodeURIComponent(skill)}&fresh=1`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (criteriaSummary) criteriaSummary.textContent = data.summary || '';
    if (criteriaSource) setStatus(criteriaSource, data.source === 'lightpanda' ? 'uploaded' : (data.source === 'fallback' ? 'stopped' : 'ready'), `Source: ${data.source || 'cache'}`);
    renderCriteria(data.criteria || []);
  } catch (e) {
    alert('Failed to fetch criteria');
  } finally {
    toggleLoading(fetchBtn, false);
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const skill = skillInput.value.trim();
  const transcript = transcriptText.trim();
  if (!skill || (!transcript && !audioUrl)) return alert('Enter a skill and record speech');
  const submitBtn = document.getElementById('startCoach');
  toggleLoading(submitBtn, true);
  try {
    setStatus(analysisStatus, 'analyzing', 'Comparing User Input with Research Agent Output');
    const startTime = Date.now();
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill, transcript, audioUrl })
    });
    const data = await res.json();
    const minDelay = 7000 + Math.floor(Math.random() * 3000);
    const elapsed = Date.now() - startTime;
    if (minDelay > elapsed) await wait(minDelay - elapsed);
    if (data.error) throw new Error(data.error);
    renderCriteria(data.criteria || []);
    renderAnalysis(data.analysis || {});
    setStatus(analysisStatus, 'done', 'Analysis complete');
    const t = feedbackText.textContent.trim();
    if (t) {
      try {
        await playWarmAudio(t);
      } catch {
        speakNatural(t);
      }
    }
  } catch (e) {
    alert('Coaching analysis failed');
    setStatus(analysisStatus, 'stopped', 'Analysis failed');
  } finally {
    toggleLoading(submitBtn, false);
  }
});

speakBtn.addEventListener('click', () => {
  const text = feedbackText.textContent.trim();
  if (!text) return;
  speakNatural(text);
});

function toggleLoading(btn, on) {
  if (!btn) return;
  btn.disabled = !!on;
  btn.textContent = on ? 'Loading…' : btn.id === 'fetchCriteria' ? 'Get Ideal Criteria' : 'Start Coaching';
}

function escapeHtml(s) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(s).replace(/[&<>"']/g, m => map[m]);
}

function setStatus(el, state, text) {
  if (!el) return;
  el.className = `status-bar ${state}`;
  const t = el.querySelector('.status-text');
  if (t) t.textContent = text;
}

startCamBtn.addEventListener('click', async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
    if (preview) preview.srcObject = mediaStream;
    setStatus(recStatus, 'ready', 'Camera ready');
    if (startCoachBtn) startCoachBtn.disabled = true;
  } catch (e) {
    alert('Camera access failed');
  }
});

startRecBtn.addEventListener('click', () => {
  if (!mediaStream) return alert('Start camera first');
  chunks = [];
  try {
    const audioStream = new MediaStream(mediaStream.getAudioTracks());
    recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
  } catch {
    const audioStream = new MediaStream(mediaStream.getAudioTracks());
    recorder = new MediaRecorder(audioStream);
  }
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  recorder.start();
  startRecBtn.disabled = true;
  setStatus(recStatus, 'recording', 'Recording…');
  if (startCoachBtn) startCoachBtn.disabled = true;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    recognizer = new SR();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = 'en-US';
    let finalText = '';
    recognizer.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      transcriptText = (finalText + ' ' + interim).trim();
      updateCoachAvailability();
    };
    recognizer.start();
  }
});

stopRecBtn.addEventListener('click', async () => {
  if (!recorder) return alert('Not recording');
  recorder.stop();
  startRecBtn.disabled = false;
  if (recognizer && recognizer.stop) recognizer.stop();
  recorder.onstop = async () => {
    setStatus(recStatus, 'stopped', 'Stopped. Uploading…');
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
    const fd = new FormData();
    fd.append('media', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      audioUrl = location.origin + data.url;
      setStatus(recStatus, 'uploaded', 'Uploaded');
      updateCoachAvailability();
    } catch (e) {
      alert('Upload failed');
      setStatus(recStatus, 'stopped', 'Upload failed');
    }
  };
});

function updateCoachAvailability() {
  const btn = startCoachBtn || document.getElementById('startCoach');
  if (!btn) return;
  const hasTranscript = (transcriptText && transcriptText.trim().length > 0);
  const hasUpload = (audioUrl && audioUrl.length > 0);
  btn.disabled = !(hasTranscript || hasUpload);
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

let voicesCache = [];
window.speechSynthesis.onvoiceschanged = () => { voicesCache = window.speechSynthesis.getVoices(); };

function pickVoice() {
  const candidates = voicesCache.length ? voicesCache : window.speechSynthesis.getVoices();
  const isMac = /Mac/i.test(navigator.platform || '') || /Mac OS/i.test(navigator.userAgent || '');
  if (isMac) {
    const sam = candidates.find((vv) => vv.name === 'Samantha');
    if (sam) return sam;
  }
  const preferred = ['Samantha', 'Google US English', 'Alex', 'Victoria', 'Allison', 'Ava', 'Google en-US'];
  for (const name of preferred) {
    const v = candidates.find((vv) => vv.name === name);
    if (v) return v;
  }
  const en = candidates.find((vv) => (vv.lang || '').toLowerCase().startsWith('en'));
  return en || candidates[0] || null;
}

function speakNatural(text) {
  const sentences = chunkText(String(text));
  const v = pickVoice();
  window.speechSynthesis.cancel();
  let idx = 0;
  const speakNext = () => {
    if (idx >= sentences.length) return;
    const s = new SpeechSynthesisUtterance(sentences[idx]);
    if (v) s.voice = v;
    s.lang = 'en-US';
    const baseRate = idx === 0 ? 0.98 : 1.02;
    const basePitch = idx === 0 ? 1.16 : 1.20;
    s.rate = baseRate + (Math.random() * 0.05);
    s.pitch = basePitch + (Math.random() * 0.05);
    s.volume = 1.0;
    s.onend = () => { idx += 1; setTimeout(speakNext, 300 + Math.floor(Math.random() * 300)); };
    window.speechSynthesis.speak(s);
  };
  speakNext();
}

async function playWarmAudio(text) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  const data = await res.json();
  if (!res.ok || !data.url) throw new Error('tts');
  const audio = new Audio(data.url);
  audio.play().catch(() => { throw new Error('play'); });
}

function chunkText(text) {
  const primary = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks = [];
  for (const s of primary) {
    if (s.length > 140 && s.includes(',')) {
      const parts = s.split(/,\s*/);
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i];
        const end = i === parts.length - 1 ? '' : ',';
        chunks.push((seg + end).trim());
      }
    } else {
      chunks.push(s.trim());
    }
  }
  return chunks;
}