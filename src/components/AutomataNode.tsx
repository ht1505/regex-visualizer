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
  const stroke = emphasised ? '#2563eb' : selected ? '#1f2937' : isDead ? '#64748b' : '#334155';
  const fill = isActive ? '#dbeafe' : isHighlighted ? '#eff6ff' : isDead ? '#f8fafc' : '#ffffff';
  const textColor = emphasised ? '#1d4ed8' : isDead ? '#334155' : '#1f2937';
  const strokeWidth = isActive ? 2.2 : 1.6;

  const subset = isDead
    ? 'trap'
    : stateType === 'dfa' && nfaStates && nfaStates.length > 0
    ? '{' + nfaStates.slice(0, 4).join(',') + (nfaStates.length > 4 ? ',…' : '') + '}'
    : null;

  return (
    <div
      className="fade-in"
      style={{ width: NODE_SIZE, height: NODE_SIZE, position: 'relative', userSelect: 'none' }}
      title={isDead ? 'DEAD (Trap State)' : stateType === 'dfa' && nfaStates ? `${label} = {${nfaStates.join(', ')}}` : label}
    >
      {/* Start arrow */}
      {isStart && (
        <svg
          width="40"
          height="14"
          viewBox="0 0 40 14"
          style={{ position: 'absolute', left: -44, top: NODE_SIZE / 2 - 7, overflow: 'visible' }}
          aria-hidden
        >
          <line x1="0" y1="7" x2="31" y2="7" stroke="#334155" strokeWidth="1.6" />
          <path d="M30 2 L39 7 L30 12 Z" fill="#334155" />
        </svg>
      )}

      {/* State shape: double rounded rect for DEAD, circle(s) for normal/accepting */}
      <svg width={NODE_SIZE} height={NODE_SIZE} viewBox={`0 0 ${NODE_SIZE} ${NODE_SIZE}`} style={{ display: 'block', overflow: 'visible' }}>
        {isDead ? (
          <>
            <rect
              x={1.5}
              y={1.5}
              width={NODE_SIZE - 3}
              height={NODE_SIZE - 3}
              rx={8}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              style={{ transition: 'fill 200ms, stroke 200ms' }}
            />
            <rect
              x={6}
              y={6}
              width={NODE_SIZE - 12}
              height={NODE_SIZE - 12}
              rx={5}
              fill="none"
              stroke={stroke}
              strokeWidth={1.2}
              style={{ transition: 'stroke 200ms' }}
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
                r={NODE_SIZE / 2 - 7.5}
                fill="none"
                stroke={stroke}
                strokeWidth={1.6}
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
          fontFamily: 'var(--mono)',
          fontSize: isDead ? 11.5 : 14,
          fontWeight: 600,
          letterSpacing: isDead ? '0.04em' : 'normal',
          color: textColor,
          pointerEvents: 'none',
          transition: 'color 200ms',
        }}
      >
        {label}
      </div>

      {/* DFA: underlying NFA state set or trap indicator */}
      {subset && (
        <div
          style={{
            position: 'absolute',
            top: NODE_SIZE + 5,
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: isDead ? '#94a3b8' : '#6b7280',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {subset}
        </div>
      )}

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
