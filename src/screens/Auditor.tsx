import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, AlertTriangle, Search, Lock, ChevronRight, KeyRound, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { HashChip } from '../components/ui/HashChip.js';
import { CopyButton } from '../components/ui/CopyButton.js';
import { SkeletonRow } from '../components/ui/Skeleton.js';
import { useWallet } from '../context/WalletContext.js';
import { decryptAuditMemo, generateAuditorKeyPair, type AuditRecord } from '../crypto/memo.js';
import { fromHex, toHex } from '../types/index.js';

const AUDIT_KEY_STORAGE = 'tesseract-audit-key';

interface AuditKeyPair {
  privateKey: string;
  publicKey: string;
}

interface AuditEntry {
  txHash: string;
  blockHeight: number;
  timestamp: number;
  decrypted: AuditRecord | null;
}

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL || 'http://localhost:8088/api/v3/graphql';

async function gqlQuery(query: string, variables: Record<string, any>) {
  const res = await fetch(INDEXER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await res.json();
  if (payload.errors) throw new Error(payload.errors[0].message);
  return payload.data;
}

export function Auditor() {
  const { contractAddress } = useWallet();
  const [auditPair, setAuditPair] = useState<AuditKeyPair | null>(null);
  const [batchFilter, setBatchFilter] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(AUDIT_KEY_STORAGE);
    if (stored) {
      try { setAuditPair(JSON.parse(stored)); } catch { /* ignore corrupt data */ }
    }
  }, []);

  const generateNewKey = useCallback(() => {
    const { privateKey, publicKey } = generateAuditorKeyPair();
    const pair: AuditKeyPair = { privateKey: toHex(privateKey), publicKey: toHex(publicKey) };
    localStorage.setItem(AUDIT_KEY_STORAGE, JSON.stringify(pair));
    setAuditPair(pair);
    setEntries([]);
    setScanned(false);
    setError(null);
  }, []);

  const handleScan = useCallback(async () => {
    if (!auditPair) { setError('Generate an audit identity first'); return; }
    if (!contractAddress) { setError('Contract address not configured — check .env'); return; }

    setIsLoading(true);
    setError(null);
    try {
      const data = await gqlQuery(`
        query($address: HexEncoded!) {
          contractAction(address: $address) {
            __typename
            transaction {
              hash
              block { height timestamp }
            }
            ... on ContractCall {
              entryPoint
            }
          }
        }
      `, { address: contractAddress });

      const action = data?.contractAction;
      const actions: any[] = action ? (Array.isArray(action) ? action : [action]) : [];
      const privKeyBytes = fromHex(auditPair.privateKey);

      const results: AuditEntry[] = [];
      for (const a of actions) {
        if (a?.__typename !== 'ContractCall' || a.entryPoint !== 'claimPayment') continue;

        const txHash: string = a.transaction?.hash || '';
        const blockHeight: number = a.transaction?.block?.height || 0;
        const timestamp: number = (a.transaction?.block?.timestamp || 0) * 1000;

        if (batchFilter && !txHash.includes(batchFilter)) continue;

        // Memo bytes would come from the public transcript (requires ABI decoding)
        // For now, show the transaction metadata. Decryption works when transcript is available.
        const emptyMemo = new Uint8Array(128);
        const dec = await decryptAuditMemo(emptyMemo, privKeyBytes);

        results.push({ txHash, blockHeight, timestamp, decrypted: dec });
      }

      setEntries(results);
      setScanned(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed — ensure local Midnight network is running');
    } finally {
      setIsLoading(false);
    }
  }, [auditPair, batchFilter, contractAddress]);

  return (
    <div className="max-w-5xl mx-auto py-8">
      {/* Header */}
      <div className="mb-12 relative z-10">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-[var(--accent)] opacity-5 rounded-full blur-[100px] pointer-events-none" />
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
            <Shield size={18} className="text-[var(--accent)]" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Compliance Terminal</h1>
        </div>
        <p className="text-sm text-[var(--muted)] pl-1">
          Decrypt private payment memos securely within your browser.
        </p>
      </div>

      {/* Identity + Scan grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-8 mb-16">

        {/* Audit Identity */}
        <div className="doppelrand-shell h-full">
          <div className="doppelrand-core !p-8 h-full bg-[rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-3 mb-6">
              <KeyRound size={16} className="text-[var(--accent)]" />
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--muted)]">Audit Identity</p>
            </div>

            {auditPair ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[rgba(16,185,129,0.05)] border border-[rgba(16,185,129,0.15)]">
                  <CheckCircle2 size={14} className="text-[var(--success)] shrink-0" />
                  <span className="text-xs text-[var(--success)] font-medium">Identity configured</span>
                </div>

                <div>
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-2 text-[var(--muted)]">
                    Public Key <span className="normal-case font-normal tracking-normal opacity-60">(share with payers)</span>
                  </p>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)]">
                    <span className="text-xs font-mono flex-1 truncate text-[var(--muted)]">
                      {auditPair.publicKey.slice(0, 20)}…{auditPair.publicKey.slice(-8)}
                    </span>
                    <CopyButton text={auditPair.publicKey} size="sm" className="opacity-70 hover:opacity-100" />
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 rounded-xl bg-[rgba(245,158,11,0.05)] border border-[rgba(245,158,11,0.1)]">
                  <Lock size={12} className="text-[var(--warn)] shrink-0" />
                  <p className="text-[10px] text-[var(--warn)]">Private key stored locally. Never leaves this browser.</p>
                </div>

                <button
                  onClick={generateNewKey}
                  className="flex items-center gap-2 text-xs text-[var(--muted)] hover:text-[var(--error)] transition-colors pt-2"
                >
                  <RefreshCw size={12} />
                  Regenerate key pair
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  Generate an audit identity to decrypt payment memos. Your private key stays in this browser.
                </p>
                <p className="text-xs text-[var(--muted)] opacity-70 leading-relaxed">
                  Share your public key with payers so claims include encrypted audit memos only you can read.
                </p>
                <button
                  onClick={generateNewKey}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm font-semibold text-white hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                >
                  <KeyRound size={16} />
                  Generate Audit Identity
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Scan controls */}
        <div className="doppelrand-shell h-full">
          <div className="doppelrand-core !p-8 h-full bg-[rgba(0,0,0,0.4)]">
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-3 text-[var(--muted)]">
                  Filter by Batch ID or TX Hash
                </label>
                <input
                  value={batchFilter}
                  onChange={e => setBatchFilter(e.target.value)}
                  placeholder="Leave blank to scan all"
                  className="w-full px-4 py-3.5 text-sm font-mono rounded-xl bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)] focus:border-[var(--accent)] outline-none transition-all text-white placeholder-[rgba(255,255,255,0.2)]"
                />
              </div>

              <div className="pt-2 relative group/btn w-full">
                <div className="absolute -inset-[2px] bg-gradient-to-r from-[var(--accent)] to-purple-600 rounded-full opacity-50 group-hover/btn:opacity-100 blur-sm transition-opacity duration-300"></div>
                <Button
                  variant="primary" size="lg" magnetic
                  isLoading={isLoading}
                  onClick={handleScan}
                  disabled={!auditPair}
                  className="relative w-full justify-center bg-[#02000A] border border-[rgba(255,255,255,0.1)] text-white hover:bg-[var(--surface-hi)] px-8 py-4 rounded-full gap-3 shadow-none text-sm uppercase tracking-widest transition-all duration-300 disabled:opacity-40"
                >
                  <Search size={16} />
                  Scan On-Chain Memos
                </Button>
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.05)] text-sm text-[var(--error)]">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="mt-8 border-t border-[rgba(255,255,255,0.05)] pt-6">
              <h3 className="text-sm font-bold tracking-widest uppercase mb-4 text-white">Role Privileges</h3>
              <ul className="space-y-4 text-sm text-[var(--muted)]">
                {[
                  'Decrypt payment amounts hidden from the public network.',
                  'Verify batch compliance without compromising recipient privacy.',
                  'Maintain independent audit trails for regulated operations.',
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <ChevronRight size={16} className="shrink-0 mt-0.5 text-[var(--accent)]" />
                    <span className="leading-relaxed">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {scanned && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
              </div>
            ) : entries.length === 0 ? (
              <div className="doppelrand-shell max-w-lg mx-auto">
                <div className="doppelrand-core text-center py-16">
                  <div className="w-16 h-16 rounded-full mx-auto mb-6 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] flex items-center justify-center">
                    <Lock size={24} className="text-[var(--muted)]" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-white">No Claim Transactions Found</h3>
                  <p className="text-sm text-[var(--muted)] max-w-xs mx-auto leading-relaxed">
                    No claimPayment transactions detected on this contract. Claims will appear here once recipients claim their payments.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                    Claim Transactions{' '}
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-[rgba(34,211,238,0.1)] text-[var(--accent)]">
                      {entries.length}
                    </span>
                  </h3>
                </div>

                <div className="doppelrand-shell">
                  <div className="doppelrand-core !p-0 overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-[rgba(0,0,0,0.5)] text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] border-b border-[rgba(255,255,255,0.05)]">
                          <th className="px-6 py-5">Transaction</th>
                          <th className="px-6 py-5 text-right">Block</th>
                          <th className="px-6 py-5 text-right">Timestamp</th>
                          <th className="px-6 py-5">Memo Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-[rgba(255,255,255,0.01)]">
                        {entries.map((entry, i) => (
                          <motion.tr
                            key={entry.txHash + i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="border-b border-[rgba(255,255,255,0.03)] last:border-0 hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                          >
                            <td className="px-6 py-5">
                              <HashChip hash={entry.txHash} className="bg-[rgba(255,255,255,0.03)] border-transparent" />
                            </td>
                            <td className="px-6 py-5 text-right font-mono text-sm text-[var(--muted)]">
                              {entry.blockHeight}
                            </td>
                            <td className="px-6 py-5 text-right text-[var(--muted)] text-xs">
                              {entry.timestamp > 0 ? new Date(entry.timestamp).toLocaleString(undefined, {
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                              }) : '—'}
                            </td>
                            <td className="px-6 py-5">
                              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-[rgba(245,158,11,0.1)] text-[var(--warn)] border border-[rgba(245,158,11,0.2)]">
                                Pending transcript
                              </span>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
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
