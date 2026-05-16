type Status = 'active' | 'claimed' | 'expired' | 'pending' | 'paid' | 'open' | 'reclaimed' | 'unclaimed';

const configs: Record<Status, { label: string; dot: string; text: string; bg: string }> = {
  active:    { label: 'Active',    dot: 'bg-[var(--success)]',  text: 'text-[var(--success)]',  bg: 'bg-[var(--success-dim)]' },
  claimed:   { label: 'Claimed',   dot: 'bg-[var(--accent)]',   text: 'text-[var(--accent)]',   bg: 'bg-[var(--accent-dim)]' },
  expired:   { label: 'Expired',   dot: 'bg-[var(--muted)]',    text: 'text-[var(--muted)]',    bg: 'bg-zinc-800' },
  pending:   { label: 'Pending',   dot: 'bg-[var(--warn)]',     text: 'text-[var(--warn)]',     bg: 'bg-[var(--warn-dim)]' },
  paid:      { label: 'Paid',      dot: 'bg-[var(--success)]',  text: 'text-[var(--success)]',  bg: 'bg-[var(--success-dim)]' },
  open:      { label: 'Open',      dot: 'bg-[var(--accent)]',   text: 'text-[var(--accent)]',   bg: 'bg-[var(--accent-dim)]' },
  reclaimed: { label: 'Reclaimed', dot: 'bg-zinc-500',           text: 'text-zinc-400',           bg: 'bg-zinc-800' },
  unclaimed: { label: 'Unclaimed', dot: 'bg-[var(--warn)]',     text: 'text-[var(--warn)]',     bg: 'bg-[var(--warn-dim)]' },
};

interface StatusBadgeProps {
  status: Status;
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({ status, pulse = false, className = '' }: StatusBadgeProps) {
  const config = configs[status] ?? configs.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} ${className}`}>
      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${config.dot}`}>
        {pulse && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${config.dot} opacity-75 animate-ping`} />
        )}
      </span>
      {config.label}
    </span>
  );
}
