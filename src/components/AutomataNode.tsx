'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export interface AutomataNodeData {
  label: string;
  isStart: boolean;
  isAccept: boolean;
  isActive: boolean; // highlighted during simulation
  isHighlighted: boolean; // highlighted during construction
  stateType: 'nfa' | 'dfa';
  nfaStates?: string[]; // for DFA nodes: set of NFA states
}

export const NODE_SIZE = 74;

const AutomataNode = memo(({ data, selected }: NodeProps<AutomataNodeData>) => {
  const { label, isStart, isAccept, isActive, isHighlighted, stateType, nfaStates } = data;

  const isDead = label === 'DEAD' || label.startsWith('DEAD') || label.endsWith('DEAD');

  const emphasised = isActive || isHighlighted;

  // Crisp textbook automata styling matching formal textbook diagrams
  let fill: string;
  let stroke: string;
  let textColor: string;

  if (isDead) {
    fill = emphasised ? '#f1f5f9' : '#f8fafc';
    stroke = emphasised ? '#2563eb' : '#64748b';
    textColor = emphasised ? '#1d4ed8' : '#475569';
  } else if (isAccept) {
    fill = emphasised ? '#eff6ff' : '#ffffff';
    stroke = emphasised ? '#2563eb' : '#000000';
    textColor = emphasised ? '#1d4ed8' : '#000000';
  } else {
    fill = emphasised ? '#eff6ff' : '#ffffff';
    stroke = emphasised ? '#2563eb' : '#000000';
    textColor = emphasised ? '#1d4ed8' : '#000000';
  }

  const strokeWidth = emphasised ? 2.4 : 2;

  const subset = isDead
    ? 'trap'
    : stateType === 'dfa' && nfaStates && nfaStates.length > 0
    ? '{' + nfaStates.slice(0, 4).join(',') + (nfaStates.length > 4 ? ',…' : '') + '}'
    : null;

  return (
    <div
      className="fade-in"
      style={{
        width: NODE_SIZE,
        height: NODE_SIZE,
        position: 'relative',
        userSelect: 'none',
        filter: emphasised ? 'drop-shadow(0 0 10px rgba(37, 99, 235, 0.35))' : 'none',
      }}
      title={isDead ? 'DEAD (Trap State)' : stateType === 'dfa' && nfaStates ? `${label} = {${nfaStates.join(', ')}}` : label}
    >
      {/* Start indicator: classic solid bullet and arrow entering start state (● ──►) */}
      {isStart && (
        <div
          style={{
            position: 'absolute',
            left: -46,
            top: NODE_SIZE / 2 - 8,
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          <svg width="48" height="16" viewBox="0 0 48 16" style={{ overflow: 'visible' }}>
            <circle cx="5" cy="8" r="4.5" fill="#000000" />
            <line x1="9" y1="8" x2="38" y2="8" stroke="#000000" strokeWidth="2" />
            <path d="M37 3.5 L46 8 L37 12.5 Z" fill="#000000" />
          </svg>
        </div>
      )}

      {/* State shape: double rounded rect for DEAD, circle(s) for normal/accepting */}
      <svg width={NODE_SIZE} height={NODE_SIZE} viewBox={`0 0 ${NODE_SIZE} ${NODE_SIZE}`} style={{ display: 'block', overflow: 'visible' }}>
        {isDead ? (
          <>
            <rect
              x={2}
              y={2}
              width={NODE_SIZE - 4}
              height={NODE_SIZE - 4}
              rx={8}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray="4 3"
              style={{ transition: 'fill 200ms, stroke 200ms' }}
            />
          </>
        ) : (
          <>
            <circle
              cx={NODE_SIZE / 2}
              cy={NODE_SIZE / 2}
              r={NODE_SIZE / 2 - 1.5}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              style={{ transition: 'fill 200ms, stroke 200ms' }}
            />
            {isAccept && (
              <circle
                cx={NODE_SIZE / 2}
                cy={NODE_SIZE / 2}
                r={NODE_SIZE / 2 - 6.5}
                fill="none"
                stroke={stroke}
                strokeWidth={1.8}
                style={{ transition: 'stroke 200ms' }}
              />
            )}
          </>
        )}
      </svg>

      {/* Centered label */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--sans), var(--mono), sans-serif',
          fontSize: isDead ? 11.5 : 15.5,
          fontWeight: 700,
          letterSpacing: isDead ? '0.04em' : 'normal',
          color: textColor,
          pointerEvents: 'none',
          transition: 'color 200ms',
        }}
      >
        {label}
      </div>

      {/* Connection handles in all 4 cardinal directions */}
      <Handle type="target" position={Position.Left} style={{ opacity: 0, left: 1, width: 4, height: 4, minWidth: 0, minHeight: 0, border: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, right: 1, width: 4, height: 4, minWidth: 0, minHeight: 0, border: 'none' }} />
      <Handle type="target" id="top" position={Position.Top} style={{ opacity: 0, top: 1, width: 4, height: 4, minWidth: 0, minHeight: 0, border: 'none' }} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={{ opacity: 0, bottom: 1, width: 4, height: 4, minWidth: 0, minHeight: 0, border: 'none' }} />
    </div>
  );
});

AutomataNode.displayName = 'AutomataNode';
export default AutomataNode;
