const form = document.getElementById('coach-form');
const skillInput = document.getElementById('skill');
const transcriptInput = document.getElementById('transcript');
const fetchBtn = document.getElementById('fetchCriteria');
const criteriaList = document.getElementById('criteriaList');
const criteriaSummary = document.getElementById('criteriaSummary');
const criteriaSource = document.getElementById('criteriaSource');
const scoresList = document.getElementById('scores');
const totalEl = document.getElementById('scoreTotal');
const feedbackText = document.getElementById('feedbackText');
const speakBtn = document.getElementById('speakBtn');
const startMicBtn = document.getElementById('startMic');
const startRecBtn = document.getElementById('startRec');
const stopRecBtn = document.getElementById('stopRec');
const recStatus = document.getElementById('recStatus');
const analysisStatus = document.getElementById('analysisStatus');
let mediaStream = null;
let recorder = null;
let chunks = [];
let audioUrl = '';
let recognizer = null;

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
  const transcript = transcriptInput.value.trim();
  if (!skill || (!transcript && !audioUrl)) return alert('Enter a skill and record speech or ensure upload succeeded');
  const submitBtn = document.getElementById('startCoach');
  toggleLoading(submitBtn, true);
  try {
    setStatus(analysisStatus, 'analyzing', 'Analyzing audio and transcript…');
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill, transcript, audioUrl })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderCriteria(data.criteria || []);
    renderAnalysis(data.analysis || {});
    setStatus(analysisStatus, 'done', 'Analysis complete');
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
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0; utter.pitch = 1.0; utter.lang = 'en-US';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
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

startMicBtn.addEventListener('click', async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setStatus(recStatus, 'ready', 'Mic ready');
  } catch (e) {
    alert('Microphone access failed');
  }
});

startRecBtn.addEventListener('click', () => {
  if (!mediaStream) return alert('Start mic first');
  chunks = [];
  try {
    recorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm;codecs=opus' });
  } catch {
    recorder = new MediaRecorder(mediaStream);
  }
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  recorder.start();
  startRecBtn.disabled = true;
  setStatus(recStatus, 'recording', 'Recording…');
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
      transcriptInput.value = (finalText + ' ' + interim).trim();
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
    } catch (e) {
      alert('Upload failed');
      setStatus(recStatus, 'stopped', 'Upload failed');
    }
  };
});