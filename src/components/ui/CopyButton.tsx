import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function CopyButton({ text, label, size = 'md', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }, [text]);

  const iconSize = size === 'sm' ? 12 : 14;
  const padding = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';

  return (
    <motion.button
      onClick={handleCopy}
      whileTap={{ scale: 0.96 }}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border)] transition-colors ${padding} font-medium ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="check"
            className="flex items-center gap-1.5 text-[var(--success)]"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <Check size={iconSize} />
            {label && 'Copied'}
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            className="flex items-center gap-1.5"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <Copy size={iconSize} />
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
