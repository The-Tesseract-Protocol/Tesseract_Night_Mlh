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
  const { coinPublicKey, callCircuit } = useWallet();
  const { batches, isLoading } = useBatchPay(null, coinPublicKey, callCircuit as any);

  const active   = batches.filter(b => !b.isReclaimed && BigInt(Date.now()) < b.deadline);
  const expired  = batches.filter(b => !b.isReclaimed && BigInt(Date.now()) >= b.deadline);

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <LayoutDashboard size={18} style={{ color: 'var(--muted)' }} />
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Your batch payment history
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => navigate('/app/send')} className="gap-2">
          <Plus size={15} />
          New Batch
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <SkeletonBatchCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && batches.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-start py-16"
        >
          <div className="p-4 rounded-2xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
            <LayoutDashboard size={28} style={{ color: 'var(--dim)' }} />
          </div>
          <h2 className="text-lg font-semibold mb-2">No batches yet</h2>
          <p className="text-sm mb-6 max-w-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            Create your first batch to send NIGHT tokens to multiple recipients in a single private transaction.
          </p>
          <Button variant="primary" size="md" magnetic onClick={() => navigate('/app/send')}>
            <Plus size={15} />
            Create first batch
          </Button>
        </motion.div>
      )}

      {/* Active batches */}
      {!isLoading && active.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Active</p>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--success-dim)', color: 'var(--success)' }}>{active.length}</span>
          </div>
          <motion.div variants={container} initial="hidden" animate="visible" className="space-y-3">
            {active.map(b => (
              <motion.div key={b.batchId} variants={item}>
                <BatchCard batch={b} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}

      {/* Expired batches */}
      {!isLoading && expired.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold tracking-widest uppercase mb-4" style={{ color: 'var(--muted)' }}>Expired</p>
          <motion.div variants={container} initial="hidden" animate="visible" className="space-y-3">
            {expired.map(b => (
              <motion.div key={b.batchId} variants={item}>
                <BatchCard batch={b} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}
