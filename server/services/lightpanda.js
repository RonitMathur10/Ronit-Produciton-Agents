'use strict';

const fetch = require('node-fetch');

async function fetchIdealTechnique(skill) {
  const key = process.env.LIGHTPANDA_API_KEY;
  if (!key) {
    return fallbackResponse(skill);
  }
  try {
    const base = process.env.LIGHTPANDA_BASE_URL || 'https://api.lightpanda.ai';
    const resp = await fetch(`${base}/ideal-technique`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ skill }),
    });
    if (!resp.ok) throw new Error(`LightPanda ${resp.status}`);
    const data = await resp.json();
    const summary = String(data.summary || data.overview || data.text || '').trim();
    const criteria = normalizeCriteria(data.criteria || []);
    return { criteria, summary, from: 'lightpanda' };
  } catch (err) {
    console.warn('lightpanda error, using fallback', err.message);
    return fallbackResponse(skill);
  }
}

function normalizeCriteria(list) {
  return (list || []).map((c, idx) => ({
    id: String(c.id || idx + 1),
    name: String(c.name || `Criterion ${idx + 1}`),
    description: String(c.description || ''),
    weight: typeof c.weight === 'number' ? c.weight : 1,
  }));
}

function fallbackResponse(skill) {
  const s = skill.toLowerCase();
  let summary = '';
  if (s.includes('pushup')) {
    summary = 'Maintain neutral spine, full range of motion, controlled tempo, and elbow angle around 45° from torso.';
    return {
      from: 'fallback',
      summary,
      criteria: [
      { id: '1', name: 'Full Range', description: 'Chest nearly touches ground; arms lock out at top', weight: 3 },
      { id: '2', name: 'Neutral Spine', description: 'Straight line from head to heels', weight: 2 },
      { id: '3', name: 'Elbow Angle', description: 'Elbows ~45° from torso, controlled descent', weight: 2 },
      { id: '4', name: 'Tempo', description: 'Smooth down-up cycle without bouncing', weight: 1 },
      ]
    };
  }
  if (s.includes('basket')) {
    summary = 'Balanced stance, consistent shooting pocket, elbow alignment to target, and firm follow-through.';
    return {
      from: 'fallback',
      summary,
      criteria: [
      { id: '1', name: 'Footwork', description: 'Balanced stance, shoulder-width feet, knees bent', weight: 2 },
      { id: '2', name: 'Shooting Pocket', description: 'Ball starts around waist/chest, consistent pocket', weight: 2 },
      { id: '3', name: 'Elbow Alignment', description: 'Elbow under ball, straight line to hoop', weight: 3 },
      { id: '4', name: 'Follow Through', description: 'Wrist snap, fingers point down, held briefly', weight: 2 },
      ]
    };
  }
  if (s.includes('interview')) {
    summary = 'Deliver answers with clear structure (STAR), concise timing, specific metrics, and confident tone with minimal fillers.';
    return {
      from: 'fallback',
      summary,
      criteria: [
      { id: '1', name: 'Structure', description: 'Clear STAR structure in answers', weight: 3 },
      { id: '2', name: 'Conciseness', description: 'Answers within 60–90 seconds', weight: 2 },
      { id: '3', name: 'Examples', description: 'Concrete metrics and outcomes', weight: 2 },
      { id: '4', name: 'Delivery', description: 'Confident tone, eye contact, minimal fillers', weight: 2 },
      ]
    };
  }
  if (s.includes('sing')) {
    summary = 'Breath support and posture, consistent pitch, clear diction, dynamic control, and expressive phrasing.';
    return {
      from: 'fallback',
      summary,
      criteria: [
        { id: '1', name: 'Breath Support', description: 'Diaphragmatic breathing; sustained phrases without strain', weight: 3 },
        { id: '2', name: 'Pitch Accuracy', description: 'Intonation and stable pitch across registers', weight: 3 },
        { id: '3', name: 'Diction', description: 'Clear articulation of lyrics', weight: 2 },
        { id: '4', name: 'Dynamics', description: 'Controlled volume and emphasis to match musical phrasing', weight: 2 },
      ]
    };
  }
  summary = 'Follow fundamental technique: posture, consistency, and efficient movement.';
  return {
    from: 'fallback',
    summary,
    criteria: [
      { id: '1', name: 'Posture/Form', description: 'Maintain proper body alignment throughout movement', weight: 2 },
      { id: '2', name: 'Consistency', description: 'Repeatable motion and control', weight: 2 },
      { id: '3', name: 'Efficiency', description: 'Avoid unnecessary motion', weight: 1 },
    ]
  };
}

module.exports = { fetchIdealTechnique };