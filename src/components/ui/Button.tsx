import { forwardRef, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import type { ComponentPropsWithoutRef } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const variantStyles: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-[rgba(99,102,241,0.1)] to-[rgba(139,92,246,0.1)] border border-[var(--accent)] text-white font-semibold hover:from-[rgba(99,102,241,0.2)] hover:to-[rgba(139,92,246,0.2)] shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] transition-all duration-300',
  ghost:   'border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hi)] hover:border-[rgba(255,255,255,0.2)] transition-all duration-300',
  danger:  'bg-[var(--error-dim)] text-[var(--error)] border border-[var(--error)]/30 hover:bg-[var(--error)]/20 shadow-[0_0_15px_rgba(239,68,68,0.1)] transition-all duration-300',
  subtle:  'bg-[var(--surface-hi)] text-[var(--muted)] hover:text-white hover:bg-[rgba(255,255,255,0.05)] border border-transparent transition-all duration-300',
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-4 py-2 text-xs rounded-full',
  md: 'px-5 py-2.5 text-sm rounded-full',
  lg: 'px-8 py-3.5 text-sm rounded-full',
};

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  magnetic?: boolean;
}

const LoadingDots = () => (
  <span className="flex items-center gap-1">
    {[0, 1, 2].map(i => (
      <motion.span
        key={i}
        className="h-1.5 w-1.5 rounded-full bg-current"
        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
      />
    ))}
  </span>
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'ghost', size = 'md', isLoading = false, magnetic = false, className = '', children, disabled, ...props }, ref) => {
    const buttonRef = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const springX = useSpring(x, { stiffness: 350, damping: 35 });
    const springY = useSpring(y, { stiffness: 350, damping: 35 });

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!magnetic || !buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      x.set((e.clientX - (rect.left + rect.width / 2)) * 0.25);
      y.set((e.clientY - (rect.top + rect.height / 2)) * 0.25);
    };

    const handleMouseLeave = () => { x.set(0); y.set(0); };

    const base = `inline-flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;

    return (
      <motion.div
        ref={buttonRef}
        style={magnetic ? { x: springX, y: springY } : undefined}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <motion.button
          ref={ref}
          whileTap={{ scale: 0.97 }}
          className={base}
          disabled={disabled || isLoading}
          {...(props as any)}
        >
          {isLoading ? <LoadingDots /> : children}
        </motion.button>
      </motion.div>
    );
  }
);

Button.displayName = 'Button';
