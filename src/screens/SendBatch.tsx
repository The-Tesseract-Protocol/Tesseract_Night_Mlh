import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ChevronRight, Send, CheckCircle2, Check, ArrowLeft } from 'lucide-react';
import { useWallet } from '../context/WalletContext.js';
import { useBatchPay } from '../hooks/useBatchPay.js';
import { Button } from '../components/ui/Button.js';
import { CopyButton } from '../components/ui/CopyButton.js';

interface Recipient { key: string; amount: string; }

const STEPS = ['Recipients', 'Configure', 'Review'];

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-3 mb-10">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{
                background: i < step ? 'var(--success)' : i === step ? 'var(--accent)' : 'var(--surface-hi)',
                color: i <= step ? '#0e1a1d' : 'var(--muted)',
              }}
              className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold"
            >
              {i < step ? <Check size={13} /> : i + 1}
            </motion.div>
            <span className={`text-sm font-medium ${i === step ? '' : 'opacity-40'}`}>{s}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="h-px w-8 transition-colors" style={{ background: i < step ? 'var(--success)' : 'var(--border-subtle)' }} />
          )}
        </div>
      ))}
    </div>
  );
}

export function SendBatch() {
  const { coinPublicKey, callCircuit } = useWallet();
  const { createBatch, isLoading, error } = useBatchPay(null, coinPublicKey, callCircuit as any);

  const [step, setStep] = useState(0);
  const [recipients, setRecipients] = useState<Recipient[]>([{ key: '', amount: '' }]);
  const [deadlineHours, setDeadlineHours] = useState(24);
  const [auditorKey, setAuditorKey] = useState('');
  const [claimPackages, setClaimPackages] = useState<any[]>([]);
  const [txHash, setTxHash] = useState('');
  const [done, setDone] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string[]>([]);

  const addRecipient = useCallback(() => setRecipients(r => [...r, { key: '', amount: '' }]), []);
  const removeRecipient = useCallback((i: number) => setRecipients(r => r.filter((_, idx) => idx !== i)), []);
  const updateRecipient = useCallback((i: number, field: 'key' | 'amount', val: string) => {
    setRecipients(r => r.map((rec, idx) => idx === i ? { ...rec, [field]: val } : rec));
  }, []);

  const totalAmount = recipients.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const isStep0Valid = recipients.every(r => r.key.trim().length >= 64 && parseFloat(r.amount) > 0);

  const handleSubmit = useCallback(async () => {
    if (!createBatch) return;
    setSubmitProgress(['Submitting batch root…']);
    try {
      const result = await createBatch(
        recipients.map(r => ({ key: r.key.trim(), amount: BigInt(Math.round(parseFloat(r.amount))) })),
        deadlineHours,
      );
      setSubmitProgress(p => [...p, `Root confirmed — tx ${result.txHash.slice(0, 12)}…`, ...result.claimPackages.map((_, i) => `Deposited coin ${i + 1}/${result.claimPackages.length}`)]);
      setClaimPackages(result.claimPackages);
      setTxHash(result.txHash);
      setDone(true);
    } catch (e) {
      setSubmitProgress([]);
    }
  }, [createBatch, recipients, deadlineHours]);

  const expiresDate = new Date(Date.now() + deadlineHours * 3600000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2.5 mb-8">
          <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
          <h1 className="text-2xl font-bold tracking-tight">Batch submitted</h1>
        </div>
        <div className="p-4 rounded-xl mb-6 text-sm" style={{ background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid rgba(52,211,153,0.15)' }}>
          Transaction confirmed · {txHash.slice(0, 12)}…{txHash.slice(-6)}
        </div>
        <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>Claim Links</p>
        <div className="space-y-2 mb-8">
          {claimPackages.map((pkg, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
              <span className="text-xs font-mono w-6 shrink-0" style={{ color: 'var(--muted)' }}>#{i}</span>
              <span className="text-xs font-mono font-medium w-28 shrink-0">{pkg.amount.toString()} NIGHT</span>
              <span className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--muted)' }}>{pkg.shareableLink?.slice(0, 52)}…</span>
              <CopyButton text={pkg.shareableLink ?? ''} size="sm" />
            </motion.div>
          ))}
        </div>
        <Button variant="ghost" size="md" onClick={() => { setDone(false); setStep(0); setRecipients([{ key: '', amount: '' }]); setSubmitProgress([]); }}>
          <Send size={14} /> Create another batch
        </Button>
      </motion.div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Send Batch</h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Send NIGHT tokens to multiple recipients with individual ZK proofs</p>
      </div>

      <ProgressBar step={step} />

      <AnimatePresence mode="wait">
        {/* Step 0 — Recipients */}
        {step === 0 && (
          <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            <div className="space-y-2 mb-4">
              {recipients.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_140px_36px] gap-2 items-start">
                  <div>
                    {i === 0 && <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Recipient Public Key</label>}
                    <input
                      value={r.key}
                      onChange={e => updateRecipient(i, 'key', e.target.value)}
                      placeholder="0x0000…0000 (64-char hex)"
                      className="w-full px-3 py-2.5 text-xs font-mono rounded-lg border outline-none transition-colors"
                      style={{ background: 'var(--surface-hi)', borderColor: r.key && r.key.length < 64 ? 'var(--error)' : 'var(--border)', color: 'var(--text)' }}
                    />
                    {r.key && r.key.length < 64 && <p className="text-[11px] mt-1" style={{ color: 'var(--error)' }}>Must be 64 hex chars</p>}
                  </div>
                  <div>
                    {i === 0 && <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Amount (NIGHT)</label>}
                    <input
                      type="number"
                      min="1"
                      value={r.amount}
                      onChange={e => updateRecipient(i, 'amount', e.target.value)}
                      placeholder="100"
                      className="w-full px-3 py-2.5 text-sm font-mono rounded-lg border outline-none"
                      style={{ background: 'var(--surface-hi)', borderColor: 'var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                  <div className={i === 0 ? 'mt-6' : ''}>
                    <button onClick={() => removeRecipient(i)} disabled={recipients.length === 1}
                      className="h-9 w-9 flex items-center justify-center rounded-lg transition-colors disabled:opacity-20"
                      style={{ color: 'var(--muted)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-4">
              <button onClick={addRecipient} disabled={recipients.length >= 65536}
                className="flex items-center gap-1.5 text-sm transition-colors"
                style={{ color: 'var(--accent)' }}>
                <Plus size={14} /> Add recipient
              </button>
              <span className="text-sm font-mono font-medium">Total: {totalAmount} NIGHT</span>
            </div>

            <div className="mt-8">
              <Button variant="primary" size="md" disabled={!isStep0Valid} onClick={() => setStep(1)} className="gap-2">
                Configure <ChevronRight size={15} />
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 1 — Configure */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="max-w-sm space-y-6">
            <div>
              <label className="text-xs font-medium mb-3 block" style={{ color: 'var(--muted)' }}>Deadline</label>
              <input type="range" min="1" max="168" value={deadlineHours} onChange={e => setDeadlineHours(Number(e.target.value))}
                className="w-full accent-cyan-400 mb-3" />
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono">{deadlineHours}h</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Expires {expiresDate}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Auditor Public Key <span className="opacity-50">(optional)</span></label>
              <input value={auditorKey} onChange={e => setAuditorKey(e.target.value)}
                placeholder="Leave blank to skip audit encryption"
                className="w-full px-3 py-2.5 text-xs font-mono rounded-lg border outline-none"
                style={{ background: 'var(--surface-hi)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button variant="ghost" size="md" onClick={() => setStep(0)}><ArrowLeft size={14} />Back</Button>
              <Button variant="primary" size="md" onClick={() => setStep(2)}>Review <ChevronRight size={15} /></Button>
            </div>
          </motion.div>
        )}

        {/* Step 2 — Review */}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="max-w-sm">
            <div className="rounded-2xl p-5 space-y-4 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
              {[
                ['Recipients', recipients.length.toString()],
                ['Total',      `${totalAmount} NIGHT`],
                ['Deadline',   `${deadlineHours}h — ${expiresDate}`],
                ['Auditor',    auditorKey ? `${auditorKey.slice(0, 12)}…` : 'None'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>{label}</span>
                  <span className="text-sm font-mono font-medium">{value}</span>
                </div>
              ))}
            </div>

            {/* Submit progress log */}
            {submitProgress.length > 0 && (
              <div className="rounded-xl p-4 mb-6 space-y-2 font-mono text-xs" style={{ background: 'var(--surface-hi)' }}>
                {submitProgress.map((line, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
                    <CheckCircle2 size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
                    <span style={{ color: 'var(--muted)' }}>{line}</span>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex items-center gap-2 opacity-60">
                    <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="inline-block">⟳</motion.span>
                    <span style={{ color: 'var(--muted)' }}>Processing…</span>
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-xs mb-4 p-3 rounded-lg" style={{ color: 'var(--error)', background: 'var(--error-dim)' }}>{error}</p>}

            <div className="flex items-center gap-3">
              <Button variant="ghost" size="md" onClick={() => setStep(1)} disabled={isLoading}><ArrowLeft size={14} />Back</Button>
              <Button variant="primary" size="md" isLoading={isLoading} onClick={handleSubmit} className="gap-2">
                <Send size={14} />Submit Batch
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
