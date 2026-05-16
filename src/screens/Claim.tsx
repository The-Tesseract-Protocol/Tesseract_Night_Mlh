import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Zap, Wifi, CheckCircle2, AlertCircle } from 'lucide-react';
import { useWallet } from '../context/WalletContext.js';
import { useClaim } from '../hooks/useClaim.js';
import { Button } from '../components/ui/Button.js';
import { HashChip } from '../components/ui/HashChip.js';
import { CopyButton } from '../components/ui/CopyButton.js';
import type { ClaimParams } from '../../agents/interfaces/claimPaymentFlow.js';

interface ClaimState {
  params: ClaimParams | null;
  nullifier: string | null;
  txHash: string | null;
  done: boolean;
}

export function Claim() {
  const { isConnected, connect, isConnecting, callCircuitWithWitnesses, getRecipientCoin } = useWallet();
  const { parseCurrentUrl, claim, isLoading, error, clearError } = useClaim(
    callCircuitWithWitnesses as any,
    undefined,
    getRecipientCoin,
  );

  const [state, setState] = useState<ClaimState>({ params: null, nullifier: null, txHash: null, done: false });
  const [fetchingProof, setFetchingProof] = useState(false);

  useEffect(() => {
    const params = parseCurrentUrl();
    setState(s => ({ ...s, params }));
  }, [parseCurrentUrl]);

  const handleClaim = useCallback(async () => {
    if (!state.params) return;
    clearError();
    setFetchingProof(true);
    try {
      const result = await claim(state.params);
      setState(s => ({ ...s, nullifier: result.nullifier, txHash: result.txHash, done: true }));
    } finally {
      setFetchingProof(false);
    }
  }, [state.params, claim, clearError]);

  // No URL params
  if (!state.params) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2.5 mb-8">
          <Zap size={18} style={{ color: 'var(--muted)' }} />
          <h1 className="text-2xl font-bold tracking-tight">Claim Payment</h1>
        </div>
        <div className="max-w-sm rounded-2xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'var(--surface-hi)' }}>
            <Zap size={24} style={{ color: 'var(--dim)' }} />
          </div>
          <h2 className="font-semibold mb-2">Open your claim link</h2>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--muted)' }}>
            Claim links are shared by the payer. Open the link you received to claim your payment.
          </p>
          <div className="text-left p-3 rounded-xl text-xs font-mono" style={{ background: 'var(--surface-hi)', color: 'var(--muted)' }}>
            /app/claim?batchId=…&amount=…
          </div>
        </div>
      </motion.div>
    );
  }

  // Success
  if (state.done && state.nullifier) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
          <h1 className="text-2xl font-bold tracking-tight">Payment claimed</h1>
        </div>

        <div className="rounded-2xl p-6 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-[11px] font-semibold tracking-widest uppercase mb-4" style={{ color: 'var(--muted)' }}>Amount received</p>
          <p className="font-mono text-4xl font-bold mb-1">{state.params.amount.toString()}</p>
          <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>NIGHT</p>
        </div>

        <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>Claim proof (nullifier)</p>
          <div className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background: 'var(--surface-hi)' }}>
            <span className="font-mono text-xs flex-1 break-all" style={{ color: 'var(--text)' }}>
              {state.nullifier}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Save this. It proves your claim.</p>
            <CopyButton text={state.nullifier} size="sm" label="Copy" />
          </div>
        </div>
      </motion.div>
    );
  }

  // Wallet not connected
  if (!isConnected) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <Zap size={18} style={{ color: 'var(--muted)' }} />
          <h1 className="text-2xl font-bold tracking-tight">Claim Payment</h1>
        </div>
        <div className="rounded-2xl p-7" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--muted)' }}>You have been sent</p>
          <p className="font-mono text-5xl font-bold mb-1">{state.params.amount.toString()}</p>
          <p className="text-lg font-semibold mb-6" style={{ color: 'var(--accent)' }}>NIGHT</p>
          <div className="h-px mb-6" style={{ background: 'var(--border-subtle)' }} />
          <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>Connect your Lace wallet to claim this payment.</p>
          <Button variant="primary" size="md" magnetic isLoading={isConnecting} onClick={connect} className="w-full justify-center gap-2">
            <Wifi size={14} /> Connect Lace
          </Button>
        </div>
      </motion.div>
    );
  }

  // Ready to claim
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm">
      <div className="flex items-center gap-2.5 mb-8">
        <Zap size={18} style={{ color: 'var(--accent)' }} />
        <h1 className="text-2xl font-bold tracking-tight">Claim Payment</h1>
      </div>

      <div className="rounded-2xl p-7 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
        <p className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--muted)' }}>You have been sent</p>
        <p className="font-mono text-5xl font-bold mb-1">{state.params.amount.toString()}</p>
        <p className="text-lg font-semibold mb-6" style={{ color: 'var(--accent)' }}>NIGHT</p>

        <div className="space-y-2.5 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Batch</span>
            <HashChip hash={state.params.batchId} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Leaf index</span>
            <span className="text-xs font-mono">#{state.params.leafIndex}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl mb-4 text-xs" style={{ background: 'var(--error-dim)', color: 'var(--error)' }}>
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <Button variant="primary" size="lg" magnetic isLoading={isLoading || fetchingProof} onClick={handleClaim} className="w-full justify-center gap-2">
        <Zap size={15} />
        {fetchingProof ? 'Generating ZK proof…' : 'Claim Payment'}
      </Button>
    </motion.div>
  );
}
