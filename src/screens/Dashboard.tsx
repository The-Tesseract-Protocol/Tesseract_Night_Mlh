import { motion } from 'framer-motion';
import { Plus, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBatchPay } from '../hooks/useBatchPay.js';
import { useWallet } from '../context/WalletContext.js';
import { BatchCard } from '../components/BatchCard.js';
import { SkeletonBatchCard } from '../components/ui/Skeleton.js';
import { Button } from '../components/ui/Button.js';

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 280, damping: 28 } },
};

export function Dashboard() {
  const navigate = useNavigate();
  const { coinPublicKey, client } = useWallet();
  const { batches, isLoading, reclaim } = useBatchPay(client, coinPublicKey);

  const active   = batches.filter(b => !b.isReclaimed && BigInt(Date.now()) < b.deadline);
  const expired  = batches.filter(b => !b.isReclaimed && BigInt(Date.now()) >= b.deadline);

  return (
    <div className="max-w-5xl mx-auto py-4">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-6 relative">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-[var(--accent)] opacity-5 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
              <LayoutDashboard size={18} className="text-[var(--accent)]" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
          </div>
          <p className="text-sm text-[var(--muted)] pl-1">
            Manage your zero-knowledge batch obligations.
          </p>
        </div>
        
        <div className="relative group inline-block z-10">
          <div className="absolute -inset-[1px] bg-gradient-to-r from-[var(--accent)] to-purple-600 rounded-full opacity-40 group-hover:opacity-100 blur-sm transition-opacity duration-300"></div>
          <Button variant="primary" size="md" magnetic onClick={() => navigate('/app/send')} className="relative bg-[#02000A] border border-[rgba(255,255,255,0.1)] text-white hover:bg-[var(--surface-hi)] px-6 py-2.5 rounded-full gap-2 shadow-none">
            <Plus size={16} className="text-[var(--accent)]" />
            New Batch
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-6">
          {[1, 2, 3].map(i => <SkeletonBatchCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && batches.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center py-20 px-6 relative"
        >
          <div className="doppelrand-shell w-full max-w-lg mx-auto relative group">
            <div className="absolute inset-0 bg-[var(--accent)] opacity-0 group-hover:opacity-5 rounded-full blur-[40px] pointer-events-none transition-opacity duration-700" />
            <div className="doppelrand-core flex flex-col items-center py-16">
              <div className="w-16 h-16 rounded-full mb-6 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <LayoutDashboard size={24} className="text-[var(--muted)]" />
              </div>
              <h2 className="text-xl font-bold mb-3 text-white">No active batches</h2>
              <p className="text-sm mb-10 max-w-xs leading-relaxed text-[var(--muted)]">
                Initialize your first batch to distribute NIGHT tokens to multiple recipients securely and privately.
              </p>
              
              <div className="relative group/btn inline-block">
                <div className="absolute -inset-[2px] bg-gradient-to-r from-[var(--accent)] to-purple-600 rounded-full opacity-50 group-hover/btn:opacity-100 blur-sm transition-opacity duration-300"></div>
                <Button variant="primary" size="md" magnetic onClick={() => navigate('/app/send')} className="relative bg-[var(--surface-hi)] border-none text-white hover:bg-[var(--surface-hi)] px-8 py-3 rounded-full gap-2 shadow-none">
                  <Plus size={16} />
                  Initialize Batch
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Active batches */}
      {!isLoading && active.length > 0 && (
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--muted)]">Active Contracts</p>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[rgba(16,185,129,0.1)] text-[var(--success)] border border-[rgba(16,185,129,0.2)]">{active.length}</span>
          </div>
          <motion.div variants={container} initial="hidden" animate="visible" className="space-y-4">
            {active.map(b => (
              <motion.div key={b.batchId} variants={item}>
                <BatchCard batch={b} onReclaim={reclaim} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}

      {/* Expired batches */}
      {!isLoading && expired.length > 0 && (
        <div className="mb-12">
          <p className="text-xs font-bold tracking-[0.2em] uppercase mb-6 text-[var(--muted)]">Expired Contracts</p>
          <motion.div variants={container} initial="hidden" animate="visible" className="space-y-4">
            {expired.map(b => (
              <motion.div key={b.batchId} variants={item}>
                <BatchCard batch={b} onReclaim={reclaim} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}
