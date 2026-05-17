import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, Zap, Send, Shield, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button.js';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { type: 'spring' as const, stiffness: 280, damping: 28, delay: i * 0.1 },
  }),
};

const roles = [
  {
    icon: Send,
    label: 'Flow 1',
    headline: 'Batch Pay',
    body: 'Send NIGHT tokens to any number of recipients in a single transaction. Each distribution is hidden by zero-knowledge proofs.',
    to: '/app/send',
    cta: 'Create a batch',
    span: 'lg:col-span-1',
  },
  {
    icon: Zap,
    label: 'Flow 2',
    headline: 'Payment Links',
    body: 'Generate secure, private claim packages as URLs. Recipients connect their wallet and claim funds without counterparty visibility.',
    to: '/app/claim',
    cta: 'Claim a payment',
    span: 'lg:col-span-1',
  },
  {
    icon: Shield,
    label: 'Flow 3',
    headline: 'Payment Requests',
    body: 'Create on-chain payment obligations. Payers settle the requests via Batch Pay, and requesters cryptographically mark them as paid.',
    to: '/app/requests',
    cta: 'Manage requests',
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
      <section className="min-h-[100dvh] flex flex-col justify-center relative px-6 md:px-12 pt-20 overflow-hidden">
        {/* Spotlight Effects */}
        <div className="spotlight-top" />
        <div className="spotlight-beam hidden lg:block" />

        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center z-10 relative">
          
          {/* Left Content */}
          <div className="flex flex-col items-start text-left">
            <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible" className="mb-8">
              <span className="text-xs font-semibold tracking-widest text-[var(--muted)]">
                [ Next-Gen Privacy ]
              </span>
            </motion.div>

            <motion.h1
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="text-5xl md:text-7xl font-bold tracking-tighter leading-[1.05] mb-6 text-white"
            >
              Transacting with us <br />
              Beyond Boundaries
            </motion.h1>

            <motion.p
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="text-base md:text-lg max-w-[500px] mb-12 text-[var(--muted)]"
              style={{ lineHeight: 1.6 }}
            >
              Simplified zero-knowledge payment fractionalization with Unrivaled Market Access via Tesseract.
            </motion.p>

            <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
              <div className="relative group inline-block">
                {/* Glowing Button Border Effect */}
                <div className="absolute -inset-[2px] bg-gradient-to-r from-[var(--accent)] to-purple-600 rounded-2xl opacity-70 group-hover:opacity-100 blur-sm transition-opacity duration-300"></div>
                <Button variant="primary" size="lg" magnetic onClick={() => navigate('/app/send')} className="relative bg-[var(--surface-hi)] border-none text-white hover:bg-[var(--surface-hi)] px-8 py-4 rounded-xl gap-3">
                  Get Started
                  <ArrowRight size={16} />
                </Button>
              </div>
            </motion.div>
          </div>

          {/* Right Floating Elements */}
          <div className="hidden lg:flex justify-center items-center relative h-[600px]">
             {/* We simulate the floating 3D cards from the screenshot using Framer Motion on simple glass panels */}
             <motion.div 
               animate={{ y: [-10, 10, -10], rotateZ: [-2, 2, -2] }} 
               transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
               className="absolute top-1/4 left-1/4 w-32 h-32 bg-[rgba(99,102,241,0.2)] border border-[rgba(255,255,255,0.2)] backdrop-blur-xl rounded-3xl shadow-[0_0_40px_rgba(99,102,241,0.4)] flex items-center justify-center z-30"
               style={{ transform: 'perspective(1000px) rotateX(20deg) rotateY(-20deg)' }}
             >
               <Zap size={48} className="text-white opacity-80" />
             </motion.div>

             <motion.div 
               animate={{ y: [15, -15, 15], rotateZ: [1, -1, 1] }} 
               transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
               className="absolute top-1/2 right-1/4 w-40 h-40 bg-[rgba(99,102,241,0.4)] border border-[rgba(255,255,255,0.3)] backdrop-blur-2xl rounded-[2rem] shadow-[0_0_60px_rgba(99,102,241,0.6)] flex items-center justify-center z-20"
               style={{ transform: 'perspective(1000px) rotateX(15deg) rotateY(-15deg)' }}
             >
               <Shield size={64} className="text-white" />
             </motion.div>

             <motion.div 
               animate={{ y: [-5, 15, -5], rotateZ: [-1, 2, -1] }} 
               transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
               className="absolute bottom-1/4 left-1/3 w-24 h-24 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center z-10"
               style={{ transform: 'perspective(1000px) rotateX(25deg) rotateY(-10deg)' }}
             >
               <Send size={32} className="text-[var(--muted)]" />
             </motion.div>
          </div>
        </div>

        {/* Gradient fade at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-20" style={{ background: 'linear-gradient(to top, var(--bg), transparent)' }} />
      </section>


      {/* Redefining Finance / Bento Grid */}
      <section id="features" className="py-32 px-6 md:px-12 relative z-10 max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-16 gap-8">
          <Section>
            <p className="text-xs font-bold tracking-widest text-[var(--muted)] mb-6 uppercase">
              [ Core Protocol ]
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-white max-w-2xl leading-[1.15]">
              Three Native Flows <br/> One Shared Primitive
            </h2>
          </Section>
          <Section className="lg:text-right">
             <p className="text-sm text-[var(--muted)] max-w-[320px] mb-8 leading-relaxed lg:ml-auto">
                Tesseract bridges classic business payments with blockchain innovation, unlocking new opportunities for B2B growth and long-term value.
             </p>
             <div className="relative group inline-block">
                <div className="absolute -inset-[2px] bg-gradient-to-r from-[var(--accent)] to-purple-600 rounded-full opacity-60 group-hover:opacity-100 blur-md transition-opacity duration-400"></div>
                <Button variant="primary" size="md" onClick={() => navigate('/app/send')} className="relative bg-[#02000A] border border-[rgba(255,255,255,0.1)] text-white hover:bg-[var(--surface-hi)] px-8 py-3 rounded-full gap-2 text-xs uppercase tracking-widest transition-all duration-300">
                  Submit a request <ArrowRight size={14} className="text-[var(--accent)]" />
                </Button>
              </div>
          </Section>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {roles.map((role) => (
            <Section key={role.label} className={role.span}>
              <motion.div
                whileHover={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="doppelrand-shell h-full cursor-pointer group"
                onClick={() => navigate(role.to)}
              >
                <div className="doppelrand-core h-full flex flex-col items-start transition-colors duration-500 group-hover:bg-[rgba(255,255,255,0.02)] relative overflow-hidden">
                  
                  {/* Subtle hover glow inside card */}
                  <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-[var(--accent)] opacity-0 group-hover:opacity-20 rounded-full blur-[50px] transition-opacity duration-700 pointer-events-none" />

                  <div className="p-3 rounded-xl inline-flex mb-8 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
                    <role.icon size={22} className="text-white" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight mb-4 leading-tight text-white group-hover:text-[var(--accent)] transition-colors duration-300">{role.headline}</h3>
                  <p className="text-sm leading-relaxed mb-10 flex-1 text-[var(--muted)]">{role.body}</p>
                  
                  {/* High-end minimalist arrow */}
                  <div className="mt-auto flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)] group-hover:text-white transition-colors duration-300">
                    {role.cta} 
                    <ArrowRight size={14} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 text-[var(--accent)]" />
                  </div>
                </div>
              </motion.div>
            </Section>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 px-6 md:px-12 relative z-10 max-w-7xl mx-auto border-t border-[rgba(255,255,255,0.05)] mt-12 mb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-32 items-center">
           <Section>
              <p className="text-xs font-semibold tracking-widest text-[var(--muted)] mb-6 uppercase">[ Tesseract in numbers ]</p>
              <h2 className="text-4xl md:text-6xl font-bold tracking-tighter text-white mb-8 leading-[1.1]">
                Future-Ready <br/> Investing <br/> Starts Here
              </h2>
              <p className="text-sm md:text-base text-[var(--muted)]">Trusted by forward-thinking companies worldwide.</p>
           </Section>
           
           <Section className="space-y-12">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-[rgba(255,255,255,0.08)] pb-8 group hover:border-[var(--accent)] transition-colors duration-500">
                <span className="text-6xl lg:text-7xl font-bold text-white tracking-tighter">150+</span>
                <span className="text-sm text-[var(--muted)] mb-2 uppercase tracking-widest">Organizations</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-[rgba(255,255,255,0.08)] pb-8 group hover:border-[var(--accent)] transition-colors duration-500">
                <span className="text-6xl lg:text-7xl font-bold text-white tracking-tighter">$2T+</span>
                <span className="text-sm text-[var(--muted)] mb-2 uppercase tracking-widest">AUM Protected</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-[rgba(255,255,255,0.08)] pb-8 group hover:border-[var(--accent)] transition-colors duration-500">
                <span className="text-6xl lg:text-7xl font-bold text-white tracking-tighter">Zero</span>
                <span className="text-sm text-[var(--muted)] mb-2 uppercase tracking-widest">Data Leaks</span>
              </div>
           </Section>
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
