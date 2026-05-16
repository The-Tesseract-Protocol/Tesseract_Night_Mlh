import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, CheckCircle2, Link2, AlertCircle, ArrowRight, Clock } from 'lucide-react';
import { useWallet } from '../context/WalletContext.js';
import { usePaymentRequest } from '../hooks/usePaymentRequest.js';
import { Button } from '../components/ui/Button.js';
import { CopyButton } from '../components/ui/CopyButton.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { SkeletonRow } from '../components/ui/Skeleton.js';

type Tab = 'create' | 'mine';

export function PaymentRequest() {
  const { coinPublicKey, callCircuit } = useWallet();
  const { createRequest, markPaid, requests, isLoading, error, clearError } = usePaymentRequest(
    coinPublicKey,
    callCircuit as any,
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
      setPaymentLink(result.request.paymentLink);
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
    <div>
      <div className="flex items-center gap-2.5 mb-8">
        <FileText size={18} style={{ color: 'var(--muted)' }} />
        <h1 className="text-2xl font-bold tracking-tight">Payment Request</h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl mb-8 w-fit" style={{ background: 'var(--surface)' }}>
        {(['create', 'mine'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="relative px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{ color: tab === t ? 'var(--text)' : 'var(--muted)' }}>
            {tab === t && (
              <motion.div layoutId="tab-bg" className="absolute inset-0 rounded-lg"
                style={{ background: 'var(--surface-hi)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
            )}
            <span className="relative">{t === 'create' ? 'Create Request' : `My Requests${requests.length > 0 ? ` (${requests.length})` : ''}`}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Create tab */}
        {tab === 'create' && !created && (
          <motion.div key="create" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="max-w-sm">
            <div className="space-y-5">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--muted)' }}>
                  Description <span style={{ color: 'var(--dim)' }}>(optional)</span>
                </label>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Invoice for design services"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
                  style={{ background: 'var(--surface-hi)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--muted)' }}>
                  Amount (NIGHT) <span style={{ color: 'var(--dim)' }}>(optional)</span>
                </label>
                <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="Leave blank for open amount"
                  className="w-full px-3 py-2.5 text-sm font-mono rounded-lg border outline-none"
                  style={{ background: 'var(--surface-hi)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-2" style={{ color: 'var(--muted)' }}>Deadline</label>
                <input type="range" min="1" max="168" value={deadlineHours} onChange={e => setDeadlineHours(Number(e.target.value))}
                  className="w-full accent-cyan-400 mb-2" />
                <div className="flex items-baseline justify-between">
                  <span className="font-mono font-bold text-xl">{deadlineHours}h</span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>Expires {expiresDate}</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl mt-4 text-xs" style={{ background: 'var(--error-dim)', color: 'var(--error)' }}>
                <AlertCircle size={13} className="shrink-0 mt-0.5" />{error}
              </div>
            )}

            <Button variant="primary" size="md" isLoading={isLoading} onClick={handleCreate} className="mt-6 gap-2">
              <FileText size={14} />Create Request
            </Button>
          </motion.div>
        )}

        {/* Success — link generated */}
        {tab === 'create' && created && (
          <motion.div key="success" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} className="max-w-md">
            <div className="flex items-center gap-2 mb-5 text-sm" style={{ color: 'var(--success)' }}>
              <CheckCircle2 size={16} /> Request created
            </div>
            <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
              <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>Share this link with the payer</p>
              <div className="flex items-start gap-3 p-3 rounded-xl mb-4" style={{ background: 'var(--surface-hi)' }}>
                <Link2 size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
                <span className="text-xs font-mono break-all flex-1" style={{ color: 'var(--text)' }}>{paymentLink}</span>
              </div>
              <div className="flex items-center gap-3">
                <CopyButton text={paymentLink} label="Copy link" size="md" />
                <button onClick={resetCreate} className="text-xs transition-colors" style={{ color: 'var(--muted)' }}>
                  Create another <ArrowRight size={11} className="inline" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* My requests tab */}
        {tab === 'mine' && (
          <motion.div key="mine" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            {isLoading && <div className="space-y-3">{[1,2,3].map(i => <SkeletonRow key={i} />)}</div>}

            {!isLoading && requests.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-start py-12">
                <div className="p-4 rounded-2xl mb-5" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
                  <FileText size={24} style={{ color: 'var(--dim)' }} />
                </div>
                <h2 className="font-semibold mb-2">No requests yet</h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Your created payment requests will appear here.</p>
                <button onClick={() => setTab('create')} className="mt-4 text-sm font-medium flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                  Create a request <ArrowRight size={12} />
                </button>
              </motion.div>
            )}

            {!isLoading && requests.length > 0 && (
              <div className="space-y-3">
                {requests.map((req, i) => (
                  <motion.div key={req.requestId}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl px-5 py-4"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="text-sm font-medium truncate">{req.description || 'Payment request'}</span>
                          <StatusBadge status={req.status as any} />
                        </div>
                        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--muted)' }}>
                          {req.amount && <span className="font-mono font-medium">{req.amount.toString()} NIGHT</span>}
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {new Date(Number(req.deadline)).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {req.status === 'open' && (
                          <Button variant="subtle" size="sm" onClick={() => handleMarkPaid(req.requestId)}>
                            Mark paid
                          </Button>
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
