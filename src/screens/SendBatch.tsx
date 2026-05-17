import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ChevronRight, Send, CheckCircle2, Check, ArrowLeft, Shield } from 'lucide-react';
import { useWallet } from '../context/WalletContext.js';
import { useBatchPay } from '../hooks/useBatchPay.js';
import { Button } from '../components/ui/Button.js';
import { CopyButton } from '../components/ui/CopyButton.js';
import { MidnightBech32m } from '@midnight-ntwrk/wallet-sdk-address-format';
import { toHex } from '../types/index.js';

// Accept mn_shield-addr_... or raw 64-char hex. Returns 64-char hex coin public key.
function resolveRecipientKey(input: string): string {
  const trimmed = input.trim().replace(/^0x/, '');
  if (trimmed.startsWith('mn_shield-addr')) {
    const parsed = MidnightBech32m.parse(trimmed);
    if (parsed.type !== 'shield-addr') throw new Error('Not a shielded address');
    return toHex(new Uint8Array(parsed.data.subarray(0, 32)));
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
  throw new Error('Paste your shielded address (mn_shield-addr_...) or 64-char hex coin key');
}

function isValidRecipientKey(key: string): boolean {
  try { resolveRecipientKey(key); return true; } catch { return false; }
}

function getRecipientKeyError(key: string): string | null {
  if (!key.trim()) return null;
  try { resolveRecipientKey(key); return null; } catch (err) {
    const t = key.trim();
    if (t.startsWith('mn_dust')) return 'This is a DUST address. Paste your shielded address (mn_shield-addr_...) from the 1AM wallet instead.';
    if (t.startsWith('mn_addr')) return 'This is an unshielded address. Paste your shielded address (mn_shield-addr_...) instead.';
    if (t.startsWith('mn_shield-addr')) return 'Address looks truncated — copy it again from your wallet making sure to copy the complete address.';
    if (t.length > 0 && t.length !== 64) return `Expected a 64-char hex coin key or a shielded address, got ${t.length} chars.`;
    return 'Paste a shielded address (mn_shield-addr_...) from your wallet or a 64-char hex coin key.';
  }
}

interface Recipient { key: string; amount: string; }

const STEPS = ['Recipients', 'Configure', 'Review'];

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-4 mb-12">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{
                background: i < step ? 'rgba(16,185,129,0.1)' : i === step ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                color: i < step ? 'var(--success)' : i === step ? '#000' : 'var(--muted)',
                borderColor: i < step ? 'var(--success)' : i === step ? 'var(--accent)' : 'rgba(255,255,255,0.1)'
              }}
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border transition-colors duration-300 relative shadow-[0_0_15px_rgba(99,102,241,0.0)]"
              style={i === step ? { boxShadow: '0 0 20px rgba(99,102,241,0.4)' } : {}}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </motion.div>
            <span className={`text-sm font-semibold tracking-wide transition-opacity duration-300 ${i === step ? 'text-white' : 'text-[var(--muted)] opacity-50'}`}>{s}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="h-px w-10 transition-colors duration-500" style={{ background: i < step ? 'var(--success)' : 'rgba(255,255,255,0.1)' }} />
          )}
        </div>
      ))}
    </div>
  );
}

export function SendBatch() {
  const { coinPublicKey, client } = useWallet();
  const { createBatch, isLoading, error } = useBatchPay(client, coinPublicKey);

  const [step, setStep] = useState(0);
  const [recipients, setRecipients] = useState<Recipient[]>([{ key: '', amount: '' }]);
  const [deadlineHours, setDeadlineHours] = useState(24);
  const auditorPublicKey = useMemo(() => {
    try {
      const stored = localStorage.getItem('tesseract-audit-key');
      if (stored) return (JSON.parse(stored) as { publicKey: string }).publicKey;
    } catch { /* ignore */ }
    return undefined;
  }, []);

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
  const isStep0Valid = recipients.every(r => isValidRecipientKey(r.key) && parseFloat(r.amount) > 0);

  const handleSubmit = useCallback(async () => {
    if (!createBatch) return;
    setSubmitProgress(['Submitting batch root…']);
    try {
      const result = await createBatch(
        recipients.map(r => ({ key: resolveRecipientKey(r.key), amount: BigInt(Math.round(parseFloat(r.amount))) })),
        deadlineHours,
        auditorPublicKey,
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
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto py-12">
        <div className="flex flex-col items-center text-center mb-12 relative">
          <div className="absolute top-0 w-64 h-64 bg-[var(--success)] opacity-10 rounded-full blur-[100px] pointer-events-none" />
          <div className="w-20 h-20 rounded-full bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.2)] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
            <CheckCircle2 size={32} className="text-[var(--success)]" />
          </div>
          <h1 className="text-4xl font-bold tracking-tighter text-white mb-4">Batch Successfully Deployed</h1>
          <div className="px-5 py-2 rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm font-mono text-[var(--muted)]">
            TX <span className="text-white">{txHash.slice(0, 16)}…{txHash.slice(-16)}</span>
          </div>
        </div>

        <div className="doppelrand-shell mb-10">
          <div className="doppelrand-core !p-6">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-6 text-[var(--muted)] border-b border-[rgba(255,255,255,0.05)] pb-4">Claim Interfaces</p>
            <div className="space-y-3">
              {claimPackages.map((pkg, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4 rounded-xl bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.1)] transition-colors">
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <span className="text-xs font-mono w-6 shrink-0 text-[var(--muted)]">#{i}</span>
                    <span className="text-sm font-mono font-bold text-white shrink-0">{pkg.amount.toString()} NIGHT</span>
                  </div>
                  <div className="flex-1 flex items-center gap-3 bg-[rgba(255,255,255,0.02)] px-3 py-2 rounded-lg border border-[rgba(255,255,255,0.03)] w-full">
                    <span className="flex-1 text-xs font-mono truncate text-[var(--muted)]">{pkg.shareableLink}</span>
                    <CopyButton text={pkg.shareableLink ?? ''} size="sm" className="opacity-70 hover:opacity-100" />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <Button variant="primary" size="lg" magnetic onClick={() => { setDone(false); setStep(0); setRecipients([{ key: '', amount: '' }]); setSubmitProgress([]); }}>
            <Send size={16} /> Create Another Batch
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-12 relative">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-[var(--accent)] opacity-5 rounded-full blur-[100px] pointer-events-none" />
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-white relative z-10">Initialize Batch</h1>
        <p className="text-sm text-[var(--muted)] relative z-10">Deploy a zero-knowledge multi-recipient payment contract.</p>
      </div>

      <ProgressBar step={step} />

      <div className="doppelrand-shell relative">
        {/* Glow */}
        <div className="absolute -inset-4 bg-gradient-to-b from-[var(--accent)] to-purple-600 opacity-[0.02] blur-xl pointer-events-none" />
        
        <div className="doppelrand-core !p-8 relative z-10">
          <AnimatePresence mode="wait">
            {/* Step 0 — Recipients */}
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
                <div className="space-y-4 mb-8">
                  {recipients.map((r, i) => {
                    const keyError = getRecipientKeyError(r.key);
                    return (
                    <div key={i} className="flex items-start gap-4">
                      <div className="flex-1">
                        {i === 0 && <label className="text-[10px] font-bold tracking-widest uppercase mb-2 block text-[var(--muted)]">Recipient Shielded Address or Coin Key</label>}
                        <input
                          value={r.key}
                          onChange={e => updateRecipient(i, 'key', e.target.value)}
                          placeholder="mn_shield-addr_undeployed1… or 64-char hex"
                          className={`w-full px-4 py-3.5 text-sm font-mono rounded-xl bg-[rgba(0,0,0,0.3)] border outline-none transition-all text-white placeholder-[rgba(255,255,255,0.2)] ${keyError ? 'border-[rgba(239,68,68,0.4)] focus:border-[rgba(239,68,68,0.7)]' : 'border-[rgba(255,255,255,0.05)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]'}`}
                        />
                        {keyError && (
                          <p className="mt-1.5 text-xs text-[var(--error)] flex items-start gap-1.5">
                            <span className="shrink-0 mt-px">!</span>
                            <span>{keyError}</span>
                          </p>
                        )}
                      </div>
                      <div className="w-[140px]">
                        {i === 0 && <label className="text-[10px] font-bold tracking-widest uppercase mb-2 block text-[var(--muted)]">Amount</label>}
                        <input
                          type="number"
                          min="1"
                          value={r.amount}
                          onChange={e => updateRecipient(i, 'amount', e.target.value)}
                          placeholder="100"
                          className="w-full px-4 py-3.5 text-sm font-mono rounded-xl bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none transition-all text-white placeholder-[rgba(255,255,255,0.2)]"
                        />
                      </div>
                      <div className={`${i === 0 ? 'mt-7' : ''} shrink-0`}>
                        <button onClick={() => removeRecipient(i)} disabled={recipients.length === 1}
                          className="h-[46px] w-[46px] flex items-center justify-center rounded-xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--error)] hover:border-[rgba(239,68,68,0.2)] transition-all disabled:opacity-30 disabled:hover:bg-[rgba(255,255,255,0.02)] disabled:hover:text-[var(--muted)] text-[var(--muted)] cursor-pointer disabled:cursor-not-allowed">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ); })}
                </div>

                <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.05)] pt-6">
                  <button onClick={addRecipient} disabled={recipients.length >= 65536}
                    className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[var(--accent)] hover:text-white transition-colors">
                    <Plus size={16} /> Add Recipient
                  </button>
                  <div className="text-right">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--muted)] block mb-1">Total Distribution</span>
                    <span className="text-xl font-mono font-bold text-white">{totalAmount} NIGHT</span>
                  </div>
                </div>

                <div className="mt-10 flex justify-end">
                  <Button variant="primary" size="lg" disabled={!isStep0Valid} onClick={() => setStep(1)} className="gap-2">
                    Next: Configuration <ChevronRight size={16} />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 1 — Configure */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="max-w-lg">
                <div className="space-y-8 mb-10">
                  <div>
                    <label className="text-[10px] font-bold tracking-widest uppercase mb-4 block text-[var(--muted)]">Contract Deadline</label>
                    <input type="range" min="1" max="168" value={deadlineHours} onChange={e => setDeadlineHours(Number(e.target.value))}
                      className="w-full accent-[var(--accent)] mb-4" />
                    <div className="flex items-center justify-between bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
                      <span className="text-3xl font-bold font-mono text-white">{deadlineHours}h</span>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] block">Expires At</span>
                        <span className="text-sm font-medium text-[var(--accent)]">{expiresDate}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className={`flex items-start gap-3 p-4 rounded-xl border ${auditorPublicKey ? 'border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.05)]' : 'border-[rgba(99,102,241,0.15)] bg-[rgba(99,102,241,0.05)]'}`}>
                    <Shield size={14} className={`${auditorPublicKey ? 'text-[var(--success)]' : 'text-[var(--accent)]'} shrink-0 mt-0.5`} />
                    <div className="min-w-0">
                      <p className={`text-[10px] font-bold tracking-widest uppercase mb-1 ${auditorPublicKey ? 'text-[var(--success)]' : 'text-[var(--accent)]'}`}>
                        {auditorPublicKey ? 'Audit Identity Active' : 'No Audit Identity'}
                      </p>
                      <p className="text-xs text-[var(--muted)] leading-relaxed">
                        {auditorPublicKey
                          ? `Key ${auditorPublicKey.slice(0, 12)}… will be embedded in all claim links. Recipients' memos are encrypted to this key.`
                          : 'Set up an audit identity in the Compliance Terminal to enable encrypted audit memos.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.05)] pt-6">
                  <Button variant="ghost" size="md" onClick={() => setStep(0)}><ArrowLeft size={16} className="mr-2"/> Back</Button>
                  <Button variant="primary" size="lg" onClick={() => setStep(2)}>Review & Sign <ChevronRight size={16} className="ml-2"/></Button>
                </div>
              </motion.div>
            )}

            {/* Step 2 — Review */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="max-w-lg">
                <div className="rounded-2xl p-6 space-y-5 mb-8 bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)]">
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--muted)] mb-2">Transaction Summary</p>
                  {[
                    ['Total Distribution', `${totalAmount} NIGHT`, 'text-white'],
                    ['Recipients', recipients.length.toString(), 'text-[var(--muted)]'],
                    ['Contract Duration', `${deadlineHours} hours`, 'text-[var(--muted)]'],
                    ['Audit Key', auditorPublicKey ? `${auditorPublicKey.slice(0, 12)}…` : 'None (memos unencrypted)', auditorPublicKey ? 'text-[var(--success)]' : 'text-[var(--muted)]'],
                  ].map(([label, value, colorClass]) => (
                    <div key={label} className="flex items-center justify-between py-1">
                      <span className="text-sm font-medium text-[var(--muted)]">{label}</span>
                      <span className={`text-sm font-mono font-medium ${colorClass}`}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Submit progress log */}
                <AnimatePresence>
                  {submitProgress.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="rounded-xl p-5 mb-8 space-y-3 font-mono text-xs bg-[rgba(16,185,129,0.05)] border border-[rgba(16,185,129,0.1)] overflow-hidden">
                      {submitProgress.map((line, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
                          <CheckCircle2 size={14} className="text-[var(--success)] shrink-0" />
                          <span className="text-[var(--success)] opacity-90">{line}</span>
                        </motion.div>
                      ))}
                      {isLoading && (
                        <div className="flex items-center gap-3 pt-2">
                          <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="inline-block text-[var(--accent)] w-3.5 text-center">⟳</motion.span>
                          <span className="text-[var(--accent)] animate-pulse">Awaiting ledger finality…</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && <p className="text-xs mb-8 p-4 rounded-xl border border-[rgba(239,68,68,0.2)] text-[var(--error)] bg-[rgba(239,68,68,0.1)]">{error}</p>}

                <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.05)] pt-6">
                  <Button variant="ghost" size="md" onClick={() => setStep(1)} disabled={isLoading}><ArrowLeft size={16} className="mr-2"/> Edit</Button>
                  
                  <div className="relative group/btn inline-block">
                    <div className="absolute -inset-[2px] bg-gradient-to-r from-[var(--success)] to-[var(--accent)] rounded-full opacity-60 group-hover/btn:opacity-100 blur-md transition-opacity duration-300"></div>
                    <Button variant="primary" size="lg" isLoading={isLoading} onClick={handleSubmit} className="relative bg-[#02000A] border border-[rgba(255,255,255,0.1)] text-white hover:bg-[var(--surface-hi)] px-8 py-3 rounded-full gap-2 shadow-none">
                      <Send size={16} /> Deploy & Sign
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
