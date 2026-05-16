import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Eye, EyeOff, AlertTriangle, Search, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { HashChip } from '../components/ui/HashChip.js';
import { SkeletonRow } from '../components/ui/Skeleton.js';
import type { AuditEntry } from '../../agents/interfaces/claimPaymentFlow.js';

function decryptMemos(_privKeyHex: string, _batchIdFilter: string): Promise<AuditEntry[]> {
  return Promise.resolve([]);
}

export function Auditor() {
  const [privKey, setPrivKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [batchFilter, setBatchFilter] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decrypted, setDecrypted] = useState(false);

  const handleDecrypt = useCallback(async () => {
    if (!privKey.trim()) { setError('Private key required'); return; }
    setIsLoading(true);
    setError(null);
    try {
      const result = await decryptMemos(privKey.trim(), batchFilter.trim());
      setEntries(result);
      setDecrypted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decryption failed');
    } finally {
      setIsLoading(false);
    }
  }, [privKey, batchFilter]);

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-2">
        <Shield size={18} style={{ color: 'var(--muted)' }} />
        <h1 className="text-2xl font-bold tracking-tight">Audit Decrypt</h1>
      </div>
      <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>
        Decrypt payment memos with your auditor private key
      </p>

      {/* Warning banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl mb-7 text-sm"
        style={{ background: 'var(--warn-dim)', border: '1px solid rgba(251,191,36,0.15)' }}>
        <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--warn)' }} />
        <p style={{ color: 'var(--warn)' }}>
          Your private key is never transmitted. All decryption happens locally in this browser tab.
        </p>
      </div>

      {/* Input form */}
      <div className="max-w-lg space-y-4 mb-7">
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--muted)' }}>
            Auditor Private Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={privKey}
              onChange={e => setPrivKey(e.target.value)}
              placeholder="0x0000…0000"
              className="w-full px-3 py-2.5 text-sm font-mono rounded-lg border outline-none pr-10"
              style={{ background: 'var(--surface-hi)', borderColor: error ? 'var(--error)' : 'var(--border)', color: 'var(--text)' }}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: 'var(--muted)' }}>
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {error && <p className="text-xs mt-1.5" style={{ color: 'var(--error)' }}>{error}</p>}
        </div>

        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--muted)' }}>
            Filter by Batch ID <span style={{ color: 'var(--dim)' }}>(optional)</span>
          </label>
          <input
            value={batchFilter}
            onChange={e => setBatchFilter(e.target.value)}
            placeholder="0x… leave blank to decrypt all"
            className="w-full px-3 py-2.5 text-sm font-mono rounded-lg border outline-none"
            style={{ background: 'var(--surface-hi)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>

        <Button variant="primary" size="md" isLoading={isLoading} onClick={handleDecrypt} className="gap-2">
          <Search size={14} />Decrypt Memos
        </Button>
      </div>

      {/* Results */}
      <AnimatePresence>
        {decrypted && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {isLoading && <div className="space-y-2">{[1,2,3,4].map(i => <SkeletonRow key={i} />)}</div>}

            {!isLoading && entries.length === 0 && (
              <div className="flex flex-col items-start py-10">
                <div className="p-3.5 rounded-xl mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
                  <Lock size={22} style={{ color: 'var(--dim)' }} />
                </div>
                <h3 className="font-semibold mb-1.5">No matching entries</h3>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  No audit memos found for this key
                  {batchFilter ? ` + batch filter` : ''}.
                </p>
              </div>
            )}

            {!isLoading && entries.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold tracking-widest uppercase mb-4"
                  style={{ color: 'var(--muted)' }}>
                  {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} found
                </p>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
                  {/* Table header */}
                  <div className="grid grid-cols-[2fr_1fr_2fr_2fr_1fr] gap-4 px-5 py-3 text-[11px] font-semibold tracking-widest uppercase"
                    style={{ background: 'var(--surface)', color: 'var(--muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span>Batch</span>
                    <span>Leaf</span>
                    <span>Amount</span>
                    <span>Recipient</span>
                    <span>Time</span>
                  </div>

                  {/* Table rows */}
                  <div style={{ background: 'var(--surface)' }}>
                    {entries.map((entry, i) => (
                      <motion.div
                        key={entry.txHash + i}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="grid grid-cols-[2fr_1fr_2fr_2fr_1fr] gap-4 px-5 py-3 text-xs border-b last:border-0"
                        style={{ borderColor: 'var(--border-subtle)', opacity: entry.decrypted ? 1 : 0.45 }}
                      >
                        <HashChip hash={entry.txHash} />
                        <span className="font-mono" style={{ color: entry.decrypted ? 'var(--text)' : 'var(--muted)' }}>
                          #{entry.decrypted?.leafIndex ?? '—'}
                        </span>
                        <span className="font-mono font-medium" style={{ color: entry.decrypted ? 'var(--accent)' : 'var(--muted)' }}>
                          {entry.decrypted ? `${entry.decrypted.amount} NIGHT` : 'key mismatch'}
                        </span>
                        <span style={{ color: 'var(--muted)' }}>
                          {entry.decrypted ? <HashChip hash={entry.decrypted.recipientKeyHex} /> : '—'}
                        </span>
                        <span style={{ color: 'var(--muted)' }}>
                          {entry.decrypted
                            ? new Date(entry.decrypted.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                            : '—'
                          }
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
