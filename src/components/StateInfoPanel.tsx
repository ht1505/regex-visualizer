'use client';

import React from 'react';
import { NFA, DFA } from '@/types/automata';

interface StateInfoPanelProps {
  selectedState: string | null;
  nfa?: NFA | null;
  dfa?: DFA | null;
  mode: 'nfa' | 'dfa';
  onClose: () => void;
}

function typeLabel(isStart: boolean, isAccept: boolean) {
  const parts: string[] = [];
  if (isStart) parts.push('Start');
  parts.push(isAccept ? 'Accepting' : 'Non-accepting');
  return parts.join(', ');
}

export default function StateInfoPanel({ selectedState, nfa, dfa, mode, onClose }: StateInfoPanelProps) {
  if (!selectedState) return null;

  let content: React.ReactNode = null;
  let heading = 'State';

  if (mode === 'nfa' && nfa) {
    const state = nfa.states.find(s => s.id === selectedState);
    if (!state) return null;

    const outgoing = nfa.transitions.filter(t => t.from === selectedState);
    const incoming = nfa.transitions.filter(t => t.to === selectedState);
    heading = 'ε-NFA State';

    content = (
      <>
        <div className="kv">
          <span className="kv-label">State</span>
          <span className="kv-value mono large">{state.id}</span>
        </div>
        <div className="kv">
          <span className="kv-label">Type</span>
          <span className="kv-value">{typeLabel(state.isStart, state.isAccept)}</span>
        </div>
        <div className="kv">
          <span className="kv-label">Outgoing</span>
          {outgoing.length ? (
            <ul className="fragment-list">
              {outgoing.map((t, i) => (
                <li key={i}>
                  {t.from} <span className="arrow">─</span><span className="sym">{t.symbol}</span><span className="arrow">→</span> {t.to}
                </li>
              ))}
            </ul>
          ) : (
            <span className="kv-value" style={{ color: 'var(--text-3)' }}>None</span>
          )}
        </div>
        <div className="kv">
          <span className="kv-label">Incoming</span>
          {incoming.length ? (
            <ul className="fragment-list">
              {incoming.map((t, i) => (
                <li key={i}>
                  {t.from} <span className="arrow">─</span><span className="sym">{t.symbol}</span><span className="arrow">→</span> {t.to}
                </li>
              ))}
            </ul>
          ) : (
            <span className="kv-value" style={{ color: 'var(--text-3)' }}>None</span>
          )}
        </div>
      </>
    );
  } else if (mode === 'dfa' && dfa) {
    const state = dfa.states.find(s => s.id === selectedState);
    if (!state) return null;

    const outgoing = dfa.transitions.filter(t => t.from === selectedState);
    const isDead = state.label === 'DEAD' || state.id === 'dfa_dead';
    heading = isDead ? 'DFA Trap State' : 'DFA State';

    content = (
      <>
        <div className="kv">
          <span className="kv-label">State</span>
          <span className="kv-value mono large">{state.label}</span>
        </div>
        <div className="kv">
          <span className="kv-label">NFA State Set</span>
          <span className="kv-value mono">
            {isDead || state.nfaStates.length === 0 ? '∅ (Empty Set)' : '{' + state.nfaStates.join(', ') + '}'}
          </span>
        </div>
        <div className="kv">
          <span className="kv-label">Type</span>
          <span className="kv-value">
            {isDead ? 'Dead / Trap State (Non-accepting)' : typeLabel(state.isStart, state.isAccept)}
          </span>
        </div>
        <div className="kv">
          <span className="kv-label">Transitions</span>
          {outgoing.length ? (
            <ul className="fragment-list">
              {outgoing.map((t, i) => {
                const toState = dfa.states.find(s => s.id === t.to);
                return (
                  <li key={i}>
                    δ({state.label}, <span className="sym">{t.symbol}</span>) = {toState?.label ?? '∅'}
                  </li>
                );
              })}
            </ul>
          ) : (
            <span className="kv-value" style={{ color: 'var(--text-3)' }}>None</span>
          )}
        </div>
      </>
    );
  }

  return (
    <aside className="inspector" aria-label="State details">
      <div className="inspector-header">
        <span className="panel-title">{heading}</span>
        <button onClick={onClose} className="close-btn" aria-label="Close state details">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <div className="inspector-body">{content}</div>
    </aside>
  );
}
