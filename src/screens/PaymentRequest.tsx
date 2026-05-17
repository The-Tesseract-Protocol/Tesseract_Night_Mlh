import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, CheckCircle2, Link2, AlertCircle, Clock, Plus } from 'lucide-react';
import { useWallet } from '../context/WalletContext.js';
import { usePaymentRequest } from '../hooks/usePaymentRequest.js';
import { Button } from '../components/ui/Button.js';
import { CopyButton } from '../components/ui/CopyButton.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { SkeletonRow } from '../components/ui/Skeleton.js';

type Tab = 'create' | 'mine';

export function PaymentRequest() {
  const { coinPublicKey, client } = useWallet();
  const { createRequest, markPaid, requests, isLoading, error, clearError } = usePaymentRequest(
    client,
    coinPublicKey,
  );

  const [tab, setTab] = useState<Tab>('create');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [deadlineHours, setDeadlineHours] = useState(48);
  const [paymentLink, setPaymentLink] = useState('');
  const [created, setCreated] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!createRequest) return;
    clearError();
    try {
      const result = await createRequest({
        description: description.trim() || undefined,
        amount: amount ? BigInt(Math.round(parseFloat(amount))) : undefined,
        currency: 'NIGHT',
        deadlineHours,
      });
      setPaymentLink(result.paymentLink);
      setCreated(true);
    } catch {}
  }, [createRequest, description, amount, deadlineHours, clearError]);

  const handleMarkPaid = useCallback(async (requestId: string) => {
    try { await markPaid(requestId); } catch {}
  }, [markPaid]);

  const resetCreate = useCallback(() => {
    setCreated(false);
    setPaymentLink('');
    setDescription('');
    setAmount('');
    setDeadlineHours(48);
    clearError();
  }, [clearError]);

  const expiresDate = new Date(Date.now() + deadlineHours * 3600000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6 relative z-10">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-[var(--accent)] opacity-5 rounded-full blur-[100px] pointer-events-none" />
        
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
              <FileText size={18} className="text-[var(--accent)]" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Payment Requests</h1>
          </div>
          <p className="text-sm text-[var(--muted)] pl-1">
            Create on-chain payment obligations for clients and vendors.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center p-1.5 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          {(['create', 'mine'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="relative px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors tracking-wide"
              style={{ color: tab === t ? '#fff' : 'var(--muted)' }}>
              {tab === t && (
                <motion.div layoutId="tab-bg" className="absolute inset-0 rounded-xl bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.05)]"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              )}
              <span className="relative z-10">{t === 'create' ? 'Issue Request' : `Active History${requests.length > 0 ? ` (${requests.length})` : ''}`}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* Create tab */}
        {tab === 'create' && !created && (
          <motion.div key="create" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="doppelrand-shell relative group">
            
            <div className="absolute -inset-4 bg-gradient-to-b from-[var(--accent)] to-purple-600 opacity-5 rounded-full blur-[60px] pointer-events-none group-hover:opacity-10 transition-opacity duration-700" />
            
            <div className="doppelrand-core !p-8 relative z-10 max-w-xl mx-auto bg-[rgba(0,0,0,0.4)]">
              <div className="space-y-6 mb-8">
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase mb-3 block text-[var(--muted)]">
                    Memo / Description <span className="opacity-50 font-normal tracking-normal normal-case">(Optional)</span>
                  </label>
                  <input value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Invoice for Q3 Design Services"
                    className="w-full px-4 py-3.5 text-sm rounded-xl bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)] focus:border-[var(--accent)] outline-none transition-all text-white placeholder-[rgba(255,255,255,0.2)]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase mb-3 block text-[var(--muted)]">
                    Requested Amount (NIGHT) <span className="opacity-50 font-normal tracking-normal normal-case">(Optional)</span>
                  </label>
                  <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="Leave blank for open amount"
                    className="w-full px-4 py-3.5 text-sm font-mono rounded-xl bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)] focus:border-[var(--accent)] outline-none transition-all text-white placeholder-[rgba(255,255,255,0.2)]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase mb-4 block text-[var(--muted)]">Validity Period</label>
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
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden mb-8">
                    <div className="flex items-start gap-3 p-4 rounded-xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.1)] text-sm text-[var(--error)]">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative group/btn w-full flex justify-center">
                <div className="absolute -inset-[2px] bg-gradient-to-r from-[var(--accent)] to-purple-600 rounded-full opacity-50 group-hover/btn:opacity-100 blur-md transition-opacity duration-300"></div>
                <Button variant="primary" size="lg" magnetic isLoading={isLoading} onClick={handleCreate} className="relative w-full justify-center bg-[#02000A] border border-[rgba(255,255,255,0.1)] text-white hover:bg-[var(--surface-hi)] px-8 py-4 rounded-full gap-3 shadow-none text-sm uppercase tracking-widest transition-all duration-300">
                  <FileText size={16} /> Issue Cryptographic Request
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Success — link generated */}
        {tab === 'create' && created && (
          <motion.div key="success" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto py-12 text-center relative">
            <div className="absolute top-0 w-64 h-64 bg-[var(--success)] opacity-10 rounded-full blur-[100px] pointer-events-none left-1/2 -translate-x-1/2" />
            
            <div className="w-20 h-20 rounded-full bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.2)] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)] mx-auto">
              <CheckCircle2 size={32} className="text-[var(--success)]" />
            </div>
            <h2 className="text-3xl font-bold tracking-tighter text-white mb-8">Request Initialized</h2>
            
            <div className="doppelrand-shell text-left mb-8">
              <div className="doppelrand-core !p-6">
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-4 text-[var(--muted)]">Share Payment Link</p>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-[rgba(0,0,0,0.4)] border border-[rgba(255,255,255,0.05)] mb-4">
                  <Link2 size={16} className="text-[var(--accent)] shrink-0" />
                  <span className="text-xs font-mono break-all flex-1 text-[var(--muted)] leading-relaxed">{paymentLink}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--muted)]">Send this to the payer.</span>
                  <CopyButton text={paymentLink} label="Copy Link" size="sm" className="opacity-70 hover:opacity-100" />
                </div>
              </div>
            </div>

            <Button variant="ghost" size="md" onClick={resetCreate} className="text-[var(--muted)] hover:text-white transition-colors">
              <Plus size={14} className="mr-2"/> Issue Another Request
            </Button>
          </motion.div>
        )}

        {/* My requests tab */}
        {tab === 'mine' && (
          <motion.div key="mine" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="relative z-10">
            {isLoading && <div className="space-y-4">{[1,2,3].map(i => <SkeletonRow key={i} />)}</div>}

            {!isLoading && requests.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-24 px-6 text-center">
                <div className="w-16 h-16 rounded-full mb-6 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <FileText size={24} className="text-[var(--muted)]" />
                </div>
                <h2 className="text-xl font-bold mb-3 text-white">No active requests</h2>
                <p className="text-sm mb-10 max-w-xs leading-relaxed text-[var(--muted)]">Your generated payment links and on-chain requests will appear here.</p>
                <Button variant="ghost" size="md" onClick={() => setTab('create')} className="text-[var(--accent)] hover:text-[var(--accent-hi)]">
                  <Plus size={14} className="mr-2"/> Issue a Request
                </Button>
              </motion.div>
            )}

            {!isLoading && requests.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {requests.map((req, i) => (
                  <motion.div key={req.requestId}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 30 }}
                    className="doppelrand-shell relative group h-full">
                    
                    <div className="doppelrand-core !p-5 flex flex-col h-full bg-[rgba(0,0,0,0.2)] hover:bg-[rgba(255,255,255,0.02)] transition-colors duration-500">
                      <div className="flex items-start justify-between gap-4 mb-6">
                        <div className="min-w-0">
                          <span className="text-sm font-bold truncate text-white block mb-2">{req.description || 'Payment request'}</span>
                          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                            {req.amount && <span className="text-[var(--accent)] border border-[rgba(99,102,241,0.2)] bg-[rgba(99,102,241,0.05)] px-2 py-0.5 rounded-md">{req.amount.toString()} NIGHT</span>}
                            <span className="flex items-center gap-1.5 opacity-60">
                              <Clock size={12} />
                              {new Date(Number(req.deadline)).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <StatusBadge status={req.status as any} pulse={req.status === 'open'} />
                      </div>
                      
                      <div className="mt-auto pt-4 border-t border-[rgba(255,255,255,0.05)] flex justify-end">
                        {req.status === 'open' && (
                          <Button variant="subtle" size="sm" onClick={() => handleMarkPaid(req.requestId)} className="w-full sm:w-auto text-xs font-semibold tracking-wide hover:text-[var(--success)] hover:bg-[rgba(16,185,129,0.1)]">
                            Acknowledge Payment
                          </Button>
                        )}
                        {req.status !== 'open' && (
                          <span className="text-xs font-medium text-[var(--muted)] py-1.5 opacity-50 px-2">Settled</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
