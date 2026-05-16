import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check } from 'lucide-react';

interface HashChipProps {
  hash: string;
  prefix?: number;
  suffix?: number;
  className?: string;
  showCopy?: boolean;
}

function truncate(hash: string, prefix = 8, suffix = 6): string {
  if (hash.length <= prefix + suffix + 3) return hash;
  return `${hash.slice(0, prefix)}...${hash.slice(-suffix)}`;
}

export function HashChip({ hash, prefix = 8, suffix = 6, className = '', showCopy = true }: HashChipProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }, [hash]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-xs text-[var(--muted)] cursor-pointer hover:text-[var(--text)] transition-colors group ${className}`}
      onClick={handleCopy}
      title={hash}
    >
      <span className="truncate">{truncate(hash, prefix, suffix)}</span>
      {showCopy && (
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span
              key="check"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <Check size={10} className="text-[var(--success)]" />
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.5 }}
              exit={{ scale: 0.6, opacity: 0 }}
              className="group-hover:opacity-100 transition-opacity"
            >
              <Copy size={10} />
            </motion.span>
          )}
        </AnimatePresence>
      )}
    </span>
  );
}
