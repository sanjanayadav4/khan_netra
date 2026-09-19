/**
 * KhanNetra AI Chat
 * Multilingual voice + text assistant for Indian coal mine workers.
 * Supports: English · Hindi · Hinglish · Bengali · Marathi · Telugu · Tamil
 * Auto-detects language from typed/spoken input.
 * All existing English + Gemini functionality preserved.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  FiSend, FiPlus, FiTrash2, FiMessageSquare, FiCpu,
  FiUser, FiChevronLeft, FiChevronRight,
  FiCopy, FiCheck, FiAlertCircle, FiRefreshCw, FiGlobe,
  FiMic, FiMicOff, FiVolume2, FiVolumeX, FiAlertTriangle,
} from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import { aiApi } from '../../services/api';
import useAuthStore from '../../store/authStore';
import { timeAgo } from '../../utils/helpers';
import toast from 'react-hot-toast';
import clsx from 'clsx';

/* ── helpers ─────────────────────────────────────────────────────────────── */
const newId = () => crypto.randomUUID();

/* ── Language config ─────────────────────────────────────────────────────── */
const LANGS = [
  { code: 'auto',     label: 'Auto Detect', flag: '🔍', srLang: 'hi-IN', ttsLang: 'hi-IN' },
  { code: 'hinglish', label: 'Hinglish',    flag: '🇮🇳', srLang: 'hi-IN', ttsLang: 'hi-IN' },
  { code: 'en',       label: 'English',     flag: '🇬🇧', srLang: 'en-IN', ttsLang: 'en-IN' },
  { code: 'hi',       label: 'हिंदी',       flag: '🇮🇳', srLang: 'hi-IN', ttsLang: 'hi-IN' },
  { code: 'bn',       label: 'বাংলা',       flag: '🇧🇩', srLang: 'bn-IN', ttsLang: 'bn-IN' },
  { code: 'mr',       label: 'मराठी',       flag: '🇮🇳', srLang: 'mr-IN', ttsLang: 'mr-IN' },
  { code: 'te',       label: 'తెలుగు',      flag: '🇮🇳', srLang: 'te-IN', ttsLang: 'te-IN' },
  { code: 'ta',       label: 'தமிழ்',       flag: '🇮🇳', srLang: 'ta-IN', ttsLang: 'ta-IN' },
];

const LANG_TO_TTS = {
  en: 'en-IN', hi: 'hi-IN', hinglish: 'hi-IN',
  bn: 'bn-IN', mr: 'mr-IN', te: 'te-IN', ta: 'ta-IN',
};
const LANG_TO_SR = {
  en: 'en-IN', hi: 'hi-IN', hinglish: 'hi-IN',
  bn: 'bn-IN', mr: 'mr-IN', te: 'te-IN', ta: 'ta-IN',
};

/* Client-side language detection (mirrors backend heuristic) */
function detectLangClient(text) {
  if (!text) return 'en';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  const hw = ['kya','hai','hain','karo','karna','kab','kyun','kaun','kaha',
    'kitne','kitna','mein','ka','ki','ke','ko','se','bhi','nahi','sirf',
    'aaj','kal','abhi','bahut','thoda','zyada','sab','koi','aur','lekin',
    'toh','pe','par','wala','wali','wale','laga','lagao','bata','batao',
    'dikhao','check','chahiye','hoga','hogi','tha','thi','the','ho','do',
    'lo','dena','lena','mujhe','tumhe','apna','apni','yahan','wahan',
    'bilkul','zaroor','haan','nahin','theek','accha','bhaiya','sahib',
    'attendance','present','absent','mark','shift','mine','worker',
    'helmet','safety','status','report','inspection'];
  const words = text.toLowerCase().split(/\s+/);
  const c = words.filter(w => hw.includes(w)).length;
  if (c >= 2 || (words.length > 3 && c / words.length > 0.15)) return 'hinglish';
  return 'en';
}

/* Detect bulk safety actions that need confirmation */
function detectBulkAction(text) {
  const patterns = [
    { re: /sab(hi)?\s*(ko|workers?)?\s*absent\s*(mark|kar)/i,   msg: 'sabhi workers ko ABSENT mark' },
    { re: /mark\s*all\s*(workers?\s*)?absent/i,                  msg: 'all workers ABSENT' },
    { re: /sab(hi)?\s*(ko|workers?)?\s*present\s*(mark|kar)/i,  msg: 'sabhi workers ko PRESENT mark' },
    { re: /mark\s*all\s*(workers?\s*)?present/i,                 msg: 'all workers PRESENT' },
    { re: /sabko\s*(absent|present)\s*(karo?|mark)/i,            msg: 'sabhi workers ki attendance mark' },
  ];
  for (const p of patterns) {
    if (p.re.test(text)) return p.msg;
  }
  return null;
}

/* Voice intent map — Hinglish + English common phrases */
const VOICE_INTENTS = [
  { p: [/attendance\s*(laga|lagao|kar|karo|check|dekho)/i, /aaj\s*ka\s*attendance/i, /attendance\s*(mark|dikhao)/i], q: 'Aaj ka attendance status kya hai?' },
  { p: [/present\s*(kitne|count|hain|hai)/i, /kitne\s*(workers?)?\s*present/i, /kaun\s*present/i], q: 'Kitne workers aaj present hain?' },
  { p: [/absent\s*(kitne|kaun|hain|hai)/i, /kitne\s*(workers?)?\s*absent/i], q: 'Kitne workers absent hain aaj?' },
  { p: [/kal\s*ka\s*(attendance|report)/i, /yesterday.*attendance/i], q: 'Kal ka attendance report dikhao.' },
  { p: [/helmet\s*(nahi|nahin|nahi\s*pehna)/i, /bina\s*helmet/i, /no\s*helmet/i], q: 'Worker ne helmet nahi pehna hai, kya karna chahiye?' },
  { p: [/gas\s*(level|normal|check|kya\s*hai)/i, /methane\s*(level|status)/i], q: 'Mine mein gas level normal hai kya? Permissible limit kya hai?' },
  { p: [/ventilation\s*(status|kya\s*hai|check)/i, /hawa\s*(ka|ki)\s*status/i], q: 'Mine ka ventilation status kya hai?' },
  { p: [/emergency\s*(kya|karo|procedure)/i, /haadsa\s*(hua|ho\s*gaya)/i, /accident\s*(hua|ho)/i], q: 'Mine mein emergency ya accident ke liye kya procedure hai?' },
  { p: [/PPE\s*(kya|mandatory|chahiye)/i, /safety\s*(equipment|gear)/i], q: 'Underground workers ke liye kaunsa PPE mandatory hai?' },
  { p: [/compliance\s*(status|kya\s*hai|check)/i, /pending\s*compliance/i], q: 'Compliance status aur pending actions kya hain?' },
  { p: [/inspection\s*(status|schedule|kab)/i], q: 'Safety inspection ka status aur schedule kya hai?' },
  { p: [/violation\s*(kya|dikhao|pending)/i, /open\s*violations/i], q: 'Open safety violations kya hain?' },
  { p: [/show\s*(high.risk|critical)\s*violations/i], q: 'Show all high-risk and critical violations' },
  { p: [/open\s*incidents/i], q: 'Show all open safety incidents' },
  { p: [/fatal\s*accident\s*report/i], q: 'How should a fatal accident be reported to DGMS?' },
  { p: [/methane\s*limit/i, /methane\s*permissible/i], q: 'What is the permissible methane limit in underground coal mines?' },
  { p: [/inspection\s*schedule/i], q: 'What is the inspection schedule requirement under CMR 2017?' },
];

function matchVoiceIntent(transcript) {
  for (const intent of VOICE_INTENTS) {
    if (intent.p.some(re => re.test(transcript))) return intent.q;
  }
  return null;
}

/* TTS language selector */
function getTtsLang(detectedLang, uiLang) {
  if (uiLang && uiLang !== 'auto') {
    return LANGS.find(l => l.code === uiLang)?.ttsLang || 'hi-IN';
  }
  return LANG_TO_TTS[detectedLang] || 'hi-IN';
}

/* SR language selector */
function getSrLang(uiLang, detectedLang) {
  if (uiLang && uiLang !== 'auto') {
    return LANGS.find(l => l.code === uiLang)?.srLang || 'hi-IN';
  }
  return LANG_TO_SR[detectedLang] || 'hi-IN';
}

/* Strip markdown/URLs for clean TTS */
function stripForTts(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[`_~]/g, '')
    .trim()
    .substring(0, 450);
}

/* ── Starter questions ───────────────────────────────────────────────────── */
const STARTERS = [
  { en: 'What is the permissible methane limit in underground mines?',    hin: 'Bhoomigat mine mein methane ki permissible limit kya hai?' },
  { en: 'Explain ventilation requirements under CMR 2017',               hin: 'CMR 2017 ke anusaar ventilation requirements kya hain?' },
  { en: 'How to report a fatal accident to DGMS?',                       hin: 'DGMS ko fatal accident ki report kaise karein?' },
  { en: 'What PPE is mandatory for underground workers?',                hin: 'Underground workers ke liye kaunsa PPE mandatory hai?' },
  { en: 'What are NAAQS air quality standards for coal mines?',          hin: 'Coal mines ke liye NAAQS air quality standards kya hain?' },
  { en: 'Explain compliance scoring methodology for mines',              hin: 'Mines ke liye compliance scoring kaise hoti hai?' },
];

/* ── UI sub-components ───────────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span key={i}
          className="w-2 h-2 rounded-full bg-primary-400 animate-bounce"
          style={{ animationDelay: `${i * 0.18}s`, animationDuration: '0.9s' }}
        />
      ))}
    </div>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-coal-200 text-coal-400 transition-colors" title="Copy">
      {copied ? <FiCheck size={13} className="text-green-500" /> : <FiCopy size={13} />}
    </button>
  );
}

function MessageBubble({ msg }) {
  const isUser  = msg.role === 'user';
  const isError = msg.error;
  return (
    <div className={clsx('group flex gap-3 px-2', isUser ? 'flex-row-reverse' : '')}>
      <div className={clsx(
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm',
        isUser ? 'bg-primary-600' : isError ? 'bg-red-500' : 'bg-gradient-to-br from-coal-700 to-coal-900'
      )}>
        {isUser
          ? <FiUser size={14} className="text-white" />
          : isError ? <FiAlertCircle size={14} className="text-white" />
          : <FiCpu size={14} className="text-white" />}
      </div>
      <div className={clsx('max-w-[78%] flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        <div className={clsx(
          'rounded-2xl px-4 py-3 shadow-sm',
          isUser    ? 'bg-primary-600 text-white rounded-tr-sm'
          : isError ? 'bg-red-50 border border-red-200 text-red-800 rounded-tl-sm'
          :           'bg-white border border-coal-100 text-coal-900 rounded-tl-sm'
        )}>
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <div className="text-sm leading-relaxed prose prose-sm max-w-none
              prose-headings:text-coal-800 prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1
              prose-p:my-1 prose-ul:my-1 prose-li:my-0.5
              prose-strong:text-coal-900 prose-code:bg-coal-100 prose-code:px-1 prose-code:rounded">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-coal-400">
            {msg.ts ? new Date(msg.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
          {!isUser && msg.model && (
            <span className="text-[10px] text-coal-300 font-mono">{msg.model}</span>
          )}
          {!isUser && msg.lang && msg.lang !== 'en' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-coal-100 text-coal-400 font-semibold uppercase">
              {msg.lang}
            </span>
          )}
          {!isUser && !isError && (
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyBtn text={msg.content} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionItem({ session, active, onSelect, onDelete }) {
  const preview = session.first_message || 'New conversation';
  return (
    <div
      onClick={() => onSelect(session.session_id)}
      className={clsx(
        'group flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-all',
        active ? 'bg-primary-600/20 border border-primary-500/30' : 'hover:bg-coal-700'
      )}
    >
      <FiMessageSquare size={14} className={clsx('shrink-0 mt-0.5', active ? 'text-primary-400' : 'text-coal-400')} />
      <div className="flex-1 min-w-0">
        <p className={clsx('text-xs font-medium truncate', active ? 'text-primary-200' : 'text-coal-300')}>
          {preview.length > 45 ? preview.substring(0, 45) + '…' : preview}
        </p>
        <p className="text-[10px] text-coal-500 mt-0.5">
          {session.messages} msgs · {timeAgo(session.last_message)}
        </p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(session.session_id); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-coal-500 hover:text-red-400 transition-all"
      >
        <FiTrash2 size={12} />
      </button>
    </div>
  );
}

/* Bulk action confirmation modal */
function BulkConfirmDialog({ action, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <FiAlertTriangle size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="font-bold text-coal-900">Confirm / Confirm kijiye</p>
            <p className="text-sm text-coal-600 mt-1">
              Please confirm: kya aap <strong className="text-coal-900">{action}</strong> karna chahte hain?
            </p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-coal-600 hover:bg-coal-100 transition-colors"
          >
            Cancel / Nahi
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            Yes, Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════════════ */
export default function AIChat() {
  const { user } = useAuthStore();

  /* state */
  const [messages,       setMessages]       = useState([]);
  const [input,          setInput]          = useState('');
  const [loading,        setLoading]        = useState(false);
  const [sessionId,      setSessionId]      = useState(() => newId());
  const [sessions,       setSessions]       = useState([]);
  const [sidebarOpen,    setSidebarOpen]    = useState(true);
  const [uiLang,         setUiLang]         = useState('auto');    // user's explicit choice
  const [detectedLang,   setDetectedLang]   = useState('en');      // last auto-detected
  const [aiStatus,       setAiStatus]       = useState(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceOutput,    setVoiceOutput]    = useState(true);
  const [bulkConfirm,    setBulkConfirm]    = useState(null);      // { action, pendingMsg }

  /* refs */
  const bottomRef      = useRef(null);
  const inputRef       = useRef(null);
  const recognitionRef = useRef(null);
  const synthRef       = useRef(window.speechSynthesis);

  /* scroll to bottom */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  /* load sessions + AI status on mount */
  useEffect(() => {
    loadSessions();
    fetch('/api/v1/ai/status', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then(r => { if (r.success) setAiStatus(r.data); })
      .catch(() => {});
  }, []);

  /* focus input on session change */
  useEffect(() => { inputRef.current?.focus(); }, [sessionId]);

  /* cleanup speech synthesis on unmount */
  useEffect(() => () => synthRef.current?.cancel(), []);

  /* helpers */
  const loadSessions = async () => {
    try {
      const r = await aiApi.getSessions();
      setSessions(r.data || []);
    } catch {}
  };

  const loadHistory = async (sid) => {
    try {
      const r = await aiApi.getChatHistory(sid);
      setMessages(
        (r.data || []).map(m => ({
          id: m.id || newId(), role: m.role,
          content: m.content, model: null, ts: m.created_at,
        }))
      );
    } catch {}
  };

  const newChat = () => {
    setSessionId(newId());
    setMessages([]);
    inputRef.current?.focus();
  };

  const selectSession = async (sid) => {
    setSessionId(sid);
    setMessages([]);
    await loadHistory(sid);
  };

  const deleteSession = async (sid) => {
    try {
      await aiApi.deleteSession(sid);
      toast.success('Chat deleted');
      setSessions(prev => prev.filter(s => s.session_id !== sid));
      if (sid === sessionId) newChat();
    } catch {}
  };

  const clearChat = async () => {
    try {
      await aiApi.clearSession(sessionId);
      setMessages([]);
      toast.success('Chat cleared');
      loadSessions();
    } catch {}
  };

  /* TTS speak — picks best Indian voice available */
  const speak = useCallback((text, respLang) => {
    if (!voiceOutput || !synthRef.current) return;
    synthRef.current.cancel();
    const plain = stripForTts(text);
    const utt   = new SpeechSynthesisUtterance(plain);
    utt.lang    = getTtsLang(respLang || detectedLang, uiLang);
    utt.rate    = 0.90;
    utt.pitch   = 1;
    // Prefer an Indian voice if available
    const voices = synthRef.current.getVoices();
    const indVoice =
      voices.find(v => v.lang === utt.lang && v.name.toLowerCase().includes('india')) ||
      voices.find(v => v.lang === utt.lang) ||
      voices.find(v => v.lang.startsWith('hi'));
    if (indVoice) utt.voice = indVoice;
    synthRef.current.speak(utt);
  }, [voiceOutput, detectedLang, uiLang]);

  /* core send */
  const send = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');

    const clientLang = detectLangClient(msg);
    if (uiLang === 'auto') setDetectedLang(clientLang);

    setMessages(prev => [
      ...prev,
      { id: newId(), role: 'user', content: msg, ts: new Date().toISOString() },
    ]);
    setLoading(true);

    try {
      const res  = await aiApi.chat({ message: msg, session_id: sessionId });
      const d    = res.data ?? res;
      const respLang = d.lang || clientLang;
      if (uiLang === 'auto') setDetectedLang(respLang);

      setMessages(prev => [
        ...prev,
        {
          id: newId(), role: 'assistant', content: d.message,
          model: d.model && d.model !== 'none' ? d.model : null,
          tokens: d.tokens, lang: respLang, ts: d.timestamp,
        },
      ]);
      loadSessions();
      speak(d.message, respLang);
    } catch (err) {
      const errMsg = err.response?.data?.message ||
        (detectedLang === 'en'
          ? 'Something went wrong. Please try again.'
          : 'Kuch galat hua. Please dobara try karein.');
      setMessages(prev => [
        ...prev,
        { id: newId(), role: 'assistant', content: errMsg, error: true, ts: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId, speak, uiLang, detectedLang]);

  /* handleSend — intercepts bulk actions for confirmation */
  const handleSend = useCallback(() => {
    const msg = input.trim();
    if (!msg) return;
    const bulk = detectBulkAction(msg);
    if (bulk) {
      setBulkConfirm({ action: bulk, pendingMsg: msg });
      return;
    }
    send(msg);
  }, [input, send]);

  /* voice input */
  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Voice input not supported in this browser'); return; }

    const r = new SR();
    r.continuous     = false;
    r.interimResults = false;
    r.lang = getSrLang(uiLang, detectedLang);

    r.onstart = () => {
      setVoiceListening(true);
      const listeningMsg = (detectedLang === 'hinglish' || detectedLang === 'hi')
        ? '🎙️ Bol dijiye…'
        : '🎙️ Listening…';
      toast(listeningMsg, { icon: '🎤', duration: 3000 });
    };

    r.onend = () => setVoiceListening(false);

    r.onerror = e => {
      setVoiceListening(false);
      if (e.error === 'no-speech') {
        const retry = (detectedLang === 'hinglish' || detectedLang === 'hi')
          ? 'Kuch sunai nahi diya. Dobara boliye.'
          : 'No speech detected. Please try again.';
        toast(retry, { icon: '🎤' });
      } else if (e.error !== 'aborted') {
        toast.error(`Voice error: ${e.error}`);
      }
    };

    r.onresult = e => {
      const transcript = e.results[0][0].transcript.trim();
      if (!transcript) return;
      const intent    = matchVoiceIntent(transcript);
      const finalText = intent || transcript;
      setInput(finalText);
      const bulk = detectBulkAction(finalText);
      if (bulk) {
        setBulkConfirm({ action: bulk, pendingMsg: finalText });
      } else if (intent) {
        setTimeout(() => send(finalText), 300);
      }
    };

    recognitionRef.current = r;
    r.start();
  }, [uiLang, detectedLang, send]);

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setVoiceListening(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  /* derived */
  const hasMessages      = messages.length > 0;
  const currentLangCfg   = LANGS.find(l => l.code === uiLang) || LANGS[0];
  const effectiveLang    = uiLang === 'auto' ? detectedLang : uiLang;
  const isHindi          = effectiveLang === 'hi' || effectiveLang === 'hinglish';

  const placeholderText = voiceListening
    ? '🎙️ Sun rahi hoon… boliye apna sawaal'
    : uiLang === 'hi'
      ? 'Hindi mein apna sawaal likhiye…'
      : uiLang === 'hinglish'
        ? 'Hindi ya English mein poochh sakte hain…'
        : uiLang === 'auto'
          ? 'Ask in English, Hindi or Hinglish… (Enter to send)'
          : 'Ask about CMR 2017, safety, compliance… (Enter to send)';

  /* ── render ──────────────────────────────────────────────────────────── */
  return (
    <div className="flex h-[calc(100vh-80px)] gap-0 rounded-2xl overflow-hidden border border-coal-200 shadow-lg bg-white">

      {/* SIDEBAR */}
      <aside className={clsx(
        'flex flex-col bg-coal-900 transition-all duration-300 shrink-0',
        sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
      )}>
        {/* header */}
        <div className="flex items-center justify-between p-4 border-b border-coal-700 shrink-0">
          <div className="flex items-center gap-2">
            <FiCpu size={16} className="text-primary-400" />
            <span className="text-sm font-bold text-white">Chat History</span>
          </div>
          <button onClick={loadSessions} className="p-1 rounded hover:bg-coal-700 text-coal-400" title="Refresh">
            <FiRefreshCw size={13} />
          </button>
        </div>

        {/* new chat */}
        <div className="p-3 shrink-0">
          <button onClick={newChat}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold transition-colors">
            <FiPlus size={16} /> New Chat
          </button>
        </div>

        {/* sessions list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          {sessions.length === 0
            ? <p className="text-xs text-coal-500 text-center py-6">No previous chats</p>
            : sessions.map(s => (
              <SessionItem
                key={s.session_id} session={s}
                active={s.session_id === sessionId}
                onSelect={selectSession} onDelete={deleteSession}
              />
            ))}
        </div>

        {/* language selector */}
        <div className="p-3 border-t border-coal-700 shrink-0">
          <div className="flex items-center gap-1.5 mb-2">
            <FiGlobe size={11} className="text-coal-500" />
            <span className="text-[10px] text-coal-500 uppercase tracking-wide font-semibold">
              Language / Bhasha
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {LANGS.map(l => (
              <button key={l.code} onClick={() => setUiLang(l.code)}
                className={clsx(
                  'px-2 py-1 rounded text-[10px] font-medium transition-colors',
                  uiLang === l.code
                    ? 'bg-primary-600 text-white'
                    : 'bg-coal-700 text-coal-400 hover:bg-coal-600'
                )}>
                {l.flag} {l.code === 'auto' ? 'Auto' : l.code === 'hinglish' ? 'Hinglish' : l.label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-coal-600 mt-1.5">
            {uiLang === 'auto'
              ? `Auto-detect ON · Last: ${LANGS.find(l => l.code === detectedLang)?.label || 'English'}`
              : `Selected: ${currentLangCfg.label}`}
          </p>
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <div className="flex flex-col flex-1 min-w-0 bg-coal-50">

        {/* toolbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-coal-200 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(o => !o)}
              className="p-1.5 rounded-lg hover:bg-coal-100 text-coal-500 transition-colors">
              {sidebarOpen ? <FiChevronLeft size={18} /> : <FiChevronRight size={18} />}
            </button>
            <div>
              <h2 className="font-bold text-coal-900 text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                KhanNetra AI
              </h2>
              <p className="text-[10px] text-coal-400">
                Gemini · English · Hindi · Hinglish · Multilingual
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick lang switch in toolbar */}
            <div className="hidden sm:flex items-center gap-0.5 bg-coal-50 border border-coal-200 rounded-lg px-1.5 py-1">
              {LANGS.slice(0, 4).map(l => (
                <button key={l.code} onClick={() => setUiLang(l.code)} title={l.label}
                  className={clsx(
                    'px-2 py-0.5 rounded text-[10px] font-semibold transition-colors',
                    uiLang === l.code ? 'bg-primary-600 text-white' : 'text-coal-500 hover:text-coal-800'
                  )}>
                  {l.flag} {l.code === 'auto' ? 'Auto' : l.code === 'hinglish' ? 'HG' : l.code.toUpperCase()}
                </button>
              ))}
            </div>
            {hasMessages && (
              <button onClick={clearChat}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-coal-600 hover:bg-red-50 hover:text-red-600 border border-coal-200 transition-colors">
                <FiTrash2 size={13} /> Clear
              </button>
            )}
            <button onClick={newChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors">
              <FiPlus size={13} /> New Chat
            </button>
          </div>
        </div>

        {/* messages */}
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-5">
          {!hasMessages && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 -mt-4">

              {/* API key banner */}
              {aiStatus && !aiStatus.ready && (
                <div className="w-full max-w-2xl mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">🔑</span>
                    <div>
                      <p className="font-bold text-amber-400 mb-1">Gemini API Key Required</p>
                      <p className="text-sm text-coal-400 mb-3">
                        Add a free key to <code className="bg-coal-800 px-1.5 py-0.5 rounded text-amber-300">server/.env</code>:
                      </p>
                      <div className="bg-coal-900 rounded-lg p-3 font-mono text-xs text-green-400 mb-3 select-all">
                        GEMINI_API_KEY=AIzaSyYourKeyHere
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-coal-950 rounded-lg text-xs font-bold hover:bg-amber-400 transition-colors">
                          🚀 Get Free Gemini Key
                        </a>
                        <span className="text-xs text-coal-500">Then restart the server</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Connected banner */}
              {aiStatus?.ready && (
                <div className="w-full max-w-2xl mb-4 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                  <span className="text-xs text-green-400 font-medium">
                    AI Connected · {aiStatus.backend === 'gemini' ? 'Google Gemini' : 'OpenAI GPT-4o'}
                    {' '}· English + Hindi + Hinglish ready
                  </span>
                </div>
              )}

              {/* Logo + intro */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-600 to-coal-800 flex items-center justify-center mb-4 shadow-lg">
                <FiCpu size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-black text-coal-900 mb-1">KhanNetra AI</h2>
              <p className="text-coal-500 text-sm mb-1">Coal mine assistant — English · Hindi · Hinglish</p>
              <p className="text-coal-400 text-xs mb-1">
                🎙️ Bol sakte hain: <em>"Aaj ka attendance kya hai?"</em> ya <em>"Ventilation status batao"</em>
              </p>
              <p className="text-coal-300 text-[11px] mb-6">
                Or type in any language — AI auto-detects and replies in the same language
              </p>

              {/* Starter questions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {STARTERS.map((s, i) => (
                  <button key={i}
                    onClick={() => send(isHindi ? s.hin : s.en)}
                    className="text-left p-3 rounded-xl border border-coal-200 bg-white hover:border-primary-400 hover:bg-primary-50 transition-all text-xs text-coal-700 font-medium group shadow-sm">
                    <span className="text-primary-500 mr-1.5 group-hover:mr-2 transition-all">→</span>
                    {isHindi ? s.hin : s.en}
                  </button>
                ))}
              </div>

              {/* Supported languages */}
              <div className="flex items-center gap-3 mt-5 text-[10px] text-coal-400 flex-wrap justify-center">
                <span>🇬🇧 English</span>
                <span>🇮🇳 हिंदी</span>
                <span>🇮🇳 Hinglish</span>
                <span>🇧🇩 বাংলা</span>
                <span>🇮🇳 मराठी</span>
                <span>🇮🇳 తెలుగు</span>
                <span>🇮🇳 தமிழ்</span>
              </div>
            </div>
          )}

          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

          {loading && (
            <div className="flex gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-coal-700 to-coal-900 flex items-center justify-center shrink-0 mt-1">
                <FiCpu size={14} className="text-white" />
              </div>
              <div className="bg-white border border-coal-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* input area */}
        <div className="px-4 pb-4 pt-2 bg-white border-t border-coal-200 shrink-0">
          <div className="flex items-end gap-3 bg-coal-50 border border-coal-200 rounded-2xl px-4 py-3 focus-within:border-primary-400 focus-within:shadow-sm transition-all">

            {/* mic */}
            <button type="button"
              onClick={voiceListening ? stopVoice : startVoice}
              title={voiceListening ? 'Stop' : 'Voice — Hindi/Hinglish/English'}
              className={clsx(
                'p-1.5 rounded-lg shrink-0 transition-all mb-0.5',
                voiceListening ? 'bg-red-100 text-red-500 animate-pulse' : 'text-coal-400 hover:text-coal-600 hover:bg-coal-200'
              )}>
              {voiceListening ? <FiMicOff size={16} /> : <FiMic size={16} />}
            </button>

            {/* textarea */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              className="flex-1 bg-transparent text-sm text-coal-900 placeholder-coal-400 resize-none outline-none max-h-32 leading-relaxed"
              placeholder={placeholderText}
              disabled={loading}
              style={{ height: 'auto', minHeight: '24px' }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
            />

            {/* voice output toggle */}
            <button type="button"
              onClick={() => { setVoiceOutput(v => !v); synthRef.current?.cancel(); }}
              title={voiceOutput ? 'Mute AI voice' : 'Enable AI voice'}
              className={clsx(
                'p-1.5 rounded-lg shrink-0 transition-all mb-0.5',
                voiceOutput ? 'text-primary-500' : 'text-coal-400 hover:text-coal-600'
              )}>
              {voiceOutput ? <FiVolume2 size={16} /> : <FiVolumeX size={16} />}
            </button>

            {/* send */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <FiSend size={16} />}
            </button>
          </div>

          <p className="text-[10px] text-coal-400 text-center mt-2">
            KhanNetra AI ·{' '}
            <span className="text-coal-500">🎙️ Hindi · Hinglish · English voice supported</span>
            {' '}· Always verify with official DGMS sources
          </p>
        </div>
      </div>

      {/* Bulk action confirmation dialog */}
      {bulkConfirm && (
        <BulkConfirmDialog
          action={bulkConfirm.action}
          onConfirm={() => {
            const m = bulkConfirm.pendingMsg;
            setBulkConfirm(null);
            send(m);
          }}
          onCancel={() => setBulkConfirm(null)}
        />
      )}
    </div>
  );
}
