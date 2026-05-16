import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, CheckCircle2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { useWallet } from '../context/WalletContext.js';
import { useBatchPay } from '../hooks/useBatchPay.js';
import { SkeletonBatchCard } from '../components/ui/Skeleton.js';
import { Button } from '../components/ui/Button.js';
import { HashChip } from '../components/ui/HashChip.js';

function formatExpiry(deadline: bigint): string {
  return new Date(Number(deadline)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Reclaim() {
  const { coinPublicKey, callCircuit } = useWallet();
  const { batches, isLoading, error, reclaim } = useBatchPay(null, coinPublicKey, callCircuit as any);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Set<string>>(new Set());

  const expired = batches.filter(b => !b.isReclaimed && BigInt(Date.now()) > b.deadline);

  const handleReclaim = useCallback(async (batchId: string) => {
    setProgress(p => ({ ...p, [batchId]: 'Reclaiming…' }));
    try {
      await reclaim(batchId);
      setDone(d => new Set(d).add(batchId));
      setProgress(p => ({ ...p, [batchId]: 'Complete' }));
    } catch (e) {
      setProgress(p => ({ ...p, [batchId]: e instanceof Error ? e.message : 'Failed' }));
    }
  }, [reclaim]);

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-2">
        <RefreshCw size={18} style={{ color: 'var(--muted)' }} />
        <h1 className="text-2xl font-bold tracking-tight">Reclaim Expired</h1>
      </div>
      <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>
        Recover NIGHT from batches whose deadline has passed and recipients haven't claimed.
      </p>

      {isLoading && <div className="space-y-4">{[1,2].map(i => <SkeletonBatchCard key={i} />)}</div>}

      {!isLoading && expired.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-start py-16">
          <div className="p-4 rounded-2xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
            <RefreshCw size={26} style={{ color: 'var(--dim)' }} />
          </div>
          <h2 className="text-lg font-semibold mb-2">Nothing to reclaim</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)', maxWidth: 320 }}>
            Expired batches with unclaimed payments will appear here after their deadline passes.
          </p>
        </motion.div>
      )}

      {!isLoading && expired.length > 0 && (
        <motion.div className="space-y-3" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.06 } } }}>
          {expired.map(batch => {
            const isExpanded = expanded === batch.batchId;
            const isDone = done.has(batch.batchId);
            const prog = progress[batch.batchId];
            const unclaimed = batch.claimPackages.length;

            return (
              <motion.div
                key={batch.batchId}
                layout
                variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 28 } } }}
                className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}
              >
                <button className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : batch.batchId)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <HashChip hash={batch.batchId} showCopy={false} className="text-sm text-[var(--text)]" />
                      {isDone ? (
                        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--success)' }}>
                          <CheckCircle2 size={11} /> Reclaimed
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--warn-dim)', color: 'var(--warn)' }}>
                          Expired
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--muted)' }}>
                      <span>Expired {formatExpiry(batch.deadline)}</span>
                      <span>{unclaimed} unclaimed leaf{unclaimed !== 1 ? 's' : ''}</span>
                      <span className="font-mono">{batch.totalAmount.toString()} NIGHT</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {!isDone && (
                      <Button variant="danger" size="sm" isLoading={!!prog && prog !== 'Complete' && prog !== 'Failed' && !isDone}
                        onClick={e => { e.stopPropagation(); handleReclaim(batch.batchId); }}>
                        Reclaim all
                      </Button>
                    )}
                    {isExpanded ? <ChevronUp size={14} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)' }} />}
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div key="exp"
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t px-5 pb-4 pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                        {prog && (
                          <div className={`flex items-center gap-2 text-xs mb-3 p-2.5 rounded-lg ${prog === 'Complete' ? '' : prog === 'Failed' ? '' : 'opacity-70'}`}
                            style={{ background: prog === 'Complete' ? 'var(--success-dim)' : prog.includes('Failed') ? 'var(--error-dim)' : 'var(--surface-hi)', color: prog === 'Complete' ? 'var(--success)' : prog.includes('Failed') ? 'var(--error)' : 'var(--muted)' }}>
                            {prog === 'Complete' ? <CheckCircle2 size={12} /> : prog.includes('Failed') ? <AlertCircle size={12} /> : null}
                            {prog}
                          </div>
                        )}
                        <div className="space-y-2">
                          {batch.claimPackages.map((pkg, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs" style={{ background: 'var(--surface-hi)' }}>
                              <span className="font-mono w-6" style={{ color: 'var(--muted)' }}>#{i}</span>
                              <span className="font-mono font-medium">{pkg.amount.toString()} NIGHT</span>
                              <span className="flex-1 font-mono truncate" style={{ color: 'var(--muted)' }}>
                                {pkg.merkleProof?.leaf ?? 'leaf hash'}
                              </span>
                              <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--warn-dim)', color: 'var(--warn)' }}>Unclaimed</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--error-dim)', color: 'var(--error)' }}>
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}
