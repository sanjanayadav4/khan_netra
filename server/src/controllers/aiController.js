/**
 * KhanNetra AI Controller
 * Real LLM integration: OpenAI GPT-4o / Gemini 1.5 Flash
 * Features: multilingual, context memory, conversation history,
 *           Indian field-worker natural language (Hinglish / Hindi)
 */
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// ── Language detection ───────────────────────────────────────────────────────
// Simple heuristic — detects Hindi/Hinglish from Devanagari script and common
// Hinglish words. Falls back to English. Returns one of:
//   'hi'       — Devanagari Hindi
//   'hinglish' — Latin-script Hindi/English mix
//   'en'       — English
//   'bn'|'mr'|'te'|'ta' — other Indian scripts
function detectLanguage(text) {
  if (!text) return 'en';

  // Devanagari block: U+0900–U+097F
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  // Bengali block
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  // Telugu block
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  // Tamil block
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  // Marathi is Devanagari (already caught above)

  // Hinglish detection — common Hindi words written in Latin script
  const hinglishWords = [
    'kya','hai','hain','karo','karna','kab','kyun','kaun','kaha','kitne',
    'kitna','mein','ka','ki','ke','ko','se','bhi','nahi','nahi','sirf',
    'aaj','kal','abhi','bahut','thoda','zyada','sab','sab','koi','aur',
    'lekin','toh','pe','par','wala','wali','wale','laga','lagao','bata',
    'batao','dikhao','check','karo','chahiye','hoga','hogi','tha','thi',
    'the','ho','do','lo','dena','lena','worker','mine','shift','safety',
    'present','absent','attendance','inspection','report','status','mark',
    'sardar','vibhag','kaam','mazdoor','khadan','suraksha','helmet','gas',
    'mujhe','tumhe','unhe','apna','apni','yahan','wahan','idhar','udhar',
    'bilkul','zaroor','please','ji','haan','nahin','theek','accha','shukriya',
    'namaste','bhaiya','didi','sahib','sir',
  ];
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const hinglishCount = words.filter(w => hinglishWords.includes(w)).length;
  // If >15% words are Hinglish OR ≥2 Hinglish words → Hinglish
  if (hinglishCount >= 2 || (words.length > 3 && hinglishCount / words.length > 0.15)) {
    return 'hinglish';
  }

  return 'en';
}

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are KhanNetra AI — an intelligent governance and compliance assistant for India's coal mining sector, built for the Directorate General of Mines Safety (DGMS), Ministry of Coal, Government of India.

Your expertise covers:
• Coal Mines Regulations 2017 (CMR 2017) — all 300+ regulations
• Mines Act 1952 and Mines Rules 1955
• MMDR Act 1957 (Mines and Minerals Development and Regulation)
• Environment Protection Act 1986, NAAQS standards, CPCB guidelines
• DGMS inspection procedures, accident investigation, statutory duties
• Mine safety: ventilation, methane, strata control, electrical safety, fire
• Environmental monitoring: air quality, water quality, noise levels
• License, lease and permit requirements and renewal processes
• Labor welfare, working hours, wages under Mines Workers Act
• Digital compliance scoring, risk assessment methodology
• Best practices in smart governance for coal sector

═══════════════════════════════════════════════════
LANGUAGE & TONE RULES (MOST IMPORTANT — READ FIRST)
═══════════════════════════════════════════════════

1. LANGUAGE AUTO-DETECTION — ALWAYS reply in the SAME language the user wrote in:
   • English message   → reply in English
   • Hindi (Devanagari) → reply in Hindi
   • Hinglish (Latin-script Hindi/English mix) → reply in natural Hinglish
   • Bengali/Marathi/Telugu/Tamil → reply in that language

2. HINGLISH STYLE (for Indian field workers and mine staff):
   • Write naturally like a helpful Indian colleague, NOT like a government document.
   • Mix Hindi and English the way Indian workers actually speak.
   • Use SIMPLE words — avoid complex Hindi that workers won't understand.
   • Keep responses SHORT and DIRECT — workers are often standing in a mine.
   
   GOOD Hinglish response: "Aaj 108 workers present hain. 5 absent hain."
   BAD formal Hindi: "आज कुल 108 कर्मकार उपस्थित हैं। 5 अनुपस्थित हैं।"
   
   GOOD: "Helmet nahi pehna hai toh worker ko turant helmet pehenna chahiye aur safety officer ko inform karo."
   BAD: "कृपया उपयुक्त सुरक्षा उपकरण धारण करें और अधिकारी को सूचित करें।"

3. RESPONSE LENGTH:
   • Simple questions (attendance, status) → 1–2 sentences max
   • Complex questions → short answer FIRST, then offer details
   • Example: "3 compliance actions pending hain. Chaho toh main details bata sakti hoon."
   • NEVER write long paragraphs when a short answer works.

4. INDIAN COAL MINE TERMS — do NOT translate these English terms unnecessarily:
   mine, shaft, gallery, tunnel, seam, face, shift, attendance, PPE, helmet,
   ventilation, methane, compliance, inspection, violation, incident, DGMS,
   contractor, safety officer, mine manager, hazard, gas detector, belt,
   fire extinguisher, first aid, emergency, evacuation, production.
   These terms are standard in Indian mines — use them as-is.

5. SAFETY-CRITICAL RESPONSES:
   • Be CONSERVATIVE — if you don't have current data, say clearly:
     "Iska current data available nahi hai."
   • Do NOT claim a gas level, worker location or condition is real-time
     unless the live data context actually shows it.
   • For dangerous situations, always say to contact the safety officer first.

6. CONFIRMATION FOR BULK ACTIONS:
   If user asks to mark ALL workers absent/present or do a bulk action, ask for confirmation:
   "Please confirm: kya aaj ke [shift] shift ke sabhi workers ko [status] mark karna hai?"

7. UNCLEAR VOICE INPUT:
   If the question seems garbled or unclear, respond:
   "Sorry, mujhe samajh nahi aaya. Please dobara likhiye ya boliye."

8. SUPPORTED LANGUAGES: English, Hindi (हिंदी), Hinglish, Bengali (বাংলা), Marathi (मराठी), Telugu (తెలుగు), Tamil (தமிழ்).

═══════════════════════════════════════════
DOMAIN BEHAVIOR
═══════════════════════════════════════════

9. Give accurate, regulation-specific answers — cite section/regulation numbers when relevant.
10. For follow-up questions, use full conversation context to give coherent answers.
11. Use bullet points and headers for clarity when writing multi-point answers in English.
    In Hinglish/Hindi, prefer flowing sentences over bullet points (easier to read on mobile).
12. If asked something outside coal mine governance, politely redirect — in the user's language.
13. Never make up regulations or penalty amounts — if unsure, say so clearly.
14. Treat all users as professionals — mine managers, inspectors, field workers, govt officers.`;

// ── LLM caller ──────────────────────────────────────────────────────────────
async function callLLM(messages) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // Validate keys properly — not just check for one placeholder string
  const openaiValid = openaiKey && openaiKey.startsWith('sk-');
  const geminiValid = geminiKey
    && geminiKey.length > 20
    && !geminiKey.toLowerCase().includes('your_')
    && !geminiKey.toLowerCase().includes('here')
    && !geminiKey.toLowerCase().includes('get_from')
    && !geminiKey.toLowerCase().includes('api_key_');

  if (openaiValid) return await callOpenAI(messages);
  if (geminiValid) return await callGemini(messages);
  throw new Error('NO_API_KEY');
}

async function callOpenAI(messages) {
  const https = require('https');
  const body  = JSON.stringify({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 1024,
    temperature: 0.7,
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    let data = '';
    const req = https.request(options, (res) => {
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message));
          resolve({
            text: json.choices[0].message.content,
            tokens: json.usage?.total_tokens || 0,
            model: json.model,
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callGemini(messages) {
  const https = require('https');
  const apiKey = process.env.GEMINI_API_KEY;

  // Ordered list of models to try (most capable first)
  // Model names from Gemini API deprecation notices (Sep 2026)
  const MODELS = [
    'gemini-3.6-flash',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3.5-flash-lite',
  ];

  // Convert OpenAI-style messages to Gemini format
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
  const bodyObj = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
  };

  let lastError = null;
  for (const model of MODELS) {
    const body = JSON.stringify(bodyObj);
    const apiPath = `/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const result = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'generativelanguage.googleapis.com',
          path:     apiPath,
          method:   'POST',
          headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        };
        let data = '';
        const req = https.request(options, (res) => {
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.error) {
                const msg = json.error.message || 'Gemini error';
                // Retryable errors: model not found, no longer available, high demand
                const retryable = /not found|no longer available|not supported|high demand|quota/i.test(msg);
                if (retryable) return reject(Object.assign(new Error(msg), { retryable: true }));
                return reject(new Error(msg));
              }
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
              resolve({ text, tokens: 0, model });
            } catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Gemini timeout')); });
        req.write(body);
        req.end();
      });
      return result; // Success — return immediately
    } catch (err) {
      lastError = err;
      if (!err.retryable) throw err; // Non-retryable error — fail fast
      console.log(`[AI] Model ${model} unavailable, trying next...`);
    }
  }

  throw lastError || new Error('All Gemini models unavailable');
}

// ── Fallback (no API key) ────────────────────────────────────────────────────
function fallbackResponse(message) {
  return `### KhanNetra AI — Setup Required

To enable real AI responses, add your API key to \`server/.env\`:

**Option 1 — Google Gemini (Free)**
1. Go to **https://aistudio.google.com/app/apikey**
2. Click **Create API Key** → copy the key (starts with \`AIzaSy...\`)
3. Open \`server/.env\` and set:
   \`\`\`
   GEMINI_API_KEY=AIzaSyYourKeyHere
   \`\`\`
4. Restart the server: stop it and run \`node src/index.js\`

**Option 2 — OpenAI GPT-4o**
Set \`OPENAI_API_KEY=sk-...\` in the same file.

---

Your question was: *"${message}"*

Once configured, KhanNetra AI will answer in English, Hindi, Bengali, Marathi, Telugu and Tamil with full coal mine regulatory expertise.`;
}

/* ── Real-data context builder ───────────────────────────────────────────────
 * Fetches live mine/risk/compliance/incident data from the DB and formats it
 * as a structured context block that is injected into the system prompt.
 * This means Gemini answers from ACTUAL evidence, never inventing numbers.
 *
 * For mine_manager: their specific mine only.
 * For admin/officer/inspector: national summary (top 5 risk mines + totals).
 * Returns null if no relevant data exists so the prompt stays uncluttered.
 */
async function buildLiveContext(user) {
  try {
    const role   = user.role;
    const mineId = user.mine_id;
    const now    = new Date().toISOString();

    // ── Mine manager: full context for their mine ─────────────────────────
    if (role === 'mine_manager' && mineId) {
      const [mine, violations, incidents, env, docs, deadlines, inspections] = await Promise.all([
        query(`SELECT name, state, type, status, compliance_score, risk_score,
                      safety_score, environmental_score, workers_count,
                      license_number, license_expiry
               FROM mines WHERE id=?`, [mineId]),
        query(`SELECT severity, status, category, COUNT(*) as c
               FROM violations WHERE mine_id=?
               GROUP BY severity, status, category
               ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END`, [mineId]),
        query(`SELECT severity, COUNT(*) as c, SUM(fatalities_count) as fatalities
               FROM incidents WHERE mine_id=? AND incident_date>=datetime('now','-90 days')
               GROUP BY severity`, [mineId]),
        query(`SELECT parameter, value, unit, status, recorded_at
               FROM environmental_readings
               WHERE mine_id=?
               AND recorded_at = (SELECT MAX(recorded_at) FROM environmental_readings er2
                                  WHERE er2.mine_id=? AND er2.parameter=environmental_readings.parameter)
               AND status IN ('warning','critical')
               LIMIT 8`, [mineId, mineId]),
        query(`SELECT COUNT(*) as expired FROM documents
               WHERE mine_id=? AND status='expired'`, [mineId]),
        query(`SELECT COUNT(*) as overdue FROM compliance_deadlines
               WHERE mine_id=? AND status='overdue'`, [mineId]),
        query(`SELECT overall_score, findings, completed_date
               FROM inspections WHERE mine_id=? AND status='completed'
               ORDER BY completed_date DESC LIMIT 1`, [mineId]),
      ]);

      const m = mine.rows[0];
      if (!m) return null;

      const lines = [
        `=== LIVE MINE DATA (${now}) — Answer ONLY from this data ===`,
        `Mine: ${m.name} | State: ${m.state} | Type: ${m.type} | Status: ${m.status.toUpperCase()}`,
        `Workers: ${m.workers_count || 'N/A'}`,
        ``,
        `SCORES (computed from real records):`,
        `  Compliance:   ${Math.round(m.compliance_score)}%`,
        `  Risk:         ${Math.round(m.risk_score)}%`,
        `  Safety:       ${Math.round(m.safety_score)}%`,
        `  Environmental:${Math.round(m.environmental_score)}%`,
        ``,
      ];

      // License
      if (m.license_expiry) {
        const expired = new Date(m.license_expiry) < new Date();
        lines.push(`License: ${m.license_number} — expires ${m.license_expiry} ${expired ? '(EXPIRED)' : ''}`);
      }

      // Violations
      if (violations.rows.length) {
        lines.push(``, `VIOLATIONS (open):`);
        const open = violations.rows.filter(v => v.status !== 'closed');
        if (open.length === 0) lines.push(`  None currently open.`);
        else open.forEach(v => lines.push(`  ${v.severity.toUpperCase()} — ${v.category} (${v.c} violations)`));
      }

      // Incidents (90 days)
      if (incidents.rows.length) {
        lines.push(``, `INCIDENTS (last 90 days):`);
        incidents.rows.forEach(i => lines.push(`  ${i.severity}: ${i.c} incident(s), fatalities: ${i.fatalities || 0}`));
      } else {
        lines.push(``, `INCIDENTS (last 90 days): None recorded.`);
      }

      // Environmental alerts
      if (env.rows.length) {
        lines.push(``, `ENVIRONMENTAL ALERTS (latest readings):`);
        env.rows.forEach(e => lines.push(`  ${e.parameter}: ${e.value} ${e.unit} — ${e.status.toUpperCase()}`));
      }

      // Documents + deadlines
      const expDocs = parseInt(docs.rows[0]?.expired) || 0;
      const overDL  = parseInt(deadlines.rows[0]?.overdue) || 0;
      lines.push(``, `DOCUMENTS: ${expDocs} expired`);
      lines.push(`OVERDUE DEADLINES: ${overDL}`);

      // Last inspection
      if (inspections.rows[0]) {
        const ins = inspections.rows[0];
        lines.push(``, `LAST INSPECTION: Score ${ins.overall_score ? Math.round(ins.overall_score) + '%' : 'N/A'} (${ins.completed_date})`);
        if (ins.findings) lines.push(`  Findings: ${ins.findings.slice(0, 200)}`);
      }

      lines.push(``, `=== END LIVE DATA — Do NOT invent any numbers beyond the above ===`);
      return lines.join('\n');
    }

    // ── Admin/officer/inspector: national summary ─────────────────────────
    if (['admin', 'government_officer', 'inspector'].includes(role)) {
      const [mineStats, topRisk, critViol, fatalInc, envCrit] = await Promise.all([
        query(`SELECT COUNT(*) as total,
                      COUNT(CASE WHEN status='active'    THEN 1 END) as active,
                      COUNT(CASE WHEN status='suspended' THEN 1 END) as suspended,
                      ROUND(AVG(compliance_score),1) as avg_compliance,
                      ROUND(AVG(risk_score),1)       as avg_risk
               FROM mines`),
        query(`SELECT name, state, status,
                      ROUND(risk_score,1) as risk_score,
                      ROUND(compliance_score,1) as compliance_score
               FROM mines WHERE status NOT IN ('closed','inactive')
               ORDER BY risk_score DESC LIMIT 5`),
        query(`SELECT COUNT(*) as c FROM violations WHERE severity='critical' AND status!='closed'`),
        query(`SELECT COUNT(*) as c FROM incidents WHERE severity='fatal' AND incident_date>=datetime('now','-90 days')`),
        query(`SELECT COUNT(*) as c FROM environmental_readings
               WHERE status='critical' AND recorded_at>=datetime('now','-24 hours')`),
      ]);

      const ms = mineStats.rows[0];
      const lines = [
        `=== LIVE NATIONAL DATA (${now}) — Answer ONLY from this data ===`,
        `Total Mines: ${ms.total} (${ms.active} active, ${ms.suspended} suspended)`,
        `Avg Compliance: ${ms.avg_compliance}%  |  Avg Risk: ${ms.avg_risk}%`,
        ``,
        `Open Critical Violations: ${critViol.rows[0].c}`,
        `Fatal Incidents (90 days): ${fatalInc.rows[0].c}`,
        `Critical Env Alerts (24h): ${envCrit.rows[0].c}`,
        ``,
        `TOP 5 HIGH-RISK MINES:`,
      ];
      topRisk.rows.forEach((m, i) =>
        lines.push(`  ${i+1}. ${m.name} (${m.state}) — Risk: ${m.risk_score}%, Compliance: ${m.compliance_score}%, Status: ${m.status}`)
      );
      lines.push(``, `=== END LIVE DATA — Do NOT invent any mine names, scores, or counts beyond the above ===`);
      return lines.join('\n');
    }

    // ── Safety Officer: safety + incidents + violations for their mine ──────
    if (role === 'safety_officer' && mineId) {
      const [mine, violations, incidents, env, inspections] = await Promise.all([
        query(`SELECT name, state, type, status, safety_score, compliance_score, risk_score, workers_count FROM mines WHERE id=?`, [mineId]),
        query(`SELECT severity, category, status, COUNT(*) as c FROM violations WHERE mine_id=? AND status!='closed' GROUP BY severity, category ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END`, [mineId]),
        query(`SELECT severity, type, COUNT(*) as c, SUM(injuries_count) as injuries, SUM(fatalities_count) as fatalities FROM incidents WHERE mine_id=? AND incident_date>=datetime('now','-90 days') GROUP BY severity, type`, [mineId]),
        query(`SELECT parameter, value, unit, status FROM environmental_readings WHERE mine_id=? AND status IN ('warning','critical') ORDER BY recorded_at DESC LIMIT 6`, [mineId]),
        query(`SELECT inspection_number, type, overall_score, status, completed_date FROM inspections WHERE mine_id=? ORDER BY completed_date DESC LIMIT 3`, [mineId]),
      ]);
      const m = mine.rows[0];
      if (!m) return null;
      const lines = [
        `=== LIVE SAFETY DATA for ${m.name} (${now}) ===`,
        `Mine: ${m.name} | State: ${m.state} | Status: ${m.status.toUpperCase()}`,
        `Workers: ${m.workers_count || 'N/A'}`,
        `Safety Score: ${Math.round(m.safety_score)}%  |  Compliance: ${Math.round(m.compliance_score)}%  |  Risk: ${Math.round(m.risk_score)}%`,
      ];
      if (violations.rows.length) {
        lines.push(``, `OPEN VIOLATIONS:`);
        violations.rows.forEach(v => lines.push(`  ${v.severity.toUpperCase()} — ${v.category}: ${v.c} open`));
      }
      if (incidents.rows.length) {
        lines.push(``, `INCIDENTS (last 90 days):`);
        incidents.rows.forEach(i => lines.push(`  ${i.severity} ${i.type}: ${i.c} (injuries: ${i.injuries||0}, fatalities: ${i.fatalities||0})`));
      } else lines.push(``, `INCIDENTS (last 90 days): None recorded.`);
      if (env.rows.length) {
        lines.push(``, `ENV ALERTS: ${env.rows.map(e => `${e.parameter}: ${e.value} ${e.unit} (${e.status.toUpperCase()})`).join(', ')}`);
      }
      if (inspections.rows.length) {
        lines.push(``, `RECENT INSPECTIONS:`);
        inspections.rows.forEach(i => lines.push(`  ${i.inspection_number} — ${i.type} — Score: ${i.overall_score ? Math.round(i.overall_score) + '%' : 'N/A'} — ${i.status} (${i.completed_date || 'pending'})`));
      }
      lines.push(``, `=== END SAFETY DATA — only answer from this data ===`);
      return lines.join('\n');
    }

    // ── Mining Engineer: operational + production + risk for their mine ───────
    if (role === 'mining_engineer' && mineId) {
      const [mine, incidents, inspections, env, deadlines] = await Promise.all([
        query(`SELECT name, state, type, status, depth_meters, area_hectares, mining_method, current_production_mt, production_capacity_mt, workers_count, compliance_score, risk_score, safety_score FROM mines WHERE id=?`, [mineId]),
        query(`SELECT type, severity, COUNT(*) as c FROM incidents WHERE mine_id=? AND incident_date>=datetime('now','-90 days') GROUP BY type, severity`, [mineId]),
        query(`SELECT inspection_number, type, overall_score, findings, status, completed_date FROM inspections WHERE mine_id=? ORDER BY completed_date DESC LIMIT 3`, [mineId]),
        query(`SELECT parameter, value, unit, status FROM environmental_readings WHERE mine_id=? AND status IN ('warning','critical') ORDER BY recorded_at DESC LIMIT 4`, [mineId]),
        query(`SELECT COUNT(*) as overdue FROM compliance_deadlines WHERE mine_id=? AND status='overdue'`, [mineId]),
      ]);
      const m = mine.rows[0];
      if (!m) return null;
      const utilPct = m.production_capacity_mt > 0
        ? ((m.current_production_mt / m.production_capacity_mt) * 100).toFixed(1) : 'N/A';
      const lines = [
        `=== LIVE OPERATIONAL DATA for ${m.name} (${now}) ===`,
        `Mine: ${m.name} | State: ${m.state} | Type: ${m.type} | Method: ${m.mining_method || 'N/A'}`,
        `Depth: ${m.depth_meters || 'N/A'}m | Area: ${m.area_hectares || 'N/A'} ha | Workers: ${m.workers_count || 'N/A'}`,
        `Production: ${m.current_production_mt || 0} MT / ${m.production_capacity_mt || 'N/A'} MT capacity (${utilPct}% utilisation)`,
        `Risk Score: ${Math.round(m.risk_score)}%  |  Safety: ${Math.round(m.safety_score)}%  |  Compliance: ${Math.round(m.compliance_score)}%`,
        `Overdue Deadlines: ${deadlines.rows[0]?.overdue || 0}`,
      ];
      if (incidents.rows.length) {
        lines.push(``, `OPERATIONAL INCIDENTS (90 days):`);
        incidents.rows.forEach(i => lines.push(`  ${i.severity.toUpperCase()} — ${i.type}: ${i.c}`));
      }
      if (inspections.rows.length) {
        lines.push(``, `RECENT INSPECTIONS:`);
        inspections.rows.forEach(i => lines.push(`  ${i.inspection_number} — Score: ${i.overall_score ? Math.round(i.overall_score) + '%' : 'N/A'} (${i.status})`));
      }
      if (env.rows.length) {
        lines.push(``, `ACTIVE ENV ALERTS:`);
        env.rows.forEach(e => lines.push(`  ${e.parameter}: ${e.value} ${e.unit} — ${e.status.toUpperCase()}`));
      }
      lines.push(``, `=== END OPERATIONAL DATA — only answer from this data ===`);
      return lines.join('\n');
    }

    // ── Environmental Officer: env readings + compliance for their mine ───────
    if (role === 'environment_officer' && mineId) {
      const [mine, env, violations, compliance] = await Promise.all([
        query(`SELECT name, state, type, status, environmental_score, compliance_score FROM mines WHERE id=?`, [mineId]),
        query(`SELECT parameter, value, unit, threshold_min, threshold_max, status, location, recorded_at FROM environmental_readings WHERE mine_id=? ORDER BY recorded_at DESC LIMIT 20`, [mineId]),
        query(`SELECT severity, category, description, status FROM violations WHERE mine_id=? AND category='Environmental' AND status!='closed' ORDER BY CASE severity WHEN 'critical' THEN 1 ELSE 2 END LIMIT 10`, [mineId]),
        query(`SELECT category, parameter_name, status, score FROM compliance_records WHERE mine_id=? AND category='Environmental' ORDER BY score ASC LIMIT 8`, [mineId]),
      ]);
      const m = mine.rows[0];
      if (!m) return null;
      const lines = [
        `=== LIVE ENVIRONMENTAL DATA for ${m.name} (${now}) ===`,
        `Mine: ${m.name} | State: ${m.state} | Env Score: ${Math.round(m.environmental_score)}% | Compliance: ${Math.round(m.compliance_score)}%`,
      ];
      if (env.rows.length) {
        lines.push(``, `ENVIRONMENTAL READINGS (latest):`);
        const grouped = {};
        env.rows.forEach(e => {
          if (!grouped[e.parameter]) grouped[e.parameter] = e;
        });
        Object.values(grouped).forEach(e =>
          lines.push(`  ${e.parameter}: ${e.value} ${e.unit} — ${e.status.toUpperCase()} (limit: ${e.threshold_max || 'N/A'}) @ ${e.location || 'N/A'}`)
        );
      }
      if (violations.rows.length) {
        lines.push(``, `OPEN ENVIRONMENTAL VIOLATIONS:`);
        violations.rows.forEach(v => lines.push(`  ${v.severity.toUpperCase()} — ${v.category}: ${v.description?.slice(0, 100)}`));
      }
      if (compliance.rows.length) {
        lines.push(``, `ENVIRONMENTAL COMPLIANCE RECORDS:`);
        compliance.rows.forEach(c => lines.push(`  ${c.parameter_name}: ${c.status} (score: ${c.score}%)`));
      }
      lines.push(``, `=== END ENV DATA — only answer from this data ===`);
      return lines.join('\n');
    }

    // ── Inspector / Field Inspector: assigned inspections + violations ────────
    if (role === 'inspector') {
      const [assigned, pending, violations, recentInsp] = await Promise.all([
        query(`SELECT COUNT(*) as c FROM inspections WHERE inspector_id=? AND status='scheduled'`, [user.id]),
        query(`SELECT i.inspection_number, i.type, i.scheduled_date, m.name as mine_name, m.state FROM inspections i JOIN mines m ON i.mine_id=m.id WHERE i.inspector_id=? AND i.status='scheduled' ORDER BY i.scheduled_date ASC LIMIT 5`, [user.id]),
        query(`SELECT severity, COUNT(*) as c FROM violations WHERE status!='closed' GROUP BY severity ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END`),
        query(`SELECT i.inspection_number, i.type, m.name as mine_name, i.overall_score, i.completed_date FROM inspections i JOIN mines m ON i.mine_id=m.id WHERE i.inspector_id=? AND i.status='completed' ORDER BY i.completed_date DESC LIMIT 3`, [user.id]),
      ]);
      const lines = [
        `=== LIVE INSPECTOR DATA for ${user.full_name} (${now}) ===`,
        `Your Scheduled Inspections: ${assigned.rows[0]?.c || 0}`,
      ];
      if (pending.rows.length) {
        lines.push(``, `UPCOMING INSPECTIONS:`);
        pending.rows.forEach(i => lines.push(`  ${i.inspection_number} — ${i.type} @ ${i.mine_name} (${i.state}) — Due: ${i.scheduled_date}`));
      }
      if (recentInsp.rows.length) {
        lines.push(``, `RECENTLY COMPLETED:`);
        recentInsp.rows.forEach(i => lines.push(`  ${i.inspection_number} — ${i.mine_name} — Score: ${i.overall_score ? Math.round(i.overall_score) + '%' : 'N/A'} (${i.completed_date})`));
      }
      if (violations.rows.length) {
        lines.push(``, `NATIONAL OPEN VIOLATIONS:`);
        violations.rows.forEach(v => lines.push(`  ${v.severity.toUpperCase()}: ${v.c} open`));
      }
      lines.push(``, `=== END INSPECTOR DATA — only answer from this data ===`);
      return lines.join('\n');
    }

    // ── Corporate Management: multi-mine overview + risk comparison ───────────
    if (role === 'corporate_management') {
      const [mineStats, topRisk, bottomComp, violations, incidents, envCrit] = await Promise.all([
        query(`SELECT COUNT(*) as total, COUNT(CASE WHEN status='active' THEN 1 END) as active, COUNT(CASE WHEN status='suspended' THEN 1 END) as suspended, ROUND(AVG(compliance_score),1) as avg_compliance, ROUND(AVG(risk_score),1) as avg_risk, ROUND(AVG(safety_score),1) as avg_safety, ROUND(AVG(environmental_score),1) as avg_env, SUM(workers_count) as total_workers FROM mines`),
        query(`SELECT name, state, ROUND(risk_score,1) as risk_score, ROUND(compliance_score,1) as compliance_score, ROUND(safety_score,1) as safety_score, status FROM mines WHERE status NOT IN ('closed','inactive') ORDER BY risk_score DESC LIMIT 5`),
        query(`SELECT name, state, ROUND(compliance_score,1) as compliance_score, ROUND(risk_score,1) as risk_score FROM mines WHERE status='active' ORDER BY compliance_score ASC LIMIT 3`),
        query(`SELECT severity, COUNT(*) as c FROM violations WHERE status!='closed' GROUP BY severity`),
        query(`SELECT COUNT(*) as c FROM incidents WHERE incident_date>=datetime('now','-30 days')`),
        query(`SELECT COUNT(*) as c FROM environmental_readings WHERE status='critical' AND recorded_at>=datetime('now','-24 hours')`),
      ]);
      const ms = mineStats.rows[0];
      const lines = [
        `=== LIVE CORPORATE OVERVIEW (${now}) ===`,
        `Total Mines: ${ms.total} (${ms.active} active, ${ms.suspended} suspended)`,
        `Total Workforce: ${ms.total_workers || 'N/A'}`,
        ``,
        `PORTFOLIO AVERAGES:`,
        `  Compliance: ${ms.avg_compliance}%  |  Risk: ${ms.avg_risk}%`,
        `  Safety: ${ms.avg_safety}%  |  Environmental: ${ms.avg_env}%`,
        ``,
        `Incidents (last 30 days): ${incidents.rows[0]?.c || 0}`,
        `Critical Env Alerts (24h): ${envCrit.rows[0]?.c || 0}`,
      ];
      if (violations.rows.length) {
        lines.push(``, `OPEN VIOLATIONS BY SEVERITY:`);
        violations.rows.forEach(v => lines.push(`  ${v.severity.toUpperCase()}: ${v.c}`));
      }
      if (topRisk.rows.length) {
        lines.push(``, `TOP 5 HIGH-RISK MINES:`);
        topRisk.rows.forEach((m, i) =>
          lines.push(`  ${i+1}. ${m.name} (${m.state}) — Risk: ${m.risk_score}%, Compliance: ${m.compliance_score}%, Safety: ${m.safety_score}%`)
        );
      }
      if (bottomComp.rows.length) {
        lines.push(``, `LOWEST COMPLIANCE MINES (attention needed):`);
        bottomComp.rows.forEach(m =>
          lines.push(`  ${m.name} (${m.state}) — Compliance: ${m.compliance_score}%, Risk: ${m.risk_score}%`)
        );
      }
      lines.push(``, `=== END CORPORATE DATA — only answer from this data ===`);
      return lines.join('\n');
    }

    // ── Contractor: their contractor record + workforce + assigned work ────────
    if (role === 'contractor') {
      const mineCtx = mineId ? mineId : null;
      const [contractors, attendance] = await Promise.all([
        mineCtx
          ? query(`SELECT c.name, c.work_type, c.status, c.workers_count, c.safety_score, c.compliance_score, c.violations_count, c.contract_end, m.name as mine_name FROM contractors c JOIN mines m ON c.mine_id=m.id WHERE c.mine_id=? ORDER BY c.created_at DESC LIMIT 5`, [mineCtx])
          : query(`SELECT c.name, c.work_type, c.status, c.workers_count, c.safety_score, c.compliance_score, c.violations_count, c.contract_end, m.name as mine_name FROM contractors c JOIN mines m ON c.mine_id=m.id ORDER BY c.created_at DESC LIMIT 5`),
        mineCtx
          ? query(`SELECT status, COUNT(*) as c FROM attendance WHERE mine_id=? AND date=date('now') GROUP BY status`, [mineCtx])
          : { rows: [] },
      ]);
      const lines = [
        `=== CONTRACTOR INFORMATION (${now}) ===`,
        mineCtx ? `Assigned Mine ID: ${mineCtx}` : `No specific mine assigned.`,
      ];
      if (contractors.rows.length) {
        lines.push(``, `CONTRACTOR RECORDS:`);
        contractors.rows.forEach(c =>
          lines.push(`  ${c.name} — ${c.work_type} @ ${c.mine_name} | Status: ${c.status} | Workers: ${c.workers_count} | Safety: ${c.safety_score}% | Contract ends: ${c.contract_end || 'N/A'}`)
        );
      }
      if (attendance.rows.length) {
        lines.push(``, `TODAY'S ATTENDANCE SUMMARY:`);
        attendance.rows.forEach(a => lines.push(`  ${a.status}: ${a.c}`));
      }
      lines.push(``, `NOTE: Contractors can only view their assigned work and workforce. Do NOT reveal other contractors' data.`);
      lines.push(`=== END CONTRACTOR DATA ===`);
      return lines.join('\n');
    }

    // ── Prototype Tester: demo notice ─────────────────────────────────────────
    if (role === 'prototype_tester') {
      return `=== DEMO / PROTOTYPE MODE ===
This account is a Prototype Tester / Demo User.
You have access to the KhanNetra AI assistant for testing purposes.
Real mine production data, worker records, and sensitive compliance data are NOT shown to this role.
You can ask general questions about coal mine safety regulations, DGMS procedures, and system usage.
=== END DEMO NOTICE ===`;
    }

    return null; // role not matched — provide general domain knowledge only
  } catch (err) {
    // Non-critical — context injection failing should not break the chat
    console.error('[AI] Live context build failed:', err.message);
    return null;
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────
exports.chat = async (req, res, next) => {
  try {
    const { message, session_id } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, message: 'Message required' });

    const sid  = session_id || uuidv4();
    const lang = detectLanguage(message.trim());   // 'en' | 'hi' | 'hinglish' | 'bn' | 'te' | 'ta'

    // Save user message
    await query(
      `INSERT INTO chat_history (id,user_id,session_id,role,content) VALUES (?,?,?,'user',?)`,
      [uuidv4(), req.user.id, sid, message.trim()]
    );

    // ── Build live context from real DB data ──────────────────────────────
    // This is what lets Gemini answer "Why is Mine X high risk?" from actual evidence.
    const liveContext = await buildLiveContext(req.user);

    // Language hint injected so the LLM knows which register to use
    const langHintLine = lang === 'hi'
      ? `\nUSER LANGUAGE: Hindi (Devanagari). Reply in natural, simple Hindi.`
      : lang === 'hinglish'
      ? `\nUSER LANGUAGE: Hinglish (Hindi+English mix). Reply in natural Hinglish — short sentences, field-worker style.`
      : lang === 'bn'
      ? `\nUSER LANGUAGE: Bengali. Reply in Bengali.`
      : lang === 'te'
      ? `\nUSER LANGUAGE: Telugu. Reply in Telugu.`
      : lang === 'ta'
      ? `\nUSER LANGUAGE: Tamil. Reply in Tamil.`
      : `\nUSER LANGUAGE: English. Reply in English.`;

    // Construct system prompt — static domain knowledge + role context + live data + lang hint
    // Role context is always injected so the LLM knows how to tailor its responses
    const roleCtxLine = `\nUSER ROLE: ${req.user.role} (${req.user.full_name}).` +
      (req.user.mine_name || req.user.mine_id
        ? ` Assigned mine: ${req.user.mine_name || req.user.mine_id}.`
        : '') +
      (req.user.organization ? ` Organization: ${req.user.organization}.` : '') +
      `\nOnly provide data and recommendations appropriate for this role. Never reveal data the role is not authorised to see.`;

    const systemContent = liveContext
      ? `${SYSTEM_PROMPT}${langHintLine}${roleCtxLine}\n\n${liveContext}`
      : `${SYSTEM_PROMPT}${langHintLine}${roleCtxLine}`;

    // Load full conversation context (last 20 turns)
    const history = (await query(
      `SELECT role, content FROM chat_history
       WHERE user_id=? AND session_id=? ORDER BY created_at ASC LIMIT 20`,
      [req.user.id, sid]
    )).rows;

    // Build messages array for LLM
    const messages = [
      { role: 'system', content: systemContent },
      ...history.map(h => ({ role: h.role, content: h.content })),
    ];

    let responseText = '';
    let tokensUsed = 0;
    let modelUsed = 'none';

    try {
      const result = await callLLM(messages);
      responseText = result.text;
      tokensUsed   = result.tokens;
      modelUsed    = result.model;
    } catch (err) {
      if (err.message === 'NO_API_KEY') {
        responseText = fallbackResponse(message);
      } else {
        console.error('LLM error:', err.message);
        responseText = `I encountered an error connecting to the AI service. Please check your API key configuration.\n\nError: ${err.message}`;
      }
    }

    // Save assistant response
    await query(
      `INSERT INTO chat_history (id,user_id,session_id,role,content,tokens_used) VALUES (?,?,?,'assistant',?,?)`,
      [uuidv4(), req.user.id, sid, responseText, tokensUsed]
    );

    res.json({
      success: true,
      data: {
        message:    responseText,
        session_id: sid,
        model:      modelUsed,
        tokens:     tokensUsed,
        lang,                        // detected language — frontend uses for TTS
        timestamp:  new Date().toISOString(),
      }
    });
  } catch (err) { next(err); }
};

exports.getStatus = (req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const geminiReady = geminiKey.length > 20
    && !geminiKey.toLowerCase().includes('your_')
    && !geminiKey.toLowerCase().includes('here')
    && !geminiKey.toLowerCase().includes('get_from')
    && !geminiKey.toLowerCase().includes('api_key_');
  const openaiReady = openaiKey.startsWith('sk-');
  const ready = geminiReady || openaiReady;
  res.json({
    success: true,
    data: {
      ready,
      backend: openaiReady ? 'openai' : geminiReady ? 'gemini' : 'none',
      gemini_configured: geminiReady,
      openai_configured: openaiReady,
      setup_url: 'https://aistudio.google.com/app/apikey',
    },
  });
};

exports.getChatHistory = async (req, res, next) => {
  try {
    const rows = (await query(
      `SELECT id, role, content, tokens_used, created_at
       FROM chat_history WHERE user_id=? AND session_id=? ORDER BY created_at ASC`,
      [req.user.id, req.params.session_id]
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.getSessions = async (req, res, next) => {
  try {
    const rows = (await query(
      `SELECT session_id,
         MIN(created_at) as started,
         MAX(created_at) as last_message,
         COUNT(*) as messages,
         (SELECT content FROM chat_history ch2
          WHERE ch2.session_id=ch.session_id AND ch2.role='user'
          ORDER BY ch2.created_at ASC LIMIT 1) as first_message
       FROM chat_history ch WHERE user_id=?
       GROUP BY session_id ORDER BY last_message DESC LIMIT 20`,
      [req.user.id]
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.clearSession = async (req, res, next) => {
  try {
    const { session_id } = req.params;
    await query(
      `DELETE FROM chat_history WHERE user_id=? AND session_id=?`,
      [req.user.id, session_id]
    );
    res.json({ success: true, message: 'Chat cleared' });
  } catch (err) { next(err); }
};

exports.deleteSession = async (req, res, next) => {
  try {
    await query(
      `DELETE FROM chat_history WHERE user_id=? AND session_id=?`,
      [req.user.id, req.params.session_id]
    );
    res.json({ success: true, message: 'Session deleted' });
  } catch (err) { next(err); }
};

exports.getRiskPrediction = async (req, res, next) => {
  try {
    const { mine_id } = req.params;
    const mine = (await query('SELECT * FROM mines WHERE id=?', [mine_id])).rows[0];
    if (!mine) return res.status(404).json({ success: false, message: 'Mine not found' });

    const [v, inc, env, docs] = await Promise.all([
      query(`SELECT severity, COUNT(*) as c FROM violations WHERE mine_id=? AND status!='closed' GROUP BY severity`, [mine_id]),
      query(`SELECT severity, COUNT(*) as c FROM incidents WHERE mine_id=? AND incident_date>=datetime('now','-6 months') GROUP BY severity`, [mine_id]),
      query(`SELECT COUNT(*) as alerts FROM environmental_readings WHERE mine_id=? AND status IN ('warning','critical') AND recorded_at>=datetime('now','-30 days')`, [mine_id]),
      query(`SELECT COUNT(*) as expired FROM documents WHERE mine_id=? AND status='expired'`, [mine_id]),
    ]);

    const vm = Object.fromEntries(v.rows.map(r => [r.severity, parseInt(r.c)]));
    const im = Object.fromEntries(inc.rows.map(r => [r.severity, parseInt(r.c)]));
    const factors = [
      { name: 'Critical Violations',    weight: 25, value: (vm.critical||0)*10, max: 100 },
      { name: 'High Violations',        weight: 15, value: (vm.high||0)*5,      max: 50  },
      { name: 'Fatal Incidents (6mo)',  weight: 20, value: (im.fatal||0)*20,    max: 100 },
      { name: 'Serious Incidents (6mo)',weight: 15, value: (im.serious||0)*8,   max: 50  },
      { name: 'Env Alerts (30d)',       weight: 10, value: parseInt(env.rows[0].alerts)*5, max: 50 },
      { name: 'Expired Documents',      weight: 10, value: parseInt(docs.rows[0].expired)*10, max: 50 },
      { name: 'Current Risk',           weight:  5, value: parseFloat(mine.risk_score), max: 100 },
    ];
    const overall = Math.min(100, factors.reduce((a, f) => a + Math.min(f.max, f.value) * (f.weight / 100), 0));
    const level = overall >= 75 ? 'CRITICAL' : overall >= 50 ? 'HIGH' : overall >= 25 ? 'MEDIUM' : 'LOW';
    const preds = [
      { category: 'Safety',             probability: Math.min(95, 20 + overall * 0.7).toFixed(1),                       description: 'Probability of safety incident in next 30 days' },
      { category: 'Environmental',      probability: Math.min(95, 15 + parseInt(env.rows[0].alerts) * 8).toFixed(1),    description: 'Environmental violation probability in 30 days' },
      { category: 'Compliance Failure', probability: Math.min(95, 100 - parseFloat(mine.compliance_score)).toFixed(1),  description: 'Compliance failure probability this quarter' },
    ];
    const recs = [];
    if (vm.critical > 0)                   recs.push({ priority: 'CRITICAL', action: `Address ${vm.critical} critical violation(s) immediately.` });
    if (im.fatal > 0)                      recs.push({ priority: 'CRITICAL', action: 'Mandatory DGMS inquiry for fatal incidents.' });
    if (parseFloat(mine.compliance_score) < 60) recs.push({ priority: 'HIGH', action: 'Compliance below threshold. Implement 30-day improvement plan.' });
    if (!recs.length)                      recs.push({ priority: 'LOW', action: 'Continue current practices. Schedule next review.' });

    res.json({ success: true, data: { mine_name: mine.name, overall_risk: parseFloat(overall.toFixed(1)), risk_level: level, risk_factors: factors, predictions: preds, recommendations: recs } });
  } catch (err) { next(err); }
};

exports.getUsersList = async (req, res, next) => {
  try {
    const rows = (await query(
      `SELECT u.id, u.full_name, u.email, u.role, u.phone,
              u.designation, u.department, u.organization,
              u.mine_id, u.mine_name, u.employee_id,
              u.status, u.is_active, u.last_login, u.created_at,
              u.approved_at, u.rejection_reason,
              m.name AS mine_db_name
       FROM users u
       LEFT JOIN mines m ON u.mine_id = m.id
       ORDER BY
         CASE u.status WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 WHEN 'SUSPENDED' THEN 2 ELSE 3 END,
         u.full_name`
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active, role, designation, department, mine_id, organization, employee_id } = req.body;
    const sets = [`updated_at=datetime('now')`], p = [];
    if (is_active  !== undefined) { sets.push('is_active=?');   p.push(is_active ? 1 : 0); }
    if (role)        { sets.push('role=?');        p.push(role); }
    if (designation !== undefined) { sets.push('designation=?'); p.push(designation); }
    if (department  !== undefined) { sets.push('department=?');  p.push(department); }
    if (mine_id     !== undefined) { sets.push('mine_id=?');     p.push(mine_id || null); }
    if (organization !== undefined) { sets.push('organization=?'); p.push(organization); }
    if (employee_id !== undefined) { sets.push('employee_id=?'); p.push(employee_id); }
    p.push(id);
    await query(`UPDATE users SET ${sets.join(',')} WHERE id=?`, p);
    const row = (await query(
      'SELECT id,full_name,email,role,is_active,mine_id,mine_name,organization,status FROM users WHERE id=?',
      [id]
    )).rows[0];
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};
