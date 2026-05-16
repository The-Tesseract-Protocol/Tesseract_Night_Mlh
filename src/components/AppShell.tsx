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
      <div className="px-4 py-3 border border-[var(--border-subtle)] rounded-xl bg-[var(--surface-hi)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--success)]" />
            </span>
            <span className="font-mono text-xs text-[var(--text)] truncate">{short}</span>
          </div>
          <button onClick={disconnect} className="text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1 shrink-0">
            <LogOut size={12} />
          </button>
        </div>
        <p className="text-[10px] text-[var(--muted)] mt-1 ml-4">Connected</p>
      </div>
    );
  }

  return (
    <Button variant="primary" size="sm" isLoading={isConnecting} onClick={connect} className="w-full justify-center">
      {!isConnecting && <Wifi size={13} />}
      {isConnecting ? 'Connecting…' : 'Connect Lace'}
    </Button>
  );
}

function WalletGate() {
  const { connect, isConnecting, error } = useWallet();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-start justify-center min-h-[60vh] px-8 max-w-sm"
    >
      <div className="p-3 rounded-xl bg-[var(--surface-hi)] border border-[var(--border-subtle)] mb-6">
        <WifiOff size={22} className="text-[var(--muted)]" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight mb-2">Wallet not connected</h2>
      <p className="text-sm text-[var(--muted)] mb-6 leading-relaxed">
        Connect your Midnight Lace wallet to access Tesseract. Your keys never leave your browser.
      </p>
      {error && (
        <p className="text-xs text-[var(--error)] mb-4 bg-[var(--error-dim)] px-3 py-2 rounded-lg border border-[var(--error)]/20">{error}</p>
      )}
      <Button variant="primary" size="lg" magnetic isLoading={isConnecting} onClick={connect}>
        <Wifi size={15} />
        Connect Lace Wallet
      </Button>
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
        className="fixed top-0 left-0 h-full w-[232px] flex flex-col border-r border-[var(--border-subtle)] bg-[var(--surface)] z-10"
      >
        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 px-5 py-5 hover:opacity-80 transition-opacity text-left"
        >
          <div className="h-7 w-7 rounded-lg bg-[var(--accent)] flex items-center justify-center shrink-0">
            <span className="text-zinc-950 font-bold text-xs">T</span>
          </div>
          <span className="font-semibold text-sm tracking-tight">Tesseract</span>
        </button>

        {/* Wallet widget */}
        <div className="px-4 pb-4">
          <WalletWidget />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
          {navSections.map(section => (
            <div key={section.label}>
              <p className="px-2 mb-1.5 text-[10px] font-semibold tracking-widest uppercase text-[var(--dim)]">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-[var(--accent-dim)] text-[var(--accent)] font-medium'
                          : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hi)]'
                      }`
                    }
                  >
                    <Icon size={15} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Network indicator */}
        <div className="px-5 py-4 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]" />
            <span className="text-[11px] text-[var(--muted)]">Midnight Testnet</span>
          </div>
        </div>
      </motion.aside>

      {/* Main */}
      <main className="flex-1 ml-[232px] overflow-y-auto">
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
