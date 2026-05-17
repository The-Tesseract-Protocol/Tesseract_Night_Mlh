import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Send, RefreshCw, Zap, FileText, Shield, Wifi, WifiOff, LogOut } from 'lucide-react';
import { useWallet } from '../context/WalletContext.js';
import { Button } from './ui/Button.js';

const navSections = [
  {
    label: 'Payer',
    items: [
      { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/app/send',      label: 'Send Batch', icon: Send },
      { to: '/app/reclaim',   label: 'Reclaim',    icon: RefreshCw },
    ],
  },
  {
    label: 'Recipient',
    items: [
      { to: '/app/claim',   label: 'Claim Payment', icon: Zap },
    ],
  },
  {
    label: 'Requester',
    items: [
      { to: '/app/request', label: 'Payment Request', icon: FileText },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/app/audit', label: 'Audit Decrypt', icon: Shield },
    ],
  },
];

function WalletWidget() {
  const { isConnected, isConnecting, coinPublicKey, connect, disconnect } = useWallet();
  const short = coinPublicKey ? `${coinPublicKey.slice(0, 8)}…${coinPublicKey.slice(-6)}` : null;

  if (isConnected && short) {
    return (
      <div className="group relative px-4 py-3 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 hover:bg-[rgba(255,255,255,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-40" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            </span>
            <div className="flex flex-col">
              <span className="font-mono text-[11px] text-white truncate tracking-wide">{short}</span>
              <span className="text-[9px] font-medium uppercase tracking-widest text-[var(--muted)]">Lace Wallet</span>
            </div>
          </div>
          <button onClick={disconnect} className="text-[var(--muted)] hover:text-[var(--error)] transition-colors p-1.5 rounded-full hover:bg-[rgba(239,68,68,0.1)] shrink-0 opacity-0 group-hover:opacity-100 transform group-hover:scale-100 scale-90 duration-300">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Button variant="primary" size="md" magnetic isLoading={isConnecting} onClick={connect} className="w-full justify-center rounded-xl font-semibold tracking-wide shadow-[0_0_20px_rgba(34,211,238,0.15)]">
      {!isConnecting && <Wifi size={14} />}
      {isConnecting ? 'Connecting…' : 'Connect 1AM'}
    </Button>
  );
}


function WalletGate() {
  const { connect, isConnecting, error } = useWallet();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center min-h-[70vh] px-8 w-full max-w-lg mx-auto"
    >
      <div className="doppelrand-shell w-full relative group">
        {/* Ambient glow */}
        <div className="absolute -inset-10 bg-[var(--accent)] opacity-5 rounded-full blur-[60px] pointer-events-none group-hover:opacity-10 transition-opacity duration-700" />
        
        <div className="doppelrand-core flex flex-col items-center text-center py-16 relative overflow-hidden">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-8 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <WifiOff size={28} className="text-[var(--muted)]" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-3 text-white">Wallet Connection Required</h2>
          <p className="text-sm text-[var(--muted)] mb-10 leading-relaxed max-w-xs mx-auto">
            Connect your 1AM wallet to access Tesseract's private business rail. Your keys never leave your browser.
          </p>
          {error && (
            <div className="w-full text-xs text-[var(--error)] mb-8 bg-[rgba(239,68,68,0.1)] px-4 py-3 rounded-xl border border-[rgba(239,68,68,0.2)]">
              {error}
            </div>
          )}
          
          <div className="relative group/btn w-full">
            <div className="absolute -inset-[2px] bg-gradient-to-r from-[var(--accent)] to-purple-600 rounded-2xl opacity-50 group-hover/btn:opacity-100 blur-sm transition-opacity duration-300"></div>
            <Button variant="primary" size="lg" magnetic isLoading={isConnecting} onClick={connect} className="relative w-full justify-center bg-[var(--surface-hi)] border-none text-white hover:bg-[var(--surface-hi)] px-8 py-4 rounded-xl gap-3 shadow-none">
              <Wifi size={16} />
              {isConnecting ? 'Connecting…' : 'Connect 1AM Wallet'}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function AppShell() {
  const { isConnected } = useWallet();
  const navigate = useNavigate();

  return (
    <div className="flex" style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 h-full w-[240px] flex flex-col border-r border-[var(--border-subtle)] bg-[rgba(10,10,10,0.4)] backdrop-blur-3xl z-10 shadow-[1px_0_40px_rgba(0,0,0,0.5)]"
      >
        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 px-6 py-8 hover:opacity-80 transition-opacity text-left"
        >
          <div className="h-8 w-8 rounded-[0.75rem] bg-[var(--accent)] flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(34,211,238,0.3)]">
            <span className="text-zinc-950 font-bold text-sm">T</span>
          </div>
          <span className="font-semibold text-base tracking-tight text-white">Tesseract</span>
        </button>

        {/* Wallet widget */}
        <div className="px-5 pb-6">
          <WalletWidget />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-4 pb-6 space-y-8">
          {navSections.map(section => (
            <div key={section.label}>
              <p className="px-3 mb-3 text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--muted)]">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-300 ${
                        isActive
                          ? 'bg-[rgba(34,211,238,0.1)] text-[var(--accent)] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                          : 'text-[var(--muted)] hover:text-white hover:bg-[rgba(255,255,255,0.03)]'
                      }`
                    }
                  >
                    <Icon size={16} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Network indicator */}
        <div className="px-6 py-5 border-t border-[var(--border-subtle)] bg-[rgba(20,20,20,0.5)]">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
            <span className="text-xs font-medium tracking-wide text-[var(--muted)]">Testnet Active</span>
          </div>
        </div>
      </motion.aside>

      {/* Main */}
      <main className="flex-1 ml-[240px] overflow-y-auto">
        <AnimatePresence mode="wait">
          {isConnected ? (
            <motion.div
              key="app"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="px-8 py-8 max-w-[900px]"
            >
              <Outlet />
            </motion.div>
          ) : (
            <motion.div key="gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <WalletGate />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
