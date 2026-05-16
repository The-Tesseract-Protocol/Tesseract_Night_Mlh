import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, Zap, Send, Shield, RefreshCw } from 'lucide-react';
import { ZKDiagram } from '../components/ZKDiagram.js';
import { Button } from '../components/ui/Button.js';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { type: 'spring' as const, stiffness: 280, damping: 28, delay: i * 0.1 },
  }),
};

const steps = [
  {
    num: '01',
    title: 'Create a batch',
    body: 'Specify recipients and amounts. Tesseract splits your NIGHT tokens into individual ZK coins — one per recipient, independent on-chain.',
  },
  {
    num: '02',
    title: 'Recipients claim privately',
    body: 'Each recipient uses a unique link. A ZK proof is generated locally — the network verifies the claim without learning the amount or identity.',
  },
  {
    num: '03',
    title: 'Reclaim the unclaimed',
    body: 'After your deadline, any unclaimed coins return to you. No intermediaries. No trust required. The circuit enforces it.',
  },
];

const roles = [
  {
    icon: Send,
    label: 'Payer',
    headline: 'Send to any number of recipients.',
    body: 'Create a batch, share claim links, set a deadline. The contract handles the rest.',
    to: '/app/send',
    cta: 'Create a batch',
    span: 'lg:col-span-2 lg:row-span-1',
  },
  {
    icon: Zap,
    label: 'Recipient',
    headline: 'Claim with one link.',
    body: 'Open your link, connect your wallet, receive NIGHT. Your claim is private — nobody sees the amount.',
    to: '/app/claim',
    cta: 'Claim payment',
    span: 'lg:col-span-1',
  },
  {
    icon: Shield,
    label: 'Auditor',
    headline: 'Verify with your key.',
    body: 'Decrypt audit memos locally. All decryption happens in-browser — your private key is never transmitted.',
    to: '/app/audit',
    cta: 'Open audit view',
    span: 'lg:col-span-1',
  },
];

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ type: 'spring', stiffness: 250, damping: 28 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Landing() {
  const navigate = useNavigate();

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)' }} className="overflow-x-hidden">
      {/* Noise texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E")`,
          zIndex: 100,
          opacity: 0.6,
        }}
      />

      {/* Hero */}
      <section className="min-h-[100dvh] grid grid-cols-1 lg:grid-cols-2 relative">
        {/* Left */}
        <div className="flex flex-col justify-center px-8 md:px-16 lg:px-20 py-20">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[var(--accent)] mb-8">
              <span className="h-px w-8 bg-[var(--accent)]" />
              Midnight Network
            </span>
          </motion.div>

          <motion.h1
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="text-5xl md:text-6xl lg:text-[68px] font-bold tracking-tighter leading-[0.95] mb-6"
          >
            Private.<br />
            <span style={{ color: 'var(--accent)' }}>Batched.</span><br />
            Verifiable.
          </motion.h1>

          <motion.p
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="text-base md:text-lg max-w-[420px] mb-10"
            style={{ color: 'var(--muted)', lineHeight: 1.7 }}
          >
            Send NIGHT tokens to any number of recipients. Each claim is backed by a ZK proof — nobody learns who paid whom or how much.
          </motion.p>

          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible" className="flex items-center gap-3 flex-wrap">
            <Button variant="primary" size="lg" magnetic onClick={() => navigate('/app/send')} className="gap-2">
              Launch App
              <ArrowRight size={15} />
            </Button>
            <Button variant="ghost" size="lg" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>
              How it works
            </Button>
          </motion.div>

          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible" className="flex items-center gap-6 mt-12">
            {[['ZK Proofs', 'per claim'], ['0', 'trust required'], ['Any size', 'recipient list']].map(([val, sub]) => (
              <div key={val}>
                <p className="font-semibold text-sm">{val}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{sub}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right — ZK Diagram */}
        <div className="hidden lg:flex items-center justify-center px-16 py-20 relative">
          <div
            className="w-full max-w-[380px] rounded-3xl p-8"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 48px -12px rgba(0,0,0,0.6)',
            }}
          >
            <ZKDiagram />
            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>Protocol topology</span>
              <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>TesseractCore.compact</span>
            </div>
          </div>
        </div>

        {/* Gradient fade at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none" style={{ background: 'linear-gradient(to top, var(--bg), transparent)' }} />
      </section>

      {/* How it works */}
      <section id="how" className="py-28 px-8 md:px-16 lg:px-20 dot-grid">
        <Section>
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: 'var(--accent)' }}>Protocol</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-16" style={{ maxWidth: 480 }}>
            Three steps.<br />Completely private.
          </h2>
        </Section>

        <div className="max-w-[600px] relative">
          <div className="absolute left-[28px] top-0 bottom-0 w-px" style={{ background: 'var(--border-subtle)' }} />
          <div className="space-y-12">
            {steps.map((step, i) => (
              <Section key={step.num} className="flex gap-8">
                <div className="shrink-0 w-14 h-14 rounded-full flex items-center justify-center font-mono text-sm font-semibold relative z-10"
                  style={{ background: i === 0 ? 'var(--accent)' : 'var(--surface)', color: i === 0 ? '#0e1a1d' : 'var(--muted)', border: '1px solid var(--border)' }}>
                  {step.num}
                </div>
                <div className="pt-3">
                  <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)', maxWidth: 440 }}>{step.body}</p>
                </div>
              </Section>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="py-24 px-8 md:px-16 lg:px-20">
        <Section>
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: 'var(--accent)' }}>Roles</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-12">Who uses Tesseract?</h2>
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr] gap-4">
          {roles.map((role, i) => (
            <Section key={role.label}>
              <motion.div
                whileHover={{ y: -4, borderColor: 'var(--border)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="h-full rounded-2xl p-7 cursor-pointer"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
                onClick={() => navigate(role.to)}
              >
                <div className="p-2.5 rounded-xl inline-flex mb-5" style={{ background: i === 0 ? 'var(--accent-dim)' : 'var(--surface-hi)' }}>
                  <role.icon size={18} style={{ color: i === 0 ? 'var(--accent)' : 'var(--muted)' }} />
                </div>
                <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>{role.label}</p>
                <h3 className="font-semibold text-lg tracking-tight mb-3 leading-tight">{role.headline}</h3>
                <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--muted)' }}>{role.body}</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--accent)' }}>
                  {role.cta} <ArrowRight size={13} />
                </span>
              </motion.div>
            </Section>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 md:px-16 lg:px-20 py-10 border-t flex items-center justify-between flex-wrap gap-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-md flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <span className="text-zinc-950 font-bold text-xs">T</span>
          </div>
          <span className="font-semibold text-sm">Tesseract</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Built on Midnight Network — MLH Hackathon 2026</p>
        <div className="flex items-center gap-2">
          <RefreshCw size={11} style={{ color: 'var(--muted)' }} />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Testnet</span>
        </div>
      </footer>
    </div>
  );
}
