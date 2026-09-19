/**
 * KhanNetra PPE Vision — OpenAI Vision Backend
 * Activate with MODEL_BACKEND=openai_vision in .env
 * Requires OPENAI_API_KEY to be set.
 */

'use strict';

const https  = require('https');
const { PPE_ITEMS } = require('../ppeConfig');

async function detect(imageBuffer, mimeType, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.startsWith('sk-'))
    throw new Error('OPENAI_API_KEY not configured for vision backend');

  const base64 = imageBuffer.toString('base64');
  const body   = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Detect mine workers and their PPE in this image. For each worker, list PPE items detected from: ${Object.keys(PPE_ITEMS).join(', ')}. Do NOT identify faces. Return JSON only: { "workers": [{ "worker_id": 1, "detected_ppe": [], "confidence_scores": {} }] }`,
        },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}`, detail: 'high' } },
      ],
    }],
    max_tokens: 800,
    response_format: { type: 'json_object' },
  });

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.openai.com',
      path:     '/v1/chat/completions',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body) },
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) return reject(new Error(j.error.message));
          const parsed = JSON.parse(j.choices[0].message.content);
          const workers = (parsed.workers || []).map((w, i) => ({
            worker_id: i + 1,
            position_in_frame: 'unknown',
            visibility: 'full',
            detected_ppe: w.detected_ppe || [],
            confidence_scores: w.confidence_scores || {},
            raw_detections: w,
          }));
          resolve({
            workers,
            scene_info: { description: 'OpenAI Vision analysis', lighting: 'unknown', worker_count: workers.length },
            model_info: { name: 'gpt-4o-mini', version: '2024', backend: 'openai_vision' },
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

module.exports = { detect };
