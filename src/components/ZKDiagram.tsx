import { memo } from 'react';
import { motion } from 'framer-motion';

const nodes = [
  { id: 'payer',   x: 400, y: 50,  r: 28, label: 'Payer',      color: '#22d3ee', textColor: '#000000' },
  { id: 'root',    x: 400, y: 160, r: 24, label: 'Batch Root', color: '#67e8f9', textColor: '#000000' },
  { id: 'coin0',   x: 180, y: 280, r: 18, label: 'Coin',       color: '#18181b', textColor: '#a1a1aa' },
  { id: 'coin1',   x: 400, y: 280, r: 18, label: 'Coin',       color: '#18181b', textColor: '#a1a1aa' },
  { id: 'coin2',   x: 620, y: 280, r: 18, label: 'Coin',       color: '#18181b', textColor: '#a1a1aa' },
  { id: 'recv0',   x: 180, y: 380, r: 20, label: 'R₀',         color: '#09090b', textColor: '#71717a' },
  { id: 'recv1',   x: 400, y: 380, r: 20, label: 'R₁',         color: '#09090b', textColor: '#71717a' },
  { id: 'recv2',   x: 620, y: 380, r: 20, label: 'R₂',         color: '#09090b', textColor: '#71717a' },
];

const edges = [
  { from: 'payer', to: 'root',  color: '#22d3ee', delay: 0.2 },
  { from: 'root',  to: 'coin0', color: '#67e8f9', delay: 0.4 },
  { from: 'root',  to: 'coin1', color: '#67e8f9', delay: 0.5 },
  { from: 'root',  to: 'coin2', color: '#67e8f9', delay: 0.6 },
  { from: 'coin0', to: 'recv0', color: '#3f3f46', delay: 0.8 },
  { from: 'coin1', to: 'recv1', color: '#3f3f46', delay: 0.9 },
  { from: 'coin2', to: 'recv2', color: '#3f3f46', delay: 1.0 },
];

const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

function getEdgePath(from: string, to: string) {
  const a = nodeMap[from];
  const b = nodeMap[to];
  // Simple cubic bezier curve for high-end feel
  return `M ${a.x} ${a.y + a.r} C ${a.x} ${(a.y + b.y)/2}, ${b.x} ${(a.y + b.y)/2}, ${b.x} ${b.y - b.r}`;
}

export const ZKDiagram = memo(function ZKDiagram() {
  return (
    <svg viewBox="0 0 800 460" className="w-full h-full" style={{ maxHeight: 460 }}>
      {/* Background dot grid */}
      <defs>
        <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.05)" />
        </pattern>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="460" fill="url(#dots)" />

      {/* Ambient glow behind payer */}
      <ellipse cx="400" cy="50" rx="120" ry="80" fill="url(#glow)" />

      {/* ZK proof labels */}
      {[{ x: 180, y: 330 }, { x: 400, y: 330 }, { x: 620, y: 330 }].map((pos, i) => (
        <motion.text
          key={i}
          x={pos.x}
          y={pos.y}
          textAnchor="middle"
          fontSize="10"
          fill="#22d3ee"
          fontFamily="JetBrains Mono, monospace"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0.8, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: 1.2 + i * 0.15, ease: 'easeInOut' }}
        >
          zk-proof
        </motion.text>
      ))}

      {/* Edges */}
      {edges.map(edge => (
        <motion.path
          key={`${edge.from}-${edge.to}`}
          d={getEdgePath(edge.from, edge.to)}
          fill="none"
          stroke={edge.color}
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.5 }}
          transition={{ duration: 0.8, delay: edge.delay, ease: 'easeOut' }}
        />
      ))}

      {/* Animated flow particles on edges */}
      {edges.slice(4).map((edge, i) => {
        const a = nodeMap[edge.from];
        const b = nodeMap[edge.to];
        return (
          <motion.circle
            key={`particle-${i}`}
            r="3"
            fill="#22d3ee"
            initial={{ opacity: 0, cx: a.x, cy: a.y + a.r }}
            animate={{
              opacity: [0, 1, 0],
              cx: [a.x, b.x],
              cy: [a.y + a.r, b.y - b.r],
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              delay: 1.5 + i * 0.6,
              ease: 'easeInOut',
            }}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node, i) => (
        <motion.g key={node.id}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.15 + i * 0.1 }}
          style={{ transformOrigin: `${node.x}px ${node.y}px` }}
        >
          {/* Pulse ring on active nodes */}
          {(node.id === 'payer' || node.id === 'root') && (
            <motion.circle
              cx={node.x} cy={node.y} r={node.r + 8}
              fill="none"
              stroke={node.color}
              strokeWidth="1.5"
              initial={{ opacity: 0.5, scale: 1 }}
              animate={{ opacity: 0, scale: 1.6 }}
              transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3, ease: 'easeOut' }}
              style={{ transformOrigin: `${node.x}px ${node.y}px` }}
            />
          )}
          <circle cx={node.x} cy={node.y} r={node.r} fill={node.color} stroke={node.id.startsWith('recv') ? '#3f3f46' : 'none'} strokeWidth="2" />
          <text
            x={node.x} y={node.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={node.id === 'payer' || node.id === 'root' ? '10' : '9'}
            fill={node.textColor}
            fontFamily="Outfit, system-ui, sans-serif"
            fontWeight="700"
            letterSpacing="0.05em"
          >
            {node.label}
          </text>
        </motion.g>
      ))}
    </svg>

  );
});
