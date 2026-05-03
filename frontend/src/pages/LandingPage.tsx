import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemo } from '../contexts/DemoContext';
import './LandingPage.css';

/* ─── Animated EEG Waveform Background for CTA ─── */
const CtaWaveBg: React.FC = () => {
  const [time, setTime] = useState(0);
  useEffect(() => {
    let raf: number;
    let last = performance.now();
    const tick = (now: number) => {
      setTime((t) => t + (now - last) / 1000);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const channels = 8;
  const W = 1200, H = 400, rowH = H / channels;
  const path = (idx: number) => {
    let d = '';
    for (let i = 0; i <= 200; i++) {
      const x = (i / 200) * W;
      const t = time + (i / 200) * 4 + idx * 0.4;
      const y = Math.sin(t * 1.5) * 6 + Math.sin(t * 4 + 1) * 3 + Math.sin(t * 9 + 2) * 1.5;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + (idx * rowH + rowH / 2 + y).toFixed(1) + ' ';
    }
    return d;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
      {[...Array(channels)].map((_, i) => (
        <path
          key={i}
          d={path(i)}
          fill="none"
          stroke={i % 2 ? '#10b981' : '#f59e0b'}
          strokeWidth="1.5"
          opacity="0.7"
        />
      ))}
    </svg>
  );
};

/* ─── Hero EEG Visual (without Frequency Band Composition) ─── */
const HeroEEG: React.FC = () => {
  return (
    <div className="lp-hero-visual">
      <div className="lp-visual-header">
        <div className="lp-dots">
          <div className="lp-dot lp-dot-r"></div>
          <div className="lp-dot lp-dot-y"></div>
          <div className="lp-dot lp-dot-g"></div>
        </div>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          ceresignal · session 0000138.edf
        </span>
        <div className="lp-header-label">ANALYSIS COMPLETE</div>
      </div>

      <div className="lp-result-card">
        <div className="lp-result-row">
          <div className="lp-result-meta">
            <div className="lp-meta-label">Recording</div>
            <div className="lp-meta-value">19 channels · 30 min · 256 Hz</div>
          </div>
          <div className="lp-result-meta">
            <div className="lp-meta-label">Processed</div>
            <div className="lp-meta-value">3 min 12 sec</div>
          </div>
        </div>

        <div className="lp-result-section">
          <div className="lp-section-title">Detected Findings</div>
          <div className="lp-findings-list">
            <div className="lp-finding-chip">
              <div className="lp-chip-dot ok"></div>
              <div className="lp-chip-text">
                <div className="lp-chip-title">Posterior dominant rhythm · 9.3 Hz</div>
                <div className="lp-chip-sub">Within normal range · 95% confidence</div>
              </div>
            </div>
            <div className="lp-finding-chip warn">
              <div className="lp-chip-dot warn"></div>
              <div className="lp-chip-text">
                <div className="lp-chip-title">Generalized slowing · frontal/temporal</div>
                <div className="lp-chip-sub">Marked over F3, F4, T3 · 89% confidence</div>
              </div>
            </div>
            <div className="lp-finding-chip alert">
              <div className="lp-chip-dot alert"></div>
              <div className="lp-chip-text">
                <div className="lp-chip-title">Rare epileptiform discharges · spike-wave at C3</div>
                <div className="lp-chip-sub">3 events identified · 92% confidence</div>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-result-footer">
          <div className="lp-footer-stat">
            <div className="lp-footer-label">Abnormality score</div>
            <div className="lp-footer-value warn">29%</div>
          </div>
          <div className="lp-footer-divider"></div>
          <div className="lp-footer-stat">
            <div className="lp-footer-label">Overall confidence</div>
            <div className="lp-footer-value ok">95%</div>
          </div>
          <div className="lp-footer-divider"></div>
          <div className="lp-footer-stat">
            <div className="lp-footer-label">Status</div>
            <div className="lp-footer-value">Ready for review</div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Patient Registry Demo View ─── */
const PatientRegistryView: React.FC = () => {
  const patients = [
    { name: 'Patient A · 42, F', id: 'P-00184', date: '5/3/2026', doc: 'Dr. Khan', status: 'norm', label: 'Normal', eeg: 'examined' },
    { name: 'Patient B · 27, M', id: 'P-00185', date: '5/3/2026', doc: 'Dr. Khan', status: 'abn', label: 'Abnormal', eeg: 'examined' },
    { name: 'Patient C · 64, M', id: 'P-00186', date: '5/3/2026', doc: 'Dr. Mahmood', status: 'pending', label: 'Pending', eeg: 'queued' },
    { name: 'Patient D · 8, F', id: 'P-00187', date: '5/3/2026', doc: 'Dr. Khan', status: 'abn', label: 'Abnormal', eeg: 'examined' },
  ];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="lp-dr-header">
        <div>
          <div className="lp-dr-title">Patient Registry</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Create patients and attach EEG files in one stop.</div>
        </div>
        <div className="lp-dr-actions">
          <input className="lp-dr-search" placeholder="Search patients" readOnly />
          <button className="lp-dr-add-btn">+ Add Patient</button>
        </div>
      </div>
      <div className="lp-dr-list">
        {patients.map((p, i) => (
          <div key={i} className="lp-dr-row" style={{ animation: `lp-fadeUp 0.4s ease ${i * 0.08}s both` }}>
            <div>
              <div className="lp-dr-name">{p.name}</div>
              <div className="lp-dr-chips">
                <span className="lp-dr-chip">ID {p.id}</span>
                <span className="lp-dr-chip">Added {p.date}</span>
                <span className="lp-dr-chip">Assigned: {p.doc}</span>
              </div>
            </div>
            <div className="lp-dr-status">
              {p.status === 'abn' && <span className="lp-badge abn">Abnormal</span>}
              {p.status === 'norm' && <span className="lp-badge norm">Normal</span>}
              {p.status === 'pending' && <span className="lp-badge exam">Queued</span>}
              {p.eeg === 'examined' && <span className="lp-badge exam">Examined</span>}
            </div>
            <div className="lp-dr-row-actions">
              <button className="lp-dr-row-btn">Download</button>
              <button className="lp-dr-row-btn">Email</button>
              <button className="lp-dr-row-btn">View EEG</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── EEG Analysis Demo View ─── */
const EegAnalysisView: React.FC = () => {
  const channelGroups = [
    { name: 'Frontal', channels: ['FP1', 'FP2', 'F3', 'F4', 'F7', 'F8', 'FZ'], state: 'normal' },
    { name: 'Central', channels: ['C3', 'C4', 'CZ'], state: 'flagged' },
    { name: 'Temporal', channels: ['T3', 'T4', 'T5', 'T6'], state: 'flagged' },
    { name: 'Parietal', channels: ['P3', 'P4', 'PZ'], state: 'normal' },
    { name: 'Occipital', channels: ['O1', 'O2'], state: 'normal' },
  ];

  const findings = [
    { type: 'ok', title: 'Posterior dominant rhythm · 9.3 Hz', sub: 'O1, O2 · within normal range', conf: 95 },
    { type: 'warn', title: 'Generalized slowing', sub: 'Frontal & temporal regions · F3, F4, T3', conf: 89 },
    { type: 'alert', title: 'Spike-wave discharge · C3', sub: '3 events identified across 30-min recording', conf: 92 },
    { type: 'alert', title: 'Sharp wave · T4', sub: '1 event at 14:23 timestamp', conf: 87 },
  ];

  return (
    <div className="lp-eeg-result">
      <div className="lp-eeg-result-header">
        <div>
          <div className="lp-eeg-result-title">EEG Analysis Result</div>
          <div className="lp-eeg-result-sub">0000138_06b.edf · 19 channels · 30 min · processed in 3:12</div>
        </div>
        <span className="lp-eeg-status-pill">Analysis Complete</span>
      </div>

      <div className="lp-eeg-result-grid">
        <div className="lp-eeg-channels-panel">
          <div className="lp-panel-title">Channels Reviewed</div>
          <div className="lp-channel-groups">
            {channelGroups.map((g) => (
              <div key={g.name} className={`lp-channel-group ${g.state}`}>
                <div className="lp-cg-head">
                  <span className="lp-cg-name">{g.name}</span>
                  <span className={`lp-cg-tag ${g.state}`}>{g.state === 'flagged' ? 'flagged' : 'normal'}</span>
                </div>
                <div className="lp-cg-channels">
                  {g.channels.map((c) => (
                    <span key={c} className="lp-cg-chip">{c}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-eeg-findings-panel">
          <div className="lp-panel-title">Findings Detected <span className="lp-ai-marker">AI</span></div>
          <div className="lp-findings-stack">
            {findings.map((f, i) => (
              <div key={i} className={`lp-finding-row ${f.type}`}>
                <div className="lp-fr-dot"></div>
                <div className="lp-fr-body">
                  <div className="lp-fr-title">{f.title}</div>
                  <div className="lp-fr-sub">{f.sub}</div>
                </div>
                <div className="lp-fr-conf">{f.conf}%</div>
              </div>
            ))}
          </div>

          <div className="lp-eeg-summary-row">
            <div className="lp-esr-stat">
              <div className="lp-esr-label">Abnormality</div>
              <div className="lp-esr-value warn">29%</div>
            </div>
            <div className="lp-esr-stat">
              <div className="lp-esr-label">Confidence</div>
              <div className="lp-esr-value ok">95%</div>
            </div>
            <div className="lp-esr-stat">
              <div className="lp-esr-label">Events flagged</div>
              <div className="lp-esr-value">4</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── AI Drafted Report Demo View ─── */
const ReportView: React.FC = () => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, 4)), 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="lp-report-demo">
      <div className="lp-report-doc">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Edit EEG Report</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Patient · 22M · Session 0000138</div>
          </div>
          <span style={{ padding: '4px 10px', background: '#fef3c7', color: '#92400e', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>DRAFT</span>
        </div>

        <h3>Indications</h3>
        <p>EEG to investigate a seizure disorder.</p>

        <h3>Technique</h3>
        <p>Multichannel digital EEG using the international 10-20 electrode placement system. Recording started after machine calibration; patient was awake and cooperative throughout.</p>

        {step >= 1 && (
          <>
            <h3>Background <span className="lp-ai-marker-inline">AI draft</span></h3>
            <p>Posterior dominant rhythm of <strong>8.6 Hz</strong> is observed bilaterally, well-formed and symmetric, with reactivity to eye opening.</p>
          </>
        )}
        {step >= 2 && (
          <>
            <h3>Findings <span className="lp-ai-marker-inline">AI draft</span></h3>
            <p>Generalized slowing is present with more marked slowing over the frontal and temporal regions. Rare epileptiform discharges, including <strong>spike-wave at C3</strong> and <strong>sharp waves at T4</strong>, are identified.</p>
          </>
        )}
        {step >= 3 && (
          <>
            <h3>Impression <span className="lp-ai-marker-inline">AI draft</span></h3>
            <p>Abnormal EEG due to focal epileptiform activity over the left central region, supporting a focal seizure substrate.</p>
          </>
        )}
        {step >= 4 && (
          <>
            <h3>Recommendation</h3>
            <p>Clinical correlation with seizure semiology is advised. Prolonged or sleep-deprived EEG may further characterize the focal abnormality.</p>
          </>
        )}
      </div>

      <div className="lp-report-side">
        <div className="lp-findings-card">
          <h4>AI Findings <span className="lp-live"><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>Live</span></h4>
          <div className="lp-finding">
            <div className="lp-f-label">Posterior Dominant Rhythm</div>
            <div className="lp-f-conf">
              <span>8.6 Hz · normal</span>
              <div className="lp-f-conf-bar"><div className="lp-f-conf-fill" style={{ width: '94%' }}></div></div>
              <span>94%</span>
            </div>
          </div>
          <div className="lp-finding warn">
            <div className="lp-f-label">Generalized slowing</div>
            <div className="lp-f-conf">
              <span>frontal · temporal</span>
              <div className="lp-f-conf-bar"><div className="lp-f-conf-fill" style={{ width: '81%' }}></div></div>
              <span>81%</span>
            </div>
          </div>
          <div className="lp-finding alert">
            <div className="lp-f-label">Spike-wave · C3</div>
            <div className="lp-f-conf">
              <span>focal epileptiform</span>
              <div className="lp-f-conf-bar"><div className="lp-f-conf-fill" style={{ width: '92%' }}></div></div>
              <span>92%</span>
            </div>
          </div>
        </div>
        <div className="lp-review-bar">
          <div>
            <div className="lp-rb-label">Reviewing clinician</div>
            <div className="lp-rb-clinician">
              <div className="lp-review-avatar">DK</div>
              Dr. Khan
            </div>
          </div>
          <button className="lp-approve-btn">Approve</button>
        </div>
      </div>
    </div>
  );
};

/* ─── Demo Section ─── */
const DemoSection: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    if (!autoRotate) return;
    const id = setInterval(() => setTab((t) => (t + 1) % 3), 7000);
    return () => clearInterval(id);
  }, [autoRotate]);

  const handleClick = (i: number) => {
    setAutoRotate(false);
    setTab(i);
  };

  return (
    <div className="lp-demo-screen">
      <div className="lp-demo-tabs">
        {['Patient Registry', 'EEG Analysis', 'AI-Drafted Report'].map((label, i) => (
          <button
            key={i}
            className={`lp-demo-tab${tab === i ? ' active' : ''}`}
            onClick={() => handleClick(i)}
          >
            <span className="lp-tab-num">{i + 1}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="lp-demo-body">
        {tab === 0 && <PatientRegistryView />}
        {tab === 1 && <EegAnalysisView />}
        {tab === 2 && <ReportView />}
      </div>
    </div>
  );
};

/* ─── Logo Mark ─── */
const LogoMark: React.FC = () => (
  <span className="lp-logo-mark">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 12 L7 12 L9 6 L12 18 L15 9 L17 12 L21 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

/* ═══════════════════════════════════════════════════════════
   LandingPage — main component
   ═══════════════════════════════════════════════════════════ */
const LandingPage: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const { startDemo } = useDemo();

  const handleStartDemo = useCallback(() => {
    startDemo();
    navigate('/register/hospital');
  }, [startDemo, navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleTryNow = useCallback(() => {
    navigate('/register/hospital');
  }, [navigate]);

  const handleLogin = useCallback(() => {
    navigate('/');
  }, [navigate]);

  return (
    <div className="lp">
      {/* ═══ NAV ═══ */}
      <nav className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <span className="lp-nav-brand" role="button" tabIndex={0} onClick={() => scrollTo('hero')}>
          <LogoMark />
          <span>
            <span className="lp-brand-cere">Cere</span>
            <span className="lp-brand-signal">Signal</span>
          </span>
        </span>
        <div className="lp-nav-links">
          <button className="lp-nav-link" onClick={() => scrollTo('how')}>How it works</button>
          <button className="lp-nav-link" onClick={() => scrollTo('demo')}>See it live</button>
          <button className="lp-nav-link" onClick={() => scrollTo('architecture')}>Why CereSignal</button>
          <button className="lp-nav-link" onClick={() => scrollTo('safety')}>Safety</button>
          <button className="lp-nav-link" onClick={() => navigate('/contact')}>Contact</button>
        </div>
        <div className="lp-nav-actions">
          <button className="lp-nav-login" onClick={handleLogin}>Login</button>
          <button className="lp-nav-cta" onClick={handleTryNow}>Try Now →</button>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="lp-hero" id="hero">
        <div className="lp-hero-grid"></div>
        <div className="lp-hero-inner">
          <div>
            <div className="lp-hero-eyebrow">
              <span className="lp-eyebrow-pulse"></span>
              AI-Powered EEG Reporting
            </div>
            <h1>
              From raw signal<br />
              to <span style={{ fontStyle: 'italic' }} className="lp-accent">structured report</span>,<br />
              in minutes.
            </h1>
            <p className="lp-lead">
              CereSignal uses AI to turn EEG recordings into clear, ready-to-sign reports — cutting reporting time from days to hours, so your specialists can focus on patients, not paperwork.
            </p>
            <div className="lp-hero-ctas">
              <button className="lp-btn-primary" onClick={handleTryNow}>
                Try Now
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <button className="lp-btn-secondary" onClick={() => scrollTo('demo')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                </svg>
                Watch the pipeline
              </button>
              <button
                className="lp-btn-demo"
                onClick={handleStartDemo}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 22px',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(245,158,11,0.35)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseOver={e => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 20px rgba(245,158,11,0.45)';
                }}
                onMouseOut={e => {
                  (e.currentTarget as HTMLButtonElement).style.transform = '';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 14px rgba(245,158,11,0.35)';
                }}
              >
                ▶ Start Guided Demo
              </button>
            </div>
            <div className="lp-hero-trust">
              <div className="lp-trust-item"><span className="lp-trust-dot"></span> Built at NUST · Islamabad</div>
              <div className="lp-trust-item"><span className="lp-trust-dot"></span> Works with your EEG machine</div>
              <div className="lp-trust-item"><span className="lp-trust-dot"></span> Clinician-approved drafts</div>
            </div>
          </div>
          <HeroEEG />
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      <section className="lp-stats">
        <div className="lp-stats-inner">
          <div className="lp-stat">
            <div className="lp-num">~1<span className="lp-small"> per</span> 200k</div>
            <div className="lp-lbl">Neurologists per capita in high-need regions — leaving thousands of EEGs unread.</div>
          </div>
          <div className="lp-stat">
            <div className="lp-num">8×</div>
            <div className="lp-lbl">Faster first-draft reporting once recording lands in the queue.</div>
          </div>
          <div className="lp-stat">
            <div className="lp-num">19<span className="lp-small"> ch</span></div>
            <div className="lp-lbl">Every channel of a standard EEG read in parallel — nothing missed.</div>
          </div>
          <div className="lp-stat">
            <div className="lp-num">100%</div>
            <div className="lp-lbl">Of finalized reports pass through specialist review and signature.</div>
          </div>
        </div>
      </section>

      {/* ═══ PROBLEM / REPORTING GAP ═══ */}
      <section className="lp-block">
        <div className="lp-block-inner">
          <div className="lp-problem-grid">
            <div className="lp-problem-visual">
              <div className="lp-problem-counter">
                <div>
                  <div className="lp-counter-num">247<span className="lp-plus">+</span></div>
                  <div className="lp-counter-lbl">Unread EEGs · this month</div>
                </div>
                <div className="lp-problem-tag-eta">
                  <div style={{ opacity: 0.6, fontSize: 10 }}>AVG ETA</div>
                  <div className="lp-eta-v">14 days</div>
                </div>
              </div>
              <div className="lp-problem-stack">
                {[
                  { pid: 'EEG-00184', label: 'pending', late: false },
                  { pid: 'EEG-00185', label: '8d wait', late: true },
                  { pid: 'EEG-00186', label: 'pending', late: false },
                  { pid: 'EEG-00187', label: '12d wait', late: true },
                  { pid: 'EEG-00188', label: 'pending', late: false },
                  { pid: 'EEG-00189', label: '5d wait', late: false },
                  { pid: 'EEG-00190', label: '17d wait', late: true },
                ].map((p, i) => (
                  <div key={i} className={`lp-stack-paper${p.late ? ' late' : ''}`} style={{ animationDelay: `${i * 0.3}s` }}>
                    <span className="lp-pid">{p.pid}</span>
                    <span className="lp-badge">{p.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="lp-section-eyebrow">The Reporting Gap</div>
              <h2 className="lp-section-title">Backlogs grow <span style={{ fontStyle: 'italic' }}>faster</span> than specialists can read.</h2>
              <p className="lp-section-sub">In high-need settings like Pakistan, a handful of neurologists carry the weight of thousands of EEGs. The result: delayed diagnoses, repetitive documentation, and overworked clinicians.</p>
              <div className="lp-problem-points">
                <div className="lp-problem-point">
                  <div className="lp-point-num">1</div>
                  <div>
                    <h4>Severe specialist scarcity</h4>
                    <p>Few neurologists relative to demand means EEG reports are bottlenecked at the human bandwidth.</p>
                  </div>
                </div>
                <div className="lp-problem-point">
                  <div className="lp-point-num">2</div>
                  <div>
                    <h4>Repetitive documentation load</h4>
                    <p>Each report follows a structured template. Drafting from scratch costs cognitive energy without clinical insight.</p>
                  </div>
                </div>
                <div className="lp-problem-point">
                  <div className="lp-point-num">3</div>
                  <div>
                    <h4>Inconsistent throughput</h4>
                    <p>Variable turnaround puts patients with abnormal findings at risk of late-stage discovery.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PIPELINE / HOW IT WORKS ═══ */}
      <section className="lp-block dark" id="how">
        <div className="lp-block-inner">
          <div className="lp-section-eyebrow">How it works</div>
          <h2 className="lp-section-title">From recording to <span style={{ fontStyle: 'italic' }}>signed report</span>, in four simple steps.</h2>
          <p className="lp-section-sub">A clear, all-in-one workflow your team can pick up on day one — no technical training required.</p>
          <div className="lp-pipeline-flow">
            {[
              {
                step: 'STEP 01',
                title: 'Upload the recording',
                desc: 'Your technician registers the patient and uploads the EEG file. One screen, one click — the case is on its way.',
                meta: ['One-click', 'Any EEG machine'],
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
              },
              {
                step: 'STEP 02',
                title: 'AI reads every channel',
                desc: 'Our AI scans the full recording in seconds, highlighting abnormal patterns and flagging exactly where they occur.',
                meta: ['Seconds, not days', 'Every channel'],
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 12h3l3-9 3 18 3-9 3 6h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
              },
              {
                step: 'STEP 03',
                title: 'A draft report is written',
                desc: 'AI assembles a structured first draft using your hospital\u2019s reporting template \u2014 so clinicians start from a polished starting point.',
                meta: ['Your template', 'Polished draft'],
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h12M4 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
              },
              {
                step: 'STEP 04',
                title: 'Your specialist signs off',
                desc: 'The clinician reviews the signal, edits the draft as needed, and signs. The patient gets their report \u2014 same day.',
                meta: ['Human-signed', 'Same-day delivery'],
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
              },
            ].map((p, i, arr) => (
              <div key={i} className="lp-pipe-card">
                <div className="lp-pipe-step">{p.step}</div>
                <div className="lp-pipe-icon">{p.icon}</div>
                <h4>{p.title}</h4>
                <p>{p.desc}</p>
                <div className="lp-meta-row">
                  <span>{p.meta[0]}</span>
                  <span>{p.meta[1]}</span>
                </div>
                {i < arr.length - 1 && (
                  <div className="lp-pipe-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14m-6-6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DEMO ═══ */}
      <section className="lp-block" id="demo" style={{ background: 'var(--lp-paper-warm)' }}>
        <div className="lp-block-inner">
          <div className="lp-section-eyebrow">See it live</div>
          <h2 className="lp-section-title">A guided walkthrough of the <span style={{ fontStyle: 'italic' }}>clinical workflow</span>.</h2>
          <p className="lp-section-sub">From the moment a recording is registered to the moment a clinician approves the draft — the same screens your team will use every day.</p>
          <DemoSection />
        </div>
      </section>

      {/* ═══ ROLES ═══ */}
      <section className="lp-block">
        <div className="lp-block-inner">
          <div className="lp-section-eyebrow">Built for the whole care team</div>
          <h2 className="lp-section-title">Three dashboards, <span style={{ fontStyle: 'italic' }}>one</span> source of truth.</h2>
          <p className="lp-section-sub">Role-specific surfaces keep technicians, doctors, and patients oriented toward the right next action.</p>
          <div className="lp-roles-grid">
            {/* Technician */}
            <div className="lp-role-card tech">
              <div className="lp-ribbon"></div>
              <div className="lp-role-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2v4M2 12h4M12 22v-4M22 12h-4M5 5l3 3M19 5l-3 3M19 19l-3-3M5 19l3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
              <h3>Technician</h3>
              <p className="lp-role-sub">Registers patients, uploads recordings, and keeps the day moving.</p>
              <div className="lp-role-feats">
                {['One-stop patient and recording upload', 'Live status of every case', 'Email and download with one click'].map((f, i) => (
                  <div key={i} className="lp-role-feat">
                    <span className="lp-check">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Clinician */}
            <div className="lp-role-card">
              <div className="lp-ribbon"></div>
              <div className="lp-role-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <h3>Clinician</h3>
              <p className="lp-role-sub">Reviews the recording, refines the AI draft, and signs the final report.</p>
              <div className="lp-role-feats">
                {['Recording and draft side-by-side', 'AI findings ranked by confidence', 'Edit and sign in a single screen'].map((f, i) => (
                  <div key={i} className="lp-role-feat">
                    <span className="lp-check">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Patient */}
            <div className="lp-role-card patient">
              <div className="lp-ribbon"></div>
              <div className="lp-role-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
                  <path d="M4 21c0-4 4-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <h3>Patient</h3>
              <p className="lp-role-sub">Receives a clear, signed report and follow-up guidance.</p>
              <div className="lp-role-feats">
                {['Plain-language summary', 'Secure email delivery', 'Direct line to their clinician'].map((f, i) => (
                  <div key={i} className="lp-role-feat">
                    <span className="lp-check">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ WHY HOSPITALS CHOOSE CERESIGNAL ═══ */}
      <section className="lp-block dark" id="architecture">
        <div className="lp-block-inner">
          <div className="lp-section-eyebrow">Why hospitals choose CereSignal</div>
          <h2 className="lp-section-title">Modern, fast, and <span style={{ fontStyle: 'italic' }}>all in one place</span>.</h2>
          <p className="lp-section-sub">Built for real hospital workflows — so your team spends less time on paperwork and more time on patients.</p>
          <div className="lp-arch-grid">
            <div className="lp-arch-panel large">
              <h3>One platform, end to end</h3>
              <p>From the moment a recording is uploaded to the moment a patient receives their report — every step lives in one secure place. No spreadsheets. No email chains. No lost files.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 24 }}>
                {[
                  { t: 'Upload', s: 'Recording arrives' },
                  { t: 'Analyze', s: 'AI reads the signal' },
                  { t: 'Draft', s: 'Report is written' },
                  { t: 'Sign', s: 'Specialist approves' },
                ].map((c, i) => (
                  <div key={i} className="lp-arch-step-card">
                    <div style={{ fontSize: 11, color: 'var(--lp-blue-300)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Step {i + 1}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{c.t}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{c.s}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lp-arch-panel">
              <h3>Faster turnarounds</h3>
              <p>What used to take days now takes hours. Same-day reports become the norm, not the exception.</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 24 }}>
                <div className="lp-arch-stat-big">8×</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>faster from recording<br />to signed report</div>
              </div>
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                Backlogs shrink. Patients get answers sooner. Clinicians end the day on time.
              </div>
            </div>
            <div className="lp-arch-panel">
              <h3>Easy to roll out</h3>
              <p>No new hardware. No complicated training. We work with your existing EEG machines and your existing team.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
                {[
                  { t: 'Works with your EEG', s: 'Standard recordings' },
                  { t: 'Runs on-site', s: 'Patient data stays in-house' },
                  { t: 'Quick onboarding', s: 'Live in under a week' },
                  { t: 'Your template', s: 'Reports match your format' },
                ].map((c, i) => (
                  <div key={i} className="lp-arch-tag">
                    <h5>{c.t}</h5>
                    <span>{c.s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SAFETY ═══ */}
      <section className="lp-block" id="safety">
        <div className="lp-block-inner">
          <div className="lp-safety-strip">
            <div>
              <div className="lp-section-eyebrow">Safety & Authority</div>
              <h2 className="lp-section-title">The clinician is <span style={{ fontStyle: 'italic' }}>always</span> the final author.</h2>
              <p className="lp-section-sub">CereSignal is built to reduce cognitive load — not replace medical judgement. Every finalized report carries a human signature and a complete audit trail.</p>
              <div className="lp-safety-bullets">
                <div className="lp-safety-bullet">
                  <div className="lp-sb-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </div>
                  <div>
                    <h4>Human-signed by default</h4>
                    <p>No report exits the system without a credentialed clinician's review and explicit approval.</p>
                  </div>
                </div>
                <div className="lp-safety-bullet">
                  <div className="lp-sb-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <h4>Complete audit trail</h4>
                    <p>Every model output, every clinician edit, and every signature is timestamped and append-only.</p>
                  </div>
                </div>
                <div className="lp-safety-bullet">
                  <div className="lp-sb-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M9 12l2 2 4-4m-9 4a9 9 0 1118 0 9 9 0 01-18 0z" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </div>
                  <div>
                    <h4>Calibrated confidence</h4>
                    <p>Every finding ships with a calibrated score — so reviewers know exactly where to focus their attention.</p>
                  </div>
                </div>
                <div className="lp-safety-bullet">
                  <div className="lp-sb-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M3 12h4l3-8 4 16 3-8h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <h4>Evidence-anchored narrative</h4>
                    <p>Every finding in the draft links back to the exact moment in the recording — so reviewers can verify in seconds.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="lp-safety-visual">
              <div className="lp-audit-trail">
                <div className="lp-audit-head">
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>SESSION 0000138 · AUDIT TRAIL</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Patient · 22M</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--lp-signal-green)' }}>&#9679; SIGNED</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', marginTop: 4, opacity: 0.6 }}>5/3/2026</div>
                  </div>
                </div>
                {[
                  { t: '09:42:01', actor: 'Tech · A. Khan', tag: 'human', desc: 'Uploaded recording · 10 min, 19 channels' },
                  { t: '09:42:14', actor: 'CereSignal AI', tag: 'ai', desc: 'Recording read and prepared for analysis' },
                  { t: '09:43:08', actor: 'CereSignal AI', tag: 'ai', desc: 'Flagged: spike-wave at C3 (92%), sharp wave at T4 (84%)' },
                  { t: '09:43:31', actor: 'CereSignal AI', tag: 'ai', desc: 'Draft report generated · 4 sections · linked to recording' },
                  { t: '10:11:47', actor: 'Dr. Khan', tag: 'human', desc: 'Edited impression · added a recommendation' },
                  { t: '10:13:02', actor: 'Dr. Khan', tag: 'human', desc: 'Approved & signed · report sent to patient' },
                ].map((e, i) => (
                  <div key={i} className="lp-audit-row">
                    <div className="lp-a-time">{e.t}</div>
                    <div>
                      <div className="lp-a-actor">
                        {e.actor}
                        <span className={`lp-a-tag ${e.tag}`}>{e.tag}</span>
                      </div>
                      <div className="lp-a-desc">{e.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="lp-cta-block" id="cta">
        <div className="lp-cta-eeg-bg">
          <CtaWaveBg />
        </div>
        <div className="lp-cta-inner">
          <div className="lp-section-eyebrow" style={{ color: 'var(--lp-blue-300)' }}>Pilot Program · 2026</div>
          <h2>Bring <span style={{ fontStyle: 'italic' }}>faster, safer</span> EEG reporting to your hospital.</h2>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: 'rgba(255,255,255,0.7)', margin: '0 0 36px' }}>
            We're partnering with a small set of hospitals to validate clinical workflows in real-world conditions. If you operate an EEG service that's wrestling with backlog, we'd love to talk.
          </p>
          <div className="lp-cta-actions">
            <button className="lp-btn-primary" onClick={handleTryNow}>
              Try Now →
            </button>
          </div>
          <div style={{ marginTop: 40, fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
            developed at NUST · Islamabad · 2026
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-about">
            <span className="lp-nav-brand" style={{ color: 'white', cursor: 'default' }}>
              <LogoMark />
              <span>
                <span className="lp-brand-cere">Cere</span>
                <span className="lp-brand-signal">Signal</span>
              </span>
            </span>
            <p>An AI-powered platform that helps hospitals report EEGs faster — without compromising on care. Developed at the National University of Sciences and Technology, Islamabad.</p>
          </div>
          <div>
            <h5>Product</h5>
            <ul>
              <li><button className="lp-nav-link" onClick={() => scrollTo('how')} style={{ color: 'inherit', textDecoration: 'none' }}>How it works</button></li>
              <li><button className="lp-nav-link" onClick={() => scrollTo('demo')} style={{ color: 'inherit', textDecoration: 'none' }}>See it live</button></li>
              <li><button className="lp-nav-link" onClick={() => scrollTo('architecture')} style={{ color: 'inherit', textDecoration: 'none' }}>Why CereSignal</button></li>
              <li><button className="lp-nav-link" onClick={() => scrollTo('safety')} style={{ color: 'inherit', textDecoration: 'none' }}>Safety</button></li>
            </ul>
          </div>
          <div>
            <h5>Get Started</h5>
            <ul>
              <li><a href="#" onClick={(e) => { e.preventDefault(); handleTryNow(); }}>Try Now</a></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); handleLogin(); }}>Login</a></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); navigate('/register/hospital'); }}>Register</a></li>
            </ul>
          </div>
          <div>
            <h5>Contact</h5>
            <ul>
              <li><a href="/#/contact" onClick={(e) => { e.preventDefault(); navigate('/contact'); }}>Contact us</a></li>
              <li><a href="mailto:arsal4an@gmail.com">arsal4an@gmail.com</a></li>
            </ul>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>&copy; 2026 CereSignal · Research framework · Not a medical device</span>
          <span>v0.4.2 · pilot</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
