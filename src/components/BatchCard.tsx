import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Link2 } from 'lucide-react';
import { StatusBadge } from './ui/StatusBadge.js';
import { HashChip } from './ui/HashChip.js';
import { CopyButton } from './ui/CopyButton.js';
import type { BatchState } from '../../agents/interfaces/submitBatchFlow.js';

interface BatchCardProps {
  batch: BatchState;
}

function formatDeadline(deadline: bigint): { countdown: string; expired: boolean } {
  const now = BigInt(Date.now());
  if (deadline < now) return { countdown: 'Expired', expired: true };
  const diff = Number(deadline - now);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return { countdown: `${Math.floor(h / 24)}d ${h % 24}h`, expired: false };
  return { countdown: `${h}h ${m}m`, expired: false };
}

export function BatchCard({ batch }: BatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { countdown, expired } = formatDeadline(batch.deadline);
  const status = batch.isReclaimed ? 'reclaimed' : expired ? 'expired' : 'active';
  const claimed = batch.claimPackages.filter(p => !p.shareableLink).length;
  const total = batch.claimPackages.length;
  const progress = total > 0 ? (claimed / total) * 100 : 0;

  return (
    <motion.div
      layout
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
    >
      {/* Header */}
      <button
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <HashChip hash={batch.batchId} showCopy={false} className="text-sm text-[var(--text)]" />
            <StatusBadge status={status as any} pulse={status === 'active'} />
            <span className="text-xs ml-auto" style={{ color: expired ? 'var(--error)' : 'var(--muted)' }}>
              {expired ? 'Expired' : `Expires ${countdown}`}
            </span>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'var(--accent)' }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', stiffness: 100, damping: 20, delay: 0.2 }}
              />
            </div>
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--muted)' }}>
              {claimed}/{total} claimed
            </span>
            <span className="text-xs font-mono font-medium whitespace-nowrap">
              {batch.totalAmount.toString()} NIGHT
            </span>
          </div>
        </div>

        <div className="shrink-0 mt-1" style={{ color: 'var(--muted)' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded claim links */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="border-t px-5 pb-4 pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>
                Claim Links
              </p>
              <div className="space-y-2">
                {batch.claimPackages.map((pkg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 py-2 px-3 rounded-xl"
                    style={{ background: 'var(--surface-hi)' }}
                  >
                    <span className="text-xs font-mono w-8 shrink-0" style={{ color: 'var(--muted)' }}>#{i}</span>
                    <span className="text-xs font-mono font-medium w-24 shrink-0">{pkg.amount.toString()} NIGHT</span>
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <Link2 size={11} style={{ color: 'var(--dim)' }} className="shrink-0" />
                      <span className="text-xs font-mono truncate" style={{ color: 'var(--muted)' }}>
                        {pkg.shareableLink?.slice(0, 48)}…
                      </span>
                    </div>
                    <CopyButton text={pkg.shareableLink ?? ''} size="sm" className="shrink-0" />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
