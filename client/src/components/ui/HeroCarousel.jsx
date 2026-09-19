/**
 * KhanNetra — Hero Image Carousel
 * 3-slide, auto-advancing, hover-pausing, fully accessible.
 * Drop-in replacement for the static hero <img> in Dashboard.jsx.
 *
 * CONFIGURATION:
 *   To swap images, edit the SLIDES array below.
 *   Each slide needs:  src, alt, label (shown in indicator tooltip)
 *
 * ADDING A THIRD REAL IMAGE:
 *   1. Copy your image to  client/public/assets/
 *   2. Update slide 3's src from the placeholder to  "/assets/your-image.jpg"
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

/* ── Slide definitions ────────────────────────────────────────────────── */
const SLIDES = [
  {
    src:     '/1789310049569.png',
    alt:   'Open-pit coal mine operations — KhanNetra DGMS command centre',
    label: 'Mine Operations',
  },
  {
    src:   '/assets/mine-dashboard-2.jpeg',
    alt:   'Coal mine infrastructure — safety and compliance monitoring',
    label: 'Safety Monitoring',
  },
  {
    /* Gradient placeholder — replace src with a real image path when ready */
    src:    '/assets/mine-dashboard-3.jpeg',
    alt:   'KhanNetra DGMS — AI-powered governance platform',
    label: 'AI Governance',
    gradient: 'linear-gradient(135deg, #0f2747 0%, #1e3a5f 40%, #0f2747 70%, #162940 100%)',
  },
];

const INTERVAL_MS  = 4500;   /* auto-advance every 4.5 seconds */
const TRANSITION_MS = 600;   /* CSS transition duration */

export default function HeroCarousel({ className = '', style = {} }) {
  const [current,    setCurrent]    = useState(0);
  const [animating,  setAnimating]  = useState(false);
  const [direction,  setDirection]  = useState(1);   /* 1 = forward, -1 = backward */
  const [paused,     setPaused]     = useState(false);
  const timerRef = useRef(null);

  const count = SLIDES.length;

  /* ── Navigate ──────────────────────────────────────────────────────── */
  const goTo = useCallback((idx, dir = 1) => {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setCurrent(idx);
      setAnimating(false);
    }, TRANSITION_MS);
  }, [animating]);

  const prev = useCallback(() => {
    const idx = (current - 1 + count) % count;
    goTo(idx, -1);
  }, [current, count, goTo]);

  const next = useCallback(() => {
    const idx = (current + 1) % count;
    goTo(idx, 1);
  }, [current, count, goTo]);

  /* ── Auto-advance ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(next, INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [paused, next]);

  /* ── Keyboard ──────────────────────────────────────────────────────── */
  const handleKey = useCallback((e) => {
    if (e.key === 'ArrowLeft')  prev();
    if (e.key === 'ArrowRight') next();
  }, [prev, next]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl select-none ${className}`}
      style={{
        minHeight: '280px',
        boxShadow: '0 4px 24px rgba(15,39,71,.22)',
        ...style,
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onKeyDown={handleKey}
      tabIndex={0}
      aria-label="Dashboard image carousel"
      aria-roledescription="carousel"
    >
      {/* ── Slides ──────────────────────────────────────────────────── */}
      {SLIDES.map((slide, idx) => {
        const isActive  = idx === current;
        const isPrev    = !isActive;
        // Slide in/out transform
        let transform = 'translateX(100%)';
        if (isActive)  transform = animating ? `translateX(${direction === 1 ? '-100%' : '100%'})` : 'translateX(0)';
        if (!isActive && !animating) transform = idx < current ? 'translateX(-100%)' : 'translateX(100%)';

        return (
          <div
            key={idx}
            aria-hidden={!isActive}
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${idx + 1} of ${count}: ${slide.label}`}
            style={{
              position:   idx === 0 ? 'relative' : 'absolute',
              inset:      0,
              width:      '100%',
              height:     '100%',
              minHeight:  '280px',
              opacity:    isActive ? 1 : 0,
              transition: `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease`,
              pointerEvents: isActive ? 'auto' : 'none',
              zIndex:     isActive ? 2 : 1,
            }}
          >
            {/* Image or gradient bg */}
            {slide.src ? (
              <img
                src={slide.src}
                alt={slide.alt}
                loading={idx === 0 ? 'eager' : 'lazy'}
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  objectFit: 'cover', objectPosition: 'center',
                  display: 'block',
                }}
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = 'flex');
                }}
              />
            ) : (
              <div style={{
                position: 'absolute', inset: 0,
                background: slide.gradient || 'linear-gradient(135deg,#0f2747,#1e3a5f)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {/* Decorative pattern for placeholder */}
                <svg width="100%" height="100%" style={{ position:'absolute', inset:0, opacity:.04 }}>
                  <pattern id={`grid-${idx}`} width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
                  </pattern>
                  <rect width="100%" height="100%" fill={`url(#grid-${idx})`}/>
                </svg>
                <div style={{ textAlign:'center', zIndex:1 }}>
                  <div style={{
                    width:64, height:64, borderRadius:'50%', margin:'0 auto 16px',
                    background:'rgba(245,158,11,.2)', border:'2px solid rgba(245,158,11,.4)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <svg width="28" height="28" fill="none" stroke="#f59e0b" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                  </div>
                  <p style={{ color:'rgba(255,255,255,.5)', fontSize:'12px', fontWeight:600 }}>
                    Slide 3 — Replace with your image
                  </p>
                  <p style={{ color:'rgba(255,255,255,.3)', fontSize:'10px', marginTop:4 }}>
                    client/public/assets/slide3.jpg
                  </p>
                </div>
              </div>
            )}

            {/* Error fallback (shown when img fails) */}
            {slide.src && (
              <div style={{
                display:'none', position:'absolute', inset:0,
                background:'linear-gradient(135deg,#0f2747,#1e3a5f)',
                alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.4)',
                fontSize:'12px', textAlign:'center',
              }}>
                <span>{slide.alt}</span>
              </div>
            )}

            {/* Overlay gradients — always on top of image */}
            <div style={{
              position:'absolute', inset:0, zIndex:1,
              background:'linear-gradient(135deg,rgba(10,25,50,.80) 0%,rgba(10,25,50,.38) 55%,rgba(10,25,50,.68) 100%)',
            }}/>
            <div style={{
              position:'absolute', bottom:0, left:0, right:0, height:'55%', zIndex:1,
              background:'linear-gradient(to top,rgba(10,25,50,.88) 0%,transparent 100%)',
            }}/>
          </div>
        );
      })}

      {/* ── Prev / Next arrows ──────────────────────────────────────── */}
      <button
        onClick={prev}
        aria-label="Previous slide"
        title="Previous"
        style={{
          position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)',
          zIndex:10, width:'36px', height:'36px', borderRadius:'50%',
          background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)',
          backdropFilter:'blur(8px)', cursor:'pointer', display:'flex',
          alignItems:'center', justifyContent:'center',
          transition:'background .15s, transform .15s',
          color:'#fff',
        }}
        onMouseEnter={e => { e.currentTarget.style.background='rgba(245,158,11,.35)'; e.currentTarget.style.transform='translateY(-50%) scale(1.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,.12)'; e.currentTarget.style.transform='translateY(-50%) scale(1)'; }}
      >
        <FiChevronLeft size={18}/>
      </button>

      <button
        onClick={next}
        aria-label="Next slide"
        title="Next"
        style={{
          position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)',
          zIndex:10, width:'36px', height:'36px', borderRadius:'50%',
          background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)',
          backdropFilter:'blur(8px)', cursor:'pointer', display:'flex',
          alignItems:'center', justifyContent:'center',
          transition:'background .15s, transform .15s',
          color:'#fff',
        }}
        onMouseEnter={e => { e.currentTarget.style.background='rgba(245,158,11,.35)'; e.currentTarget.style.transform='translateY(-50%) scale(1.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,.12)'; e.currentTarget.style.transform='translateY(-50%) scale(1)'; }}
      >
        <FiChevronRight size={18}/>
      </button>

      {/* ── Indicator dots ──────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Slide indicators"
        style={{
          position:'absolute', bottom:'10px', left:'50%', transform:'translateX(-50%)',
          zIndex:10, display:'flex', gap:'8px', alignItems:'center',
        }}
      >
        {SLIDES.map((slide, idx) => (
          <button
            key={idx}
            role="tab"
            aria-selected={idx === current}
            aria-label={`Go to slide ${idx + 1}: ${slide.label}`}
            title={slide.label}
            onClick={() => goTo(idx, idx > current ? 1 : -1)}
            style={{
              width:    idx === current ? '22px' : '8px',
              height:   '8px',
              borderRadius: '4px',
              border:   'none',
              cursor:   'pointer',
              padding:  0,
              transition: 'all .3s ease',
              background: idx === current
                ? 'rgba(245,158,11,.9)'
                : 'rgba(255,255,255,.4)',
              boxShadow: idx === current ? '0 0 0 2px rgba(245,158,11,.3)' : 'none',
            }}
            onMouseEnter={e => { if (idx !== current) e.currentTarget.style.background='rgba(255,255,255,.7)'; }}
            onMouseLeave={e => { if (idx !== current) e.currentTarget.style.background='rgba(255,255,255,.4)'; }}
          />
        ))}
      </div>

      {/* ── Auto-advance pause indicator ────────────────────────────── */}
      {paused && (
        <div
          aria-hidden="true"
          style={{
            position:'absolute', top:'12px', right:'56px', zIndex:10,
            background:'rgba(0,0,0,.45)', borderRadius:'6px',
            padding:'3px 7px', fontSize:'9px', fontWeight:700,
            color:'rgba(255,255,255,.6)', letterSpacing:'.05em', textTransform:'uppercase',
            backdropFilter:'blur(4px)',
          }}
        >
          paused
        </div>
      )}
    </div>
  );
}
