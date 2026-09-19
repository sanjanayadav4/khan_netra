/**
 * KhanNetra DGMS – Login Page
 * Visual reference: cinematic open-pit mine hero (left 63%) + dark glass card (right 37%)
 * Auth logic: useAuthStore → authApi.login → JWT (unchanged)
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import useAuthStore from '../../store/authStore';
import { authApi } from '../../services/api';
import toast from 'react-hot-toast';

/* ── icon SVGs inlined so we avoid any import issues ─────────────── */
const IconShield   = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IconUser     = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IconLock     = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IconEye      = () => <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconEyeOff   = () => <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
const IconZap      = () => <svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IconMapPin   = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
const IconCpu      = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>;
const IconActivity = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const IconCheck    = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>;

/* ── Demo accounts ────────────────────────────────────────────────── */
const DEMOS = [
  { role: 'Admin',          email: 'admin@khannetra.gov.in',      label: 'DGMS Director'   },
  { role: 'Govt Officer',   email: 'officer1@khannetra.gov.in',   label: 'Joint Secretary' },
  { role: 'Mine Manager',   email: 'manager1@khannetra.gov.in',   label: 'Jharia Mine'     },
  { role: 'Inspector',      email: 'inspector1@khannetra.gov.in', label: 'DGMS Region-2'   },
  { role: 'Safety Officer', email: 'safety1@khannetra.gov.in',    label: 'Safety Dept.'    },
  { role: 'Env Officer',    email: 'env1@khannetra.gov.in',       label: 'CPCB Officer'    },
];

const FEATURES = [
  { Icon: IconMapPin,   value: '6+',   label: 'Mines Monitored'    },
  { Icon: IconCpu,      value: 'AI',   label: 'Risk Prediction'    },
  { Icon: IconActivity, value: 'Live', label: 'Environmental Data' },
  { Icon: IconCheck,    value: 'DGMS', label: 'Regulatory Aligned' },
];

/* ── Colour tokens ────────────────────────────────────────────────── */
const C = {
  bg:         '#060e1c',
  bgR:        '#091220',
  card:       'rgba(255,255,255,.045)',
  cardBorder: 'rgba(255,255,255,.10)',
  amber:      '#f59e0b',
  amberGlow:  'rgba(245,158,11,.35)',
  amberSub:   'rgba(245,158,11,.13)',
  amberBdr:   'rgba(245,158,11,.28)',
  text:       '#edf2f7',
  textMid:    'rgba(255,255,255,.5)',
  textLow:    'rgba(255,255,255,.28)',
  textTiny:   'rgba(255,255,255,.18)',
  green:      '#22c55e',
  blue:       '#60a5fa',
  danger:     '#f87171',
  inp:        'rgba(255,255,255,.06)',
  inpBdr:     'rgba(255,255,255,.13)',
};

/* ── Shared input focus/blur helpers ─────────────────────────────── */
const onFocusAmber = e => {
  e.target.style.borderColor = 'rgba(245,158,11,.55)';
  e.target.style.boxShadow   = '0 0 0 3px rgba(245,158,11,.10)';
  e.target.style.background  = 'rgba(245,158,11,.05)';
};
const onBlurInput = (hasErr) => e => {
  e.target.style.borderColor = hasErr ? C.danger : C.inpBdr;
  e.target.style.boxShadow   = 'none';
  e.target.style.background  = C.inp;
};

/* ════════════════════════════════════════════════════════════════════
   LOGIN COMPONENT
════════════════════════════════════════════════════════════════════ */
export default function Login() {
  const navigate          = useNavigate();
  const { login }         = useAuthStore();
  const [showPwd,    setPwd]    = useState(false);
  const [statusMsg,  setStatusMsg] = useState(null); // { type: 'pending'|'rejected'|'suspended', text }
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async (data) => {
    setStatusMsg(null);
    const result = await login(data);
    if (result.success) {
      toast.success('Welcome back!');
      navigate('/dashboard');
    } else if (result.code === 'ACCOUNT_PENDING') {
      setStatusMsg({ type: 'pending', text: result.message || 'Your account is awaiting administrator approval.' });
    } else if (result.code === 'ACCOUNT_REJECTED') {
      setStatusMsg({ type: 'rejected', text: result.message || 'Your registration request was not approved.' });
    } else if (result.code === 'ACCOUNT_SUSPENDED') {
      setStatusMsg({ type: 'suspended', text: result.message || 'Your account has been suspended. Contact the administrator.' });
    } else if (result.code === 'RATE_LIMITED' || result.status === 429) {
      toast.error('Too many login attempts. Please wait 15 minutes and try again.', { duration: 6000 });
    } else {
      toast.error(result.message || 'Sign in failed. Please check your credentials.');
    }
  };

  const quickLogin = (email) => {
    setStatusMsg(null);
    setValue('email', email);
    setValue('password', 'KhanNetra@2024');
  };

  /* shared input style */
  const inp = (hasErr) => ({
    width: '100%', display: 'block',
    padding: '11px 12px 11px 38px',
    background: C.inp,
    border: `1px solid ${hasErr ? C.danger : C.inpBdr}`,
    borderRadius: '10px',
    color: C.text, fontSize: '13px', outline: 'none',
    transition: 'border-color .2s, box-shadow .2s, background .2s',
    fontFamily: 'inherit',
  });

  return (
    <div style={{ minHeight:'100vh', display:'flex', overflow:'hidden', background: C.bg, fontFamily:"'Inter',system-ui,sans-serif" }}>

      {/* ══════════════════════════════════════════════════
          LEFT — FULL-HEIGHT HERO
      ══════════════════════════════════════════════════ */}
      <div style={{ width:'63%', position:'relative', display:'flex', flexDirection:'column', overflow:'hidden' }}
           className="hidden lg:flex">

        {/* Hero image — local mine asset */}
      <img
  src="/1789310049569.png"
  alt="KhanNetra - Open-pit coal mine operations"
  style={{
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center",
    display: "block"
  }}
/>
        {/* Layered overlay — preserves image visibility, adds depth */}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg,rgba(6,14,28,.78) 0%,rgba(6,14,28,.45) 55%,rgba(6,14,28,.68) 100%)' }}/>
        {/* Bottom vignette */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'45%', background:'linear-gradient(to top,rgba(6,14,28,.96) 0%,transparent 100%)' }}/>
        {/* Right edge blend to card */}
        <div style={{ position:'absolute', top:0, right:0, bottom:0, width:'80px', background:'linear-gradient(to right,transparent,rgba(6,14,28,.7))' }}/>
        {/* Top vignette */}
        <div style={{ position:'absolute', top:0, left:0, right:0, height:'25%', background:'linear-gradient(to bottom,rgba(6,14,28,.6) 0%,transparent 100%)' }}/>

        {/* ── Hero content ── */}
        <div style={{ position:'relative', zIndex:10, display:'flex', flexDirection:'column', justifyContent:'space-between', height:'100%', padding:'40px 52px' }}>

          {/* ── Top: Logo ── */}
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <img src="/khannetra-logo.svg" alt="KhanNetra Logo"
              style={{ width:'52px', height:'52px', flexShrink:0, filter:'drop-shadow(0 0 16px rgba(245,158,11,.6))' }}/>
            <div>
              <p style={{ color:'#f1f5f9', fontWeight:900, fontSize:'20px', lineHeight:1, margin:0 }}>KhanNetra</p>
              <p style={{ color:'rgba(255,255,255,.48)', fontSize:'11.5px', margin:'3px 0 0' }}>
                DGMS – Ministry of Coal | Govt. of India
              </p>
            </div>
          </div>

          {/* ── Center: Hero copy ── */}
          <div>
            {/* PC-24 badge */}
            <div style={{
              display:'inline-flex', alignItems:'center', gap:'8px',
              padding:'6px 14px', borderRadius:'999px', marginBottom:'28px',
              background:'rgba(245,158,11,.12)', border:'1px solid rgba(245,158,11,.32)',
            }}>
              <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#f59e0b', display:'inline-block', animation:'kn-pulse 2s infinite' }}/>
              <span style={{ color:'#fbbf24', fontSize:'11.5px', fontWeight:700, letterSpacing:'0.05em' }}>
                SIH Problem Statement PC-24
              </span>
            </div>

            {/* Headline */}
            <h1 style={{ margin:'0 0 20px', lineHeight:1.06, fontWeight:900, color:'#edf2f7',
                         fontSize:'clamp(2.6rem,3.8vw,3.6rem)', letterSpacing:'-0.02em' }}>
              Intelligent<br/>
              <span style={{ color:'#f59e0b' }}>Governance.</span><br/>
              Safer Mines.
            </h1>

            {/* Subtitle */}
            <p style={{ color:'rgba(255,255,255,.52)', fontSize:'15.5px', lineHeight:1.65, maxWidth:'420px', margin:'0 0 36px' }}>
              AI-powered compliance monitoring and smart governance
              platform for India's coal mining sector.
            </p>

            {/* Feature cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px' }}>
              {FEATURES.map(({ Icon, value, label }) => (
                <div key={label} style={{
                  borderRadius:'14px', padding:'14px 10px 12px', textAlign:'center',
                  background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)',
                  backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)',
                }}>
                  <div style={{ color:'#f59e0b', marginBottom:'8px', display:'flex', justifyContent:'center' }}><Icon/></div>
                  <p style={{ color:'#f59e0b', fontWeight:900, fontSize:'17px', margin:0, lineHeight:1 }}>{value}</p>
                  <p style={{ color:'rgba(255,255,255,.42)', fontSize:'10px', margin:'5px 0 0', lineHeight:1.35 }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Bottom: pill tags ── */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
            {['CMR 2017 Compliant','DGMS Aligned','Real-time Monitoring','AI Risk Engine','Multilingual'].map(t => (
              <span key={t} style={{
                padding:'4px 12px', borderRadius:'999px', fontSize:'11px', fontWeight:600,
                color:'rgba(255,255,255,.42)', background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)',
              }}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          RIGHT — LOGIN PANEL
      ══════════════════════════════════════════════════ */}
      <div style={{
        flex:1, display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', padding:'32px 28px', position:'relative', overflowY:'auto',
        background:'linear-gradient(170deg,#0c1627 0%,#060e1c 100%)',
      }}>

        {/* Top-right security badge */}
        <div style={{
          position:'absolute', top:'20px', right:'20px', display:'flex', alignItems:'center',
          gap:'8px', padding:'6px 14px', borderRadius:'999px',
          background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.10)',
        }}>
          <span style={{ color:'#60a5fa', display:'flex' }}><IconShield/></span>
          <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#22c55e', flexShrink:0,
                         boxShadow:'0 0 8px rgba(34,197,94,.8)', display:'inline-block' }}/>
          <span style={{ color:'rgba(255,255,255,.45)', fontSize:'11px', fontWeight:600, whiteSpace:'nowrap' }}>
            Secure Government System
          </span>
        </div>

        {/* Mobile logo */}
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'28px' }} className="lg:hidden">
          <img src="/khannetra-logo.svg" alt="KhanNetra Logo"
            style={{ width:'42px', height:'42px', filter:'drop-shadow(0 0 8px rgba(245,158,11,.5))' }}/>
          <div>
            <p style={{ color:'#f1f5f9', fontWeight:900, fontSize:'17px', margin:0 }}>KhanNetra</p>
            <p style={{ color:'rgba(255,255,255,.4)', fontSize:'11px', margin:'2px 0 0' }}>DGMS Compliance System</p>
          </div>
        </div>

        {/* ── GLASS LOGIN CARD ── */}
        <div style={{
          width:'100%', maxWidth:'420px',
          background:'rgba(255,255,255,.045)',
          border:'1px solid rgba(255,255,255,.10)',
          borderRadius:'20px',
          padding:'36px 32px',
          backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)',
          boxShadow:'0 24px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.05)',
        }}>

          {/* Card header */}
          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'28px', paddingBottom:'22px',
                        borderBottom:'1px solid rgba(255,255,255,.08)' }}>
            <img src="/khannetra-logo.svg" alt="KhanNetra Logo"
              style={{ width:'44px', height:'44px', flexShrink:0, filter:'drop-shadow(0 0 10px rgba(245,158,11,.45))' }}/>
            <div>
              <p style={{ color:'#f1f5f9', fontWeight:900, fontSize:'16px', margin:0, lineHeight:1 }}>KhanNetra</p>
              <p style={{ color:'rgba(255,255,255,.35)', fontSize:'10.5px', margin:'3px 0 0' }}>DGMS · Ministry of Coal</p>
            </div>
          </div>

          {/* Titles */}
          <h2 style={{ color:'#edf2f7', fontWeight:900, fontSize:'24px', margin:'0 0 4px', letterSpacing:'-0.01em' }}>Sign In</h2>
          <p style={{ color:'rgba(255,255,255,.38)', fontSize:'13px', margin:'0 0 16px' }}>
            Enter your credentials to access the system
          </p>

          {/* Account status banners (PENDING / REJECTED / SUSPENDED) */}
          {statusMsg?.type === 'pending' && (
            <div style={{ background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.3)', borderRadius:'12px', padding:'14px 16px', marginBottom:'16px' }}>
              <p style={{ color:'#fbbf24', fontWeight:700, fontSize:'13px', margin:'0 0 4px' }}>⏳ Account Pending Approval</p>
              <p style={{ color:'rgba(255,255,255,.55)', fontSize:'12px', margin:0, lineHeight:1.5 }}>{statusMsg.text}</p>
            </div>
          )}
          {statusMsg?.type === 'rejected' && (
            <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.3)', borderRadius:'12px', padding:'14px 16px', marginBottom:'16px' }}>
              <p style={{ color:'#f87171', fontWeight:700, fontSize:'13px', margin:'0 0 4px' }}>❌ Registration Not Approved</p>
              <p style={{ color:'rgba(255,255,255,.55)', fontSize:'12px', margin:0, lineHeight:1.5 }}>{statusMsg.text}</p>
            </div>
          )}
          {statusMsg?.type === 'suspended' && (
            <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.3)', borderRadius:'12px', padding:'14px 16px', marginBottom:'16px' }}>
              <p style={{ color:'#f87171', fontWeight:700, fontSize:'13px', margin:'0 0 4px' }}>🚫 Account Suspended</p>
              <p style={{ color:'rgba(255,255,255,.55)', fontSize:'12px', margin:0, lineHeight:1.5 }}>{statusMsg.text}</p>
            </div>
          )}

          {/* ── Form ── */}
          <form onSubmit={handleSubmit(onSubmit)} style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

            {/* Email */}
            <div>
              <label style={{ display:'block', color:'rgba(255,255,255,.38)', fontSize:'10px',
                              fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'7px' }}>
                Email Address
              </label>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)',
                               color:'rgba(255,255,255,.28)', pointerEvents:'none', display:'flex' }}>
                  <IconUser/>
                </span>
                <input
                  {...register('email', { required:'Email required', pattern:{ value:/\S+@\S+\.\S+/, message:'Invalid email' } })}
                  type="email"
                  placeholder="you@khannetra.gov.in"
                  style={inp(!!errors.email)}
                  onFocus={onFocusAmber}
                  onBlur={onBlurInput(!!errors.email)}
                />
              </div>
              {errors.email && <p style={{ color:C.danger, fontSize:'11px', margin:'5px 0 0' }}>{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label style={{ display:'block', color:'rgba(255,255,255,.38)', fontSize:'10px',
                              fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'7px' }}>
                Password
              </label>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)',
                               color:'rgba(255,255,255,.28)', pointerEvents:'none', display:'flex' }}>
                  <IconLock/>
                </span>
                <input
                  {...register('password', { required:'Password required' })}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  style={{ ...inp(!!errors.password), paddingRight:'42px' }}
                  onFocus={onFocusAmber}
                  onBlur={onBlurInput(!!errors.password)}
                />
                <button
                  type="button"
                  onClick={() => setPwd(v => !v)}
                  className="login-eye"
                  style={{ position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)',
                           background:'none', border:'none', cursor:'pointer', padding:0,
                           color:'rgba(255,255,255,.35)', display:'flex', transition:'color .15s' }}
                >
                  {showPwd ? <IconEyeOff/> : <IconEye/>}
                </button>
              </div>
              {errors.password && <p style={{ color:C.danger, fontSize:'11px', margin:'5px 0 0' }}>{errors.password.message}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
                padding:'13px 20px', borderRadius:'11px',
                background: isSubmitting ? 'rgba(245,158,11,.45)' : 'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)',
                color:'#060e1c', fontWeight:800, fontSize:'14.5px', border:'none',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                boxShadow: isSubmitting ? 'none' : '0 4px 22px rgba(245,158,11,.38)',
                transition:'all .2s', letterSpacing:'-0.01em',
              }}
              onMouseEnter={e => { if (!isSubmitting) { e.currentTarget.style.boxShadow='0 6px 32px rgba(245,158,11,.55)'; e.currentTarget.style.transform='translateY(-1px)'; }}}
              onMouseLeave={e => { e.currentTarget.style.boxShadow='0 4px 22px rgba(245,158,11,.38)'; e.currentTarget.style.transform=''; }}
            >
              {isSubmitting ? (
                <>
                  <span style={{ width:'16px', height:'16px', border:'2px solid rgba(6,14,28,.3)', borderTopColor:'#060e1c', borderRadius:'50%', display:'inline-block', animation:'kn-spin .7s linear infinite' }}/>
                  Signing in…
                </>
              ) : (
                <><IconShield/> Sign In Securely</>
              )}
            </button>
          </form>

          {/* Register */}
          <p style={{ textAlign:'center', marginTop:'16px', fontSize:'13px' }}>
            <span style={{ color:'rgba(255,255,255,.35)' }}>Don't have an account? </span>
            <Link to="/register" style={{ color:'#f59e0b', fontWeight:700, textDecoration:'none' }}
              onMouseEnter={e => e.currentTarget.style.color='#fbbf24'}
              onMouseLeave={e => e.currentTarget.style.color='#f59e0b'}>
              Register
            </Link>
          </p>

          {/* ── Quick Demo ── */}
          <div style={{ marginTop:'24px', paddingTop:'20px', borderTop:'1px solid rgba(255,255,255,.08)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom:'13px' }}>
              <span style={{ color:'#f59e0b', display:'flex' }}><IconZap/></span>
              <span style={{ color:'rgba(255,255,255,.28)', fontSize:'10px', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' }}>
                Quick Demo Access
              </span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              {DEMOS.map(d => (
                <button
                  key={d.email}
                  type="button"
                  className="demo-btn"
                  onClick={() => quickLogin(d.email)}
                  style={{
                    textAlign:'left', padding:'10px 12px', borderRadius:'10px', cursor:'pointer',
                    background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)',
                    transition:'all .15s', fontFamily:'inherit',
                  }}
                >
                  <p style={{ color:'rgba(255,255,255,.72)', fontSize:'12px', fontWeight:700, margin:0 }}>{d.role}</p>
                  <p style={{ color:'rgba(255,255,255,.3)', fontSize:'10px', margin:'2px 0 0' }}>{d.label}</p>
                </button>
              ))}
            </div>
            <p style={{ textAlign:'center', color:'rgba(255,255,255,.18)', fontSize:'10.5px', marginTop:'12px' }}>
              Password:&nbsp;
              <span style={{ fontFamily:'monospace', color:'rgba(255,255,255,.32)' }}>KhanNetra@2024</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop:'24px', textAlign:'center' }}>
          <p style={{ color:'rgba(255,255,255,.18)', fontSize:'11px', lineHeight:1.7, margin:0 }}>
            🔒 Secured Government Portal · DGMS<br/>
            Powered by DGMS | Ministry of Coal, Govt. of India<br/>
            <span style={{ color:'rgba(255,255,255,.10)' }}>© 2026 KhanNetra. All Rights Reserved.</span>
          </p>
        </div>
      </div>

      {/* ── Global keyframes ── */}
      <style>{`
        @keyframes kn-spin  { to { transform: rotate(360deg); } }
        @keyframes kn-pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        /* Login placeholders: clearly white so text is readable on dark glass */
        input[type=email]::placeholder,
        input[type=password]::placeholder,
        input[type=text]::placeholder { color: rgba(255,255,255,.55) !important; opacity:1 !important; }
        input:-webkit-autofill,
        input:-webkit-autofill:focus {
          -webkit-text-fill-color: #edf2f7 !important;
          -webkit-box-shadow: 0 0 0 1000px rgba(255,255,255,.06) inset !important;
          caret-color: #edf2f7;
          transition: background-color 9999s ease-in-out;
        }
        /* Yellow focus ring on login inputs */
        input:focus-visible { outline: none !important; }
        /* Hover on password eye button */
        .login-eye:hover { color: #F5B800 !important; }
        /* Hover on demo login buttons */
        .demo-btn:hover { border-color: rgba(245,184,0,.50) !important; background: rgba(245,184,0,.08) !important; }
        .demo-btn:hover p:first-child { color: #F5B800 !important; }
        @media (max-width: 1024px) {
          .login-left { display: none !important; }
        }
        @media (max-width: 640px) {
          .login-card { padding: 24px 20px !important; }
        }
      `}</style>
    </div>
  );
}
