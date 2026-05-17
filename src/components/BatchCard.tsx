import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Link2, RotateCcw, Loader2 } from 'lucide-react';
import { StatusBadge } from './ui/StatusBadge.js';
import { HashChip } from './ui/HashChip.js';
import { CopyButton } from './ui/CopyButton.js';

interface BatchPackage {
  amount: string;
  shareableLink: string;
}

interface BatchState {
  batchId: string;
  totalAmount: bigint;
  deadline: bigint;
  isReclaimed?: boolean;
  claimPackages: BatchPackage[];
}

interface BatchCardProps {
  batch: BatchState;
  onReclaim?: (batchId: string) => Promise<number>;
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

export function BatchCard({ batch, onReclaim }: BatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [reclaiming, setReclaiming] = useState(false);
  const [reclaimResult, setReclaimResult] = useState<number | null>(null);
  const { countdown, expired } = formatDeadline(batch.deadline);
  const status = batch.isReclaimed ? 'reclaimed' : expired ? 'expired' : 'active';
  const total = batch.claimPackages?.length ?? 0;

  const handleReclaim = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onReclaim) return;
    setReclaiming(true);
    try {
      const count = await onReclaim(batch.batchId);
      setReclaimResult(count);
    } catch {
      // error handled by hook
    } finally {
      setReclaiming(false);
    }
  }, [onReclaim, batch.batchId]);

  return (
    <motion.div layout className="doppelrand-shell relative group">
      <div className="doppelrand-core !p-0 transition-colors duration-500 group-hover:bg-[rgba(255,255,255,0.02)] overflow-hidden">
        <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-[var(--accent)] opacity-0 group-hover:opacity-10 rounded-full blur-[40px] transition-opacity duration-700 pointer-events-none" />

        {/* Header */}
        <button
          className="w-full text-left px-6 py-5 flex items-start gap-4 relative z-10"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <HashChip hash={batch.batchId} showCopy={false} className="text-sm font-mono text-white bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] px-3 py-1 rounded-lg" />
              <StatusBadge status={status as any} pulse={status === 'active'} />
              <span className="text-xs ml-auto font-medium uppercase tracking-widest" style={{ color: expired ? 'var(--error)' : 'var(--muted)' }}>
                {expired ? 'Expired' : `Expires ${countdown}`}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold tracking-widest uppercase whitespace-nowrap text-[var(--muted)]">
                {total} recipients
              </span>
              <span className="text-sm font-mono font-bold whitespace-nowrap text-white ml-auto">
                {batch.totalAmount.toString()} NIGHT
              </span>
            </div>
          </div>

          <div className="shrink-0 mt-2 p-1.5 rounded-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] text-[var(--muted)] group-hover:text-white group-hover:border-[rgba(255,255,255,0.1)] transition-all">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>

        {/* Expanded */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="overflow-hidden relative z-10"
            >
              <div className="border-t border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.2)] px-6 pb-5 pt-4">
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-4 text-[var(--muted)]">
                  Cryptographic Claim Links
                </p>
                <div className="space-y-2 mb-5">
                  {batch.claimPackages?.map((pkg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-4 py-2.5 px-4 rounded-xl border border-[rgba(255,255,255,0.03)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                    >
                      <span className="text-xs font-mono w-8 shrink-0 text-[var(--muted)]">#{i}</span>
                      <span className="text-xs font-mono font-bold w-24 shrink-0 text-white">{pkg.amount} NIGHT</span>
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <Link2 size={12} className="shrink-0 text-[var(--accent)]" />
                        <span className="text-xs font-mono truncate text-[var(--muted)] hover:text-white transition-colors">
                          {pkg.shareableLink?.slice(0, 56)}…
                        </span>
                      </div>
                      <CopyButton text={pkg.shareableLink ?? ''} size="sm" className="shrink-0 opacity-50 hover:opacity-100 transition-opacity" />
                    </motion.div>
                  ))}
                </div>

                {/* Reclaim button for expired batches */}
                {expired && !batch.isReclaimed && onReclaim && (
                  <div className="pt-3 border-t border-[rgba(255,255,255,0.05)]">
                    {reclaimResult !== null ? (
                      <p className="text-xs text-[var(--success)] font-mono">
                        Reclaimed {reclaimResult} coin{reclaimResult !== 1 ? 's' : ''} successfully.
                      </p>
                    ) : (
                      <button
                        onClick={handleReclaim}
                        disabled={reclaiming}
                        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--warn)] hover:text-white transition-colors disabled:opacity-50"
                      >
                        {reclaiming ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                        {reclaiming ? 'Reclaiming…' : 'Reclaim Unclaimed Coins'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
