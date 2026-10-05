// Epsilon closure computation for NFA states

import { NFA } from '../types/automata';

export function isEpsilon(symbol: string): boolean {
  return symbol === 'ε' || symbol === 'ϵ' || symbol === '' || symbol === 'eps' || symbol.toLowerCase() === 'epsilon';
}

/**
 * Computes the epsilon-closure of a set of NFA states.
 * Fully transitive using stack and visited set.
 * Returns all states reachable from the given states via zero or more ε-transitions.
 */
export function epsilonClosure(nfa: NFA, states: string[]): string[] {
  const closure = new Set<string>(states);
  const stack = [...states];

  while (stack.length > 0) {
    const state = stack.pop()!;
    for (const t of nfa.transitions) {
      if (t.from === state && isEpsilon(t.symbol) && !closure.has(t.to)) {
        closure.add(t.to);
        stack.push(t.to);
      }
    }
  }

  return [...closure].sort();
}

/**
 * Computes move(states, symbol) — the set of NFA states reachable from
 * any state in the given set via a transition on the given symbol (non-ε).
 */
export function move(nfa: NFA, states: string[], symbol: string): string[] {
  const result = new Set<string>();

  for (const state of states) {
    for (const t of nfa.transitions) {
      if (t.from === state && t.symbol === symbol) {
        result.add(t.to);
      }
    }
  }

  return [...result].sort();
}
