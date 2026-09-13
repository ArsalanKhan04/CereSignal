import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { validateName, validateEmail, validateRequired, collectErrors, extractApiErrors } from '../utils/validation';
import FormAlert from '../components/FormAlert';
import './LandingPage.css';
import './ContactPage.css';

const LogoMark: React.FC = () => (
  <span className="lp-logo-mark">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 12 L7 12 L9 6 L12 18 L15 9 L17 12 L21 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

interface ContactForm {
  firstName: string;
  lastName: string;
  email: string;
  hospital: string;
  role: string;
  country: string;
  volume: string;
  interest: string;
  message: string;
}

const interests = [
  { value: 'pilot', label: 'Clinical pilot' },
  { value: 'demo', label: 'Live demo' },
  { value: 'pricing', label: 'Pricing & rollout' },
  { value: 'research', label: 'Research collaboration' },
  { value: 'other', label: 'Something else' },
];

const ContactPage: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [form, setForm] = useState<ContactForm>({
    firstName: '',
    lastName: '',
    email: '',
    hospital: '',
    role: '',
    country: '',
    volume: '',
    interest: 'pilot',
    message: '',
  });
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const update = useCallback((k: keyof ContactForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError('');
    setFormSuccess('');

    const errors = collectErrors(
      validateName(form.firstName, 'firstName', 'First name'),
      validateName(form.lastName, 'lastName', 'Last name'),
      validateEmail(form.email),
      validateRequired(form.role, 'role', 'Role'),
      validateRequired(form.hospital, 'hospital', 'Hospital'),
      validateRequired(form.country, 'country', 'Country'),
    );
    if (errors.length > 0) {
      const errMap: Record<string, string> = {};
      errors.forEach((e) => { errMap[e.field] = e.message; });
      setFieldErrors(errMap);
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.submitContact({
        first_name: form.firstName,
        last_name: form.lastName,
        email: form.email,
        hospital: form.hospital,
        role: form.role,
        country: form.country,
        volume: form.volume,
        interest: form.interest,
        message: form.message,
      });
      setFormSuccess('Your message has been sent. We\'ll be in touch within one business day.');
      setSubmitted(true);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message;
      const parsed = extractApiErrors(detail);
      if (parsed.general) {
        setFormError(parsed.general);
      }
      if (parsed.fields.length > 0) {
        const fieldMap: Record<string, string> = {};
        parsed.fields.forEach((f) => { fieldMap[f.field] = f.message; });
        setFieldErrors(fieldMap);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lp">
      {/* NAV */}
      <nav className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <span className="lp-nav-brand" role="button" tabIndex={0} onClick={() => navigate('/')}>
          <LogoMark />
          <span>
            <span className="lp-brand-cere">Cere</span>
            <span className="lp-brand-signal">Signal</span>
          </span>
        </span>
        <div className="lp-nav-links">
          <button className="lp-nav-link" onClick={() => { navigate('/'); setTimeout(() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }), 100); }}>How it works</button>
          <button className="lp-nav-link" onClick={() => { navigate('/'); setTimeout(() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' }), 100); }}>See it live</button>
          <button className="lp-nav-link" onClick={() => { navigate('/'); setTimeout(() => document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' }), 100); }}>Why CereSignal</button>
          <button className="lp-nav-link" onClick={() => { navigate('/'); setTimeout(() => document.getElementById('safety')?.scrollIntoView({ behavior: 'smooth' }), 100); }}>Safety</button>
        </div>
        <div className="lp-nav-actions">
          <button className="lp-nav-login" onClick={() => navigate('/')}>Login</button>
          <button className="lp-nav-cta" onClick={() => navigate('/')}>← Back to home</button>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-contact-hero">
        <div className="lp-hero-grid"></div>
        <div className="lp-contact-hero-inner">
          <div className="lp-hero-eyebrow" style={{ margin: '0 auto' }}>
            <span className="lp-eyebrow-pulse"></span>
            We'd love to hear from you
          </div>
          <h1>
            Let's bring CereSignal<br />
            to your <span style={{ fontStyle: 'italic' }} className="lp-accent">hospital</span>.
          </h1>
          <p className="lp-lead">
            Tell us a little about your team and we'll get in touch within one business day to set up a live demo or a clinical pilot conversation.
          </p>
        </div>
      </section>

      {/* BODY */}
      <div className="lp-contact-body">
        <div className="lp-contact-form-card">
          {!submitted ? (
            <>
              <h2>Start the conversation</h2>
              <p className="lp-form-sub">
                All fields are confidential. We never share your hospital information with third parties.
              </p>
              <p className="lp-form-sub">
                Fields marked <span className="lp-req">*</span> are required.
              </p>

              <FormAlert error={formError} success={formSuccess} onDismiss={() => { setFormError(''); setFormSuccess(''); }} />

              <form onSubmit={handleSubmit}>
                <div className="lp-form-field">
                  <label>What can we help you with?</label>
                  <div className="lp-form-chips">
                    {interests.map((i) => (
                      <div
                        key={i.value}
                        className={`lp-chip-radio${form.interest === i.value ? ' active' : ''}`}
                        onClick={() => update('interest', i.value)}
                      >
                        {i.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lp-form-row">
                  <div className="lp-form-field">
                    <label>First name<span className="lp-req" aria-hidden="true">*</span></label>
                    <input
                      required
                      value={form.firstName}
                      onChange={(e) => update('firstName', e.target.value)}
                      placeholder="Sarah"
                    />
                    {fieldErrors.firstName && <span className="lp-field-error">{fieldErrors.firstName}</span>}
                  </div>
                  <div className="lp-form-field">
                    <label>Last name<span className="lp-req" aria-hidden="true">*</span></label>
                    <input
                      required
                      value={form.lastName}
                      onChange={(e) => update('lastName', e.target.value)}
                      placeholder="Khan"
                    />
                    {fieldErrors.lastName && <span className="lp-field-error">{fieldErrors.lastName}</span>}
                  </div>
                </div>

                <div className="lp-form-row">
                  <div className="lp-form-field">
                    <label>Work email<span className="lp-req" aria-hidden="true">*</span></label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                      placeholder="sarah.khan@hospital.com"
                    />
                    {fieldErrors.email && <span className="lp-field-error">{fieldErrors.email}</span>}
                  </div>
                  <div className="lp-form-field">
                    <label>Your role<span className="lp-req" aria-hidden="true">*</span></label>
                    <select required value={form.role} onChange={(e) => update('role', e.target.value)}>
                      <option value="">Select your role…</option>
                      <option>Hospital administrator</option>
                      <option>Department head</option>
                      <option>Neurologist</option>
                      <option>EEG technician</option>
                      <option>IT / procurement</option>
                      <option>Other</option>
                    </select>
                    {fieldErrors.role && <span className="lp-field-error">{fieldErrors.role}</span>}
                  </div>
                </div>

                <div className="lp-form-row">
                  <div className="lp-form-field">
                    <label>Hospital or clinic<span className="lp-req" aria-hidden="true">*</span></label>
                    <input
                      required
                      value={form.hospital}
                      onChange={(e) => update('hospital', e.target.value)}
                      placeholder="Aga Khan University Hospital"
                    />
                    {fieldErrors.hospital && <span className="lp-field-error">{fieldErrors.hospital}</span>}
                  </div>
                  <div className="lp-form-field">
                    <label>Country<span className="lp-req" aria-hidden="true">*</span></label>
                    <input
                      required
                      value={form.country}
                      onChange={(e) => update('country', e.target.value)}
                      placeholder="Pakistan"
                    />
                    {fieldErrors.country && <span className="lp-field-error">{fieldErrors.country}</span>}
                  </div>
                </div>

                <div className="lp-form-field">
                  <label>EEGs you process per month</label>
                  <select value={form.volume} onChange={(e) => update('volume', e.target.value)}>
                    <option value="">Approximate volume…</option>
                    <option>Fewer than 50</option>
                    <option>50 – 200</option>
                    <option>200 – 500</option>
                    <option>500 – 1,000</option>
                    <option>More than 1,000</option>
                  </select>
                </div>

                <div className="lp-form-field">
                  <label>Tell us about your goals</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => update('message', e.target.value)}
                    placeholder="What does your current EEG reporting workflow look like? Where would CereSignal help most?"
                  ></textarea>
                </div>

                <button type="submit" className="lp-form-submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'lp-spin 1s linear infinite' }}>
                        <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                        <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Sending…
                    </>
                  ) : (
                    <>
                      Send message
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="lp-form-success">
              <div className="lp-check-circle">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3>Thank you, {form.firstName || 'we got it'}.</h3>
              <p>Your message is on its way. We'll be in touch within one business day.</p>
            </div>
          )}
        </div>

        <div className="lp-contact-aside">
          <div className="lp-contact-tile">
            <div className="lp-tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            <h3>Email us directly</h3>
            <p>For pilot inquiries, demos, or partnership conversations.</p>
            <a href="mailto:arsal4an@gmail.com" className="lp-tile-value">arsal4an@gmail.com →</a>
            <div className="lp-response-stat">
              <span className="lp-response-dot"></span>
              Average response time: under 4 hours
            </div>
          </div>

          <div className="lp-contact-tile">
            <div className="lp-tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 5a2 2 0 012-2h2.5a1 1 0 011 .76l1 4a1 1 0 01-.27.95l-2 2a14 14 0 006 6l2-2a1 1 0 01.95-.27l4 1a1 1 0 01.76 1V19a2 2 0 01-2 2A18 18 0 013 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            <h3>Call our team</h3>
            <p>Prefer to talk? Reach our partnerships team during business hours, PKT.</p>
            <a href="tel:+923234707327" className="lp-tile-value">+92 323 4707 327 →</a>
            <div className="lp-response-stat">
              <span className="lp-response-dot"></span>
              Mon – Fri · 9:00 – 18:00 PKT
            </div>
          </div>

          <div className="lp-contact-tile">
            <div className="lp-tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 22s8-7 8-13a8 8 0 10-16 0c0 6 8 13 8 13z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="12" cy="9" r="3" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <h3>Visit us</h3>
            <p>
              SEECS, NUST<br />
              H-12, Islamabad, Pakistan
            </p>
            <a
              href="https://www.google.com/maps/search/?api=1&query=SEECS%2C+NUST%2C+H-12%2C+Islamabad%2C+Pakistan"
              target="_blank"
              rel="noopener noreferrer"
              className="lp-tile-value"
            >
              Get directions →
            </a>
          </div>
        </div>
      </div>

      {/* FOOTER */}
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
            <p>An AI-powered platform that helps hospitals report EEGs faster — without compromising on care.</p>
          </div>
          <div>
            <h5>Product</h5>
            <ul>
              <li><a href="/#how">How it works</a></li>
              <li><a href="/#demo">See it live</a></li>
              <li><a href="/#architecture">Why CereSignal</a></li>
              <li><a href="/#safety">Safety</a></li>
            </ul>
          </div>
          <div>
            <h5>Get Started</h5>
            <ul>
              <li><a href="/#/register/hospital">Try Now</a></li>
              <li><a href="/#/">Login</a></li>
              <li><a href="/#/register/hospital">Register</a></li>
            </ul>
          </div>
          <div>
            <h5>Contact</h5>
            <ul>
              <li><a href="/#/contact">Contact us</a></li>
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

export default ContactPage;
