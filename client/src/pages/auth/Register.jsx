/**
 * KhanNetra DGMS — Registration Page
 * No Gmail restriction. No email verification.
 * On success: account created with status=PENDING → show approval-pending screen.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { FiEye, FiEyeOff, FiCheckCircle, FiClock, FiUser, FiLock, FiPhone, FiBriefcase, FiMapPin, FiTag } from 'react-icons/fi';
import { authApi } from '../../services/api';
import toast from 'react-hot-toast';

/* ── Role definitions ─────────────────────────────────────────────── */
const ROLES = [
  { value: 'mine_manager',        label: 'Mine Manager',                group: 'Mine Operations' },
  { value: 'mining_engineer',     label: 'Mining Engineer',             group: 'Mine Operations' },
  { value: 'safety_officer',      label: 'Safety Officer',              group: 'Mine Operations' },
  { value: 'environment_officer', label: 'Environmental Officer',       group: 'Mine Operations' },
  { value: 'contractor',          label: 'Contractor',                  group: 'Mine Operations' },
  { value: 'inspector',           label: 'Field Inspector / DGMS',      group: 'Government'      },
  { value: 'government_officer',  label: 'DGMS / Government Officer',   group: 'Government'      },
  { value: 'corporate_management',label: 'Corporate Management',        group: 'Corporate'       },
  { value: 'prototype_tester',    label: 'Prototype Tester / Demo User',group: 'Demo'            },
];

/* ── Colour tokens (dark glass card style, matches Login) ─────────── */
const C = {
  bg: '#060e1c', cardBg: 'rgba(255,255,255,.045)',
  cardBorder: 'rgba(255,255,255,.10)',
  inp: 'rgba(255,255,255,.07)', inpBdr: 'rgba(255,255,255,.14)',
  text: '#edf2f7', textLow: 'rgba(255,255,255,.38)',
  amber: '#f59e0b', danger: '#f87171',
};

const labelStyle = {
  display: 'block', color: C.textLow, fontSize: '10px',
  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px',
};
const errStyle = { color: C.danger, fontSize: '11px', margin: '4px 0 0' };

const inp = (hasErr) => ({
  width: '100%', display: 'block', padding: '10px 12px',
  background: C.inp, border: `1px solid ${hasErr ? C.danger : C.inpBdr}`,
  borderRadius: '10px', color: C.text, fontSize: '13px', outline: 'none',
  transition: 'border-color .2s, box-shadow .2s, background .2s', fontFamily: 'inherit',
  boxSizing: 'border-box',
});
const inpWithIcon = (hasErr) => ({ ...inp(hasErr), paddingLeft: '36px' });

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

/* ── Pending approval screen ──────────────────────────────────────── */
function PendingScreen({ name, email }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ maxWidth: '480px', width: '100%', background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: '20px', padding: '40px 36px', textAlign: 'center', backdropFilter: 'blur(20px)' }}>
        {/* Icon */}
        <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(245,158,11,.12)', border: '2px solid rgba(245,158,11,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <FiClock size={32} style={{ color: '#f59e0b' }}/>
        </div>

        <h2 style={{ color: '#f1f5f9', fontWeight: 900, fontSize: '22px', margin: '0 0 8px' }}>Registration Submitted!</h2>
        <p style={{ color: 'rgba(255,255,255,.55)', fontSize: '14px', margin: '0 0 24px', lineHeight: 1.65 }}>
          Welcome, <strong style={{ color: '#fbbf24' }}>{name}</strong>.<br/>
          Your account is <strong style={{ color: '#fbbf24' }}>pending administrator approval</strong>.
        </p>

        {/* Status box */}
        <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: '14px', padding: '18px 20px', marginBottom: '24px', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0, boxShadow: '0 0 8px rgba(245,158,11,.6)' }}/>
            <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '13px' }}>Registration received — Awaiting approval</span>
          </div>
          {[
            ['Email', email],
            ['Status', 'PENDING — Admin Review Required'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <span style={{ color: 'rgba(255,255,255,.35)', fontSize: '12px', minWidth: '54px', flexShrink: 0 }}>{k}:</span>
              <span style={{ color: 'rgba(255,255,255,.7)', fontSize: '12px', wordBreak: 'break-all' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* What happens next */}
        <div style={{ textAlign: 'left', marginBottom: '24px' }}>
          <p style={{ color: 'rgba(255,255,255,.35)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>What happens next</p>
          {[
            'An administrator will review your registration request.',
            'Once approved, you can sign in with your email and password.',
            'If rejected, you will see a message on the login page.',
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '11px', fontWeight: 800, color: '#f59e0b' }}>{i + 1}</div>
              <p style={{ color: 'rgba(255,255,255,.55)', fontSize: '12px', lineHeight: 1.5, margin: 0 }}>{step}</p>
            </div>
          ))}
        </div>

        <Link to="/login" style={{ display: 'block', padding: '12px', borderRadius: '11px', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#060e1c', fontWeight: 800, fontSize: '14px', textDecoration: 'none' }}>
          <FiCheckCircle size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}/>
          Back to Sign In
        </Link>

        <p style={{ color: 'rgba(255,255,255,.15)', fontSize: '11px', marginTop: '16px' }}>
          KhanNetra DGMS · Ministry of Coal, Govt. of India
        </p>
      </div>
      <style>{`@keyframes kn-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ── Icon wrapper for input fields ───────────────────────────────── */
function InputIcon({ icon: Icon }) {
  return (
    <Icon size={13} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.28)', pointerEvents: 'none' }}/>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN REGISTER COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function Register() {
  const [showPwd,  setShowPwd]  = useState(false);
  const [showCPwd, setShowCPwd] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState({});

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm();
  const passwordValue = watch('password', '');
  const watchRole     = watch('role', '');
  const isPrototypeTester = watchRole === 'prototype_tester';

  const onSubmit = async (data) => {
    data.email = (data.email || '').toLowerCase().trim();
    // Prototype tester defaults
    if (isPrototypeTester) {
      data.organization  = data.organization  || 'Prototype / Demo';
      data.mine_name     = data.mine_name      || 'Test Mine';
    }
    try {
      const res = await authApi.register(data);
      if (res.success) {
        setSubmittedData({ name: data.full_name, email: data.email });
        setSubmitted(true);
        toast.success(res.message || 'Registration submitted!');
      }
    } catch (err) {
      const status = err.response?.status;
      const msg    = err.response?.data?.message;
      if (status === 429)      toast.error('Too many attempts. Please wait 15 minutes.', { duration: 6000 });
      else if (status === 409) toast.error(msg || 'This email is already registered. Please sign in.');
      else if (status === 400) toast.error(msg || 'Please check your details and try again.');
      else                     toast.error(msg || 'Registration failed. Please try again.');
    }
  };

  if (submitted) return <PendingScreen name={submittedData.name} email={submittedData.email}/>;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ width: '100%', maxWidth: '560px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center', marginBottom: '24px' }}>
          <img src="/khannetra-logo.svg" alt="KhanNetra" style={{ width: '42px', height: '42px', filter: 'drop-shadow(0 0 10px rgba(245,158,11,.5))' }} onError={e => { e.currentTarget.style.display = 'none'; }}/>
          <div>
            <p style={{ color: '#f1f5f9', fontWeight: 900, fontSize: '18px', margin: 0, lineHeight: 1 }}>KhanNetra</p>
            <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '11px', margin: '2px 0 0' }}>DGMS · Ministry of Coal, Govt. of India</p>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: '20px', padding: '36px 32px', backdropFilter: 'blur(20px)' }}>
          <h2 style={{ color: '#f1f5f9', fontWeight: 900, fontSize: '22px', margin: '0 0 4px' }}>Create Account</h2>
          <p style={{ color: C.textLow, fontSize: '13px', margin: '0 0 24px' }}>
            Register for KhanNetra DGMS access · All fields marked * are required
          </p>

          {/* Prototype tester notice */}
          {isPrototypeTester && (
            <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px' }}>
              <p style={{ color: '#fbbf24', fontWeight: 700, fontSize: '12px', margin: '0 0 4px' }}>🧪 Prototype Tester / Demo User</p>
              <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                Organization defaults to "Prototype / Demo" and mine to "Test Mine" if left blank.
                Employee ID is optional. After admin approval you can test all major features
                but will not have access to real/sensitive mine data.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

              {/* Full Name */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Full Name *</label>
                <div style={{ position: 'relative' }}>
                  <InputIcon icon={FiUser}/>
                  <input {...register('full_name', { required: 'Full name is required', minLength: { value: 2, message: 'Min 2 characters' } })}
                    placeholder="Dr. Rajesh Kumar" style={inpWithIcon(!!errors.full_name)}
                    onFocus={onFocusAmber} onBlur={onBlurInput(!!errors.full_name)}/>
                </div>
                {errors.full_name && <p style={errStyle}>{errors.full_name.message}</p>}
              </div>

              {/* Email */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Email Address *</label>
                <div style={{ position: 'relative' }}>
                  <InputIcon icon={FiUser}/>
                  <input {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Please enter a valid email address' },
                  })}
                    type="email" placeholder="you@organization.gov.in"
                    style={inpWithIcon(!!errors.email)}
                    onFocus={onFocusAmber} onBlur={onBlurInput(!!errors.email)}/>
                </div>
                {errors.email && <p style={errStyle}>{errors.email.message}</p>}
              </div>

              {/* Mobile */}
              <div>
                <label style={labelStyle}>Mobile Number</label>
                <div style={{ position: 'relative' }}>
                  <InputIcon icon={FiPhone}/>
                  <input {...register('phone')} placeholder="+91-9876543210"
                    style={inpWithIcon(false)}
                    onFocus={onFocusAmber} onBlur={onBlurInput(false)}/>
                </div>
              </div>

              {/* Role */}
              <div>
                <label style={labelStyle}>User Role / Type *</label>
                <select {...register('role', { required: 'Please select a role' })}
                  style={{ ...inp(!!errors.role), appearance: 'none', cursor: 'pointer' }}
                  onFocus={onFocusAmber} onBlur={onBlurInput(!!errors.role)}>
                  <option value="">Select Role…</option>
                  {['Mine Operations', 'Government', 'Corporate', 'Demo'].map(group => (
                    <optgroup key={group} label={`── ${group} ──`}>
                      {ROLES.filter(r => r.group === group).map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {errors.role && <p style={errStyle}>{errors.role.message}</p>}
              </div>

              {/* Organization */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Organization / Company {isPrototypeTester ? '' : '*'}</label>
                <div style={{ position: 'relative' }}>
                  <InputIcon icon={FiBriefcase}/>
                  <input {...register('organization', {
                    required: isPrototypeTester ? false : 'Organization is required',
                  })}
                    placeholder={isPrototypeTester ? 'Demo / Student / Prototype (optional)' : 'Bharat Coking Coal Ltd / DGMS / Ministry of Coal'}
                    style={inpWithIcon(!!errors.organization)}
                    onFocus={onFocusAmber} onBlur={onBlurInput(!!errors.organization)}/>
                </div>
                {errors.organization && <p style={errStyle}>{errors.organization.message}</p>}
              </div>

              {/* Mine Name */}
              <div>
                <label style={labelStyle}>Mine Name {isPrototypeTester ? '(optional)' : ''}</label>
                <div style={{ position: 'relative' }}>
                  <InputIcon icon={FiMapPin}/>
                  <input {...register('mine_name')}
                    placeholder={isPrototypeTester ? 'Test Mine (optional)' : 'Jharia Central Coal Mine'}
                    style={inpWithIcon(false)}
                    onFocus={onFocusAmber} onBlur={onBlurInput(false)}/>
                </div>
              </div>

              {/* Employee/Official ID */}
              <div>
                <label style={labelStyle}>Employee / Official ID {isPrototypeTester ? '(optional)' : ''}</label>
                <div style={{ position: 'relative' }}>
                  <InputIcon icon={FiTag}/>
                  <input {...register('employee_id')}
                    placeholder={isPrototypeTester ? 'Optional' : 'DGMS-INS-001 / CCL-MGR-001'}
                    style={inpWithIcon(false)}
                    onFocus={onFocusAmber} onBlur={onBlurInput(false)}/>
                </div>
              </div>

              {/* Designation */}
              <div>
                <label style={labelStyle}>Designation</label>
                <input {...register('designation')} placeholder="Inspector of Mines"
                  style={inp(false)} onFocus={onFocusAmber} onBlur={onBlurInput(false)}/>
              </div>

              {/* Department */}
              <div>
                <label style={labelStyle}>Department</label>
                <input {...register('department')} placeholder="Safety Division / DGMS Region-2"
                  style={inp(false)} onFocus={onFocusAmber} onBlur={onBlurInput(false)}/>
              </div>

              {/* Password */}
              <div>
                <label style={labelStyle}>Password *</label>
                <div style={{ position: 'relative' }}>
                  <InputIcon icon={FiLock}/>
                  <input {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Minimum 8 characters' },
                  })}
                    type={showPwd ? 'text' : 'password'} placeholder="Min 8 characters"
                    style={{ ...inpWithIcon(!!errors.password), paddingRight: '40px' }}
                    onFocus={onFocusAmber} onBlur={onBlurInput(!!errors.password)}/>
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.35)', padding: 0, display: 'flex' }}>
                    {showPwd ? <FiEyeOff size={14}/> : <FiEye size={14}/>}
                  </button>
                </div>
                {errors.password && <p style={errStyle}>{errors.password.message}</p>}
              </div>

              {/* Confirm Password */}
              <div>
                <label style={labelStyle}>Confirm Password *</label>
                <div style={{ position: 'relative' }}>
                  <InputIcon icon={FiLock}/>
                  <input {...register('confirm_password', {
                    required: 'Please confirm your password',
                    validate: v => v === passwordValue || 'Passwords do not match',
                  })}
                    type={showCPwd ? 'text' : 'password'} placeholder="Repeat password"
                    style={{ ...inpWithIcon(!!errors.confirm_password), paddingRight: '40px' }}
                    onFocus={onFocusAmber} onBlur={onBlurInput(!!errors.confirm_password)}/>
                  <button type="button" onClick={() => setShowCPwd(v => !v)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.35)', padding: 0, display: 'flex' }}>
                    {showCPwd ? <FiEyeOff size={14}/> : <FiEye size={14}/>}
                  </button>
                </div>
                {errors.confirm_password && <p style={errStyle}>{errors.confirm_password.message}</p>}
              </div>
            </div>

            {/* Notice */}
            <div style={{ margin: '20px 0', padding: '12px 14px', borderRadius: '10px', background: 'rgba(96,165,250,.07)', border: '1px solid rgba(96,165,250,.2)' }}>
              <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '12px', margin: 0, lineHeight: 1.55 }}>
                <strong style={{ color: 'rgba(255,255,255,.7)' }}>Note:</strong> After registration your account will be
                reviewed by a DGMS administrator. You will be able to sign in once approved.
                No email verification is required.
              </p>
            </div>

            {/* Submit */}
            <button type="submit" disabled={isSubmitting}
              style={{ width: '100%', padding: '13px', borderRadius: '11px', fontWeight: 800, fontSize: '14px', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', background: isSubmitting ? 'rgba(245,158,11,.45)' : 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#060e1c', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {isSubmitting
                ? <><span style={{ width: '15px', height: '15px', border: '2px solid rgba(6,14,28,.3)', borderTopColor: '#060e1c', borderRadius: '50%', display: 'inline-block', animation: 'kn-spin .7s linear infinite' }}/> Submitting…</>
                : <><FiCheckCircle size={15}/> Submit Registration Request</>
              }
            </button>

            <p style={{ textAlign: 'center', marginTop: '14px', fontSize: '13px', color: 'rgba(255,255,255,.35)' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ color: '#f59e0b', fontWeight: 700, textDecoration: 'none' }}>Sign In</Link>
            </p>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.12)', fontSize: '11px', marginTop: '16px' }}>
          🔒 Secured Government Portal · DGMS · © 2026 KhanNetra
        </p>
      </div>
      <style>{`@keyframes kn-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
