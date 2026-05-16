import { memo } from 'react';
import { motion } from 'framer-motion';

const nodes = [
  { id: 'payer',   x: 200, y: 48,  r: 22, label: 'Payer',      color: '#22d3ee', textColor: '#0e1a1d' },
  { id: 'root',    x: 200, y: 148, r: 18, label: 'Batch Root', color: '#67e8f9', textColor: '#0e1a1d' },
  { id: 'coin0',   x: 80,  y: 248, r: 14, label: 'Coin',       color: '#3f3f46', textColor: '#a1a1aa' },
  { id: 'coin1',   x: 200, y: 248, r: 14, label: 'Coin',       color: '#3f3f46', textColor: '#a1a1aa' },
  { id: 'coin2',   x: 320, y: 248, r: 14, label: 'Coin',       color: '#3f3f46', textColor: '#a1a1aa' },
  { id: 'recv0',   x: 80,  y: 348, r: 16, label: 'R₀',         color: '#27272a', textColor: '#71717a' },
  { id: 'recv1',   x: 200, y: 348, r: 16, label: 'R₁',         color: '#27272a', textColor: '#71717a' },
  { id: 'recv2',   x: 320, y: 348, r: 16, label: 'R₂',         color: '#27272a', textColor: '#71717a' },
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
  return `M ${a.x} ${a.y + a.r} L ${b.x} ${b.y - b.r}`;
}

export const ZKDiagram = memo(function ZKDiagram() {
  return (
    <svg viewBox="0 0 400 420" className="w-full h-full" style={{ maxHeight: 420 }}>
      {/* Background dot grid */}
      <defs>
        <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="rgba(63,63,70,0.5)" />
        </pattern>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="400" height="420" fill="url(#dots)" />

      {/* Ambient glow behind payer */}
      <ellipse cx="200" cy="48" rx="80" ry="60" fill="url(#glow)" />

      {/* ZK proof labels */}
      {[{ x: 80, y: 300 }, { x: 200, y: 300 }, { x: 320, y: 300 }].map((pos, i) => (
        <motion.text
          key={i}
          x={pos.x}
          y={pos.y}
          textAnchor="middle"
          fontSize="8"
          fill="#22d3ee"
          fontFamily="JetBrains Mono, monospace"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0.6, 0] }}
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
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.6 }}
          transition={{ duration: 0.6, delay: edge.delay, ease: 'easeOut' }}
        />
      ))}

      {/* Animated flow particles on edges */}
      {edges.slice(4).map((edge, i) => {
        const a = nodeMap[edge.from];
        const b = nodeMap[edge.to];
        return (
          <motion.circle
            key={`particle-${i}`}
            r="2.5"
            fill="#22d3ee"
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 0.8, 0],
              cx: [a.x, b.x],
              cy: [a.y + a.r, b.y - b.r],
            }}
            transition={{
              duration: 1.4,
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
              cx={node.x} cy={node.y} r={node.r + 6}
              fill="none"
              stroke={node.color}
              strokeWidth="1"
              initial={{ opacity: 0.4, scale: 1 }}
              animate={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.3, ease: 'easeOut' }}
              style={{ transformOrigin: `${node.x}px ${node.y}px` }}
            />
          )}
          <circle cx={node.x} cy={node.y} r={node.r} fill={node.color} />
          <text
            x={node.x} y={node.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={node.id === 'payer' || node.id === 'root' ? '8' : '7'}
            fill={node.textColor}
            fontFamily="Outfit, system-ui, sans-serif"
            fontWeight="600"
          >
            {node.label}
          </text>
        </motion.g>
      ))}
    </svg>
  );
});
