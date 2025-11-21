'use strict';

const Anthropic = require('@anthropic-ai/sdk');

async function analyzePerformanceWithClaude({ skill, criteria, transcript }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return mockAnalysis(criteria);
  }
  const client = new Anthropic({ apiKey: key });
  const model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
  const prompt = buildPrompt({ skill, criteria, transcript });
  try {
    const content = [{ type: 'text', text: prompt }];
    const msg = await client.messages.create({
      model,
      max_tokens: 800,
      temperature: 0.2,
      system: 'You are an objective voice and delivery coach. Output concise JSON only.',
      messages: [{ role: 'user', content }],
    });
    const text = msg.content?.[0]?.type === 'text' ? msg.content[0].text : String(msg.content);
    return safeParseJson(text) || mockAnalysis(criteria);
  } catch (err) {
    console.warn('anthropic error, using mock', err.message);
    return mockAnalysis(criteria);
  }
}

function buildPrompt({ skill, criteria, transcript }) {
  const cText = criteria.map((c) => `- ${c.name} (w${c.weight}): ${c.description}`).join('\n');
  return [
    `Skill: ${skill}`,
    'Ideal Technique Criteria:',
    cText,
    'Transcript:',
    transcript || '(no transcript provided)',
    'Assess delivery and content quality based on the transcript. Focus on clarity, structure, pacing, tone, confidence, filler words, specificity of examples, and conciseness.',
    'Score each criterion 0–10 and compute weighted total 0–100. Provide short notes referencing observed evidence from the transcript.',
    'Return strictly this JSON shape:',
    '{ "scores": [{"id":"string","name":"string","score":0,"notes":"string"}], "total": 0, "feedback": "One paragraph of personalized coaching focused on delivery" }',
  ].join('\n');
}

function mockAnalysis(criteria) {
  const scores = criteria.map((c) => ({ id: c.id, name: c.name, score: Math.max(6, 10 - (c.weight % 4)), notes: 'Good baseline; focus on consistency.' }));
  const totalWeighted = scores.reduce((sum, s, i) => sum + s.score * (criteria[i].weight || 1), 0);
  const maxWeighted = criteria.reduce((sum, c) => sum + 10 * (c.weight || 1), 0);
  const total = Math.round((totalWeighted / maxWeighted) * 100);
  const feedback = 'Solid start. Prioritize highest-weight criteria with targeted drills and tempo control.';
  return { scores, total, feedback };
}

function safeParseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

module.exports = { analyzePerformanceWithClaude };