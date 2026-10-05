'use client';

import React from 'react';
import { NFA, DFA } from '@/types/automata';

interface TransitionTableProps {
  nfa?: NFA | null;
  dfa?: DFA | null;
  mode: 'nfa' | 'dfa';
  title?: string;
}

function StateName({ name, isStart, isAccept }: { name: string; isStart: boolean; isAccept: boolean }) {
  return (
    <>
      <span className="marker">{isStart ? '→' : ''}</span>
      <span className="marker">{isAccept ? '*' : ''}</span>
      {name}
    </>
  );
}

export default function TransitionTable({ nfa, dfa, mode, title }: TransitionTableProps) {
  if (mode === 'nfa' && nfa) {
    const alphabet = [...nfa.alphabet, 'ε'].sort((a, b) => {
      if (a === 'ε') return 1;
      if (b === 'ε') return -1;
      return a.localeCompare(b);
    });

    // Build transition table
    const table: Record<string, Record<string, string[]>> = {};
    for (const state of nfa.states) {
      table[state.id] = {};
      for (const sym of alphabet) {
        table[state.id][sym] = [];
      }
    }
    for (const t of nfa.transitions) {
      if (table[t.from] && alphabet.includes(t.symbol)) {
        table[t.from][t.symbol].push(t.to);
      }
    }

    return (
      <div>
        <h3 className="section-heading">{title ?? 'ε-NFA Transition Table'}</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="align-left">State</th>
                {alphabet.map(sym => (
                  <th key={sym} className="mono">{sym}</th>
                ))}
                <th>Accepting</th>
              </tr>
            </thead>
            <tbody>
              {nfa.states.map(state => (
                <tr key={state.id}>
                  <td className="state-cell">
                    <StateName name={state.id} isStart={state.isStart} isAccept={state.isAccept} />
                  </td>
                  {alphabet.map(sym => {
                    const targets = table[state.id]?.[sym] ?? [];
                    return (
                      <td key={sym} className={targets.length ? '' : 'muted'}>
                        {targets.length ? `{${targets.join(', ')}}` : '∅'}
                      </td>
                    );
                  })}
                  <td className={`text ${state.isAccept ? '' : 'secondary'}`}>{state.isAccept ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="table-note">
          <code>→</code> start state &nbsp;·&nbsp; <code>*</code> accepting state &nbsp;·&nbsp; <code>∅</code> no transition
        </p>
      </div>
    );
  }

  if (mode === 'dfa' && dfa) {
    const alphabet = [...dfa.alphabet].sort();

    // Build lookup
    const transMap = new Map<string, Map<string, string>>();
    for (const t of dfa.transitions) {
      if (!transMap.has(t.from)) transMap.set(t.from, new Map());
      transMap.get(t.from)!.set(t.symbol, t.to);
    }

    return (
      <div>
        <h3 className="section-heading">{title ?? 'DFA Transition Table'}</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="align-left">State</th>
                <th className="align-left">NFA States</th>
                {alphabet.map(sym => (
                  <th key={sym} className="mono">{sym}</th>
                ))}
                <th>Accepting</th>
              </tr>
            </thead>
            <tbody>
              {dfa.states.map(state => (
                <tr key={state.id}>
                  <td className="state-cell">
                    <StateName name={state.label} isStart={state.isStart} isAccept={state.isAccept} />
                  </td>
                  <td className="align-left secondary">
                    {state.nfaStates.length > 0 ? '{' + state.nfaStates.join(', ') + '}' : '∅ (trap)'}
                  </td>
                  {alphabet.map(sym => {
                    const toId = transMap.get(state.id)?.get(sym);
                    const toState = dfa.states.find(s => s.id === toId);
                    return (
                      <td key={sym} className={toState ? '' : 'muted'}>
                        {toState ? toState.label : '∅'}
                      </td>
                    );
                  })}
                  <td className={`text ${state.isAccept ? '' : 'secondary'}`}>{state.isAccept ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="table-note">
          <code>→</code> start state &nbsp;·&nbsp; <code>*</code> accepting state &nbsp;·&nbsp; <code>DEAD</code> trap state (total transition function)
        </p>
      </div>
    );
  }

  return <p className="placeholder-text">No automaton available. Generate one first.</p>;
}
