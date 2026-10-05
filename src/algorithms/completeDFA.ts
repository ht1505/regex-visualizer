// DFA Completion Algorithm
// Ensures every DFA state has exactly one outgoing transition for every symbol in the alphabet.
// If any transition is missing, creates a shared DEAD/trap state with self-loops.

import { DFA, DFAState, DFATransition, DFAConstructionStep } from '../types/automata';

export interface CompleteDFAResult {
  dfa: DFA;
  steps: DFAConstructionStep[];
  hasDeadState: boolean;
}

/**
 * Complete a DFA so that its transition function δ is total:
 * For every state q ∈ Q and symbol a ∈ Σ, there exists exactly one transition δ(q, a).
 * If transitions are missing, routes them to a non-accepting DEAD trap state.
 * If the DFA is already complete, returns it without creating an unnecessary DEAD state.
 */
export function completeDFA(dfa: DFA, initialSteps: DFAConstructionStep[] = []): CompleteDFAResult {
  if (dfa.states.length === 0 || dfa.alphabet.length === 0) {
    return { dfa, steps: initialSteps, hasDeadState: false };
  }

  const alphabet = [...dfa.alphabet].sort();
  const steps: DFAConstructionStep[] = [...initialSteps];
  let stepId = steps.length > 0 ? Math.max(...steps.map(s => s.id)) + 1 : 1;

  // Build transition lookup: fromId -> symbol -> toId
  const transMap = new Map<string, Map<string, string>>();
  for (const t of dfa.transitions) {
    if (!transMap.has(t.from)) transMap.set(t.from, new Map());
    transMap.get(t.from)!.set(t.symbol, t.to);
  }

  // Find all missing transitions across existing DFA states
  const missingTransitions: Array<{ state: DFAState; symbol: string }> = [];
  for (const state of dfa.states) {
    const stateTransitions = transMap.get(state.id);
    for (const sym of alphabet) {
      if (!stateTransitions || !stateTransitions.has(sym)) {
        missingTransitions.push({ state, symbol: sym });
      }
    }
  }

  // Edge case: if no transitions are missing, the DFA is already complete
  if (missingTransitions.length === 0) {
    return { dfa, steps, hasDeadState: false };
  }

  // Create the shared DEAD state
  const deadStateId = 'dfa_dead';
  const deadState: DFAState = {
    id: deadStateId,
    nfaStates: [],
    isStart: false,
    isAccept: false,
    label: 'DEAD',
  };

  // Self-loops on DEAD for every alphabet symbol
  const deadSelfLoops: DFATransition[] = alphabet.map(sym => ({
    from: deadStateId,
    to: deadStateId,
    symbol: sym,
  }));

  // Missing transitions routed to DEAD
  const routedTransitions: DFATransition[] = missingTransitions.map(m => ({
    from: m.state.id,
    to: deadStateId,
    symbol: m.symbol,
  }));

  const allCompletedStates: DFAState[] = [...dfa.states, deadState];
  const allCompletedTransitions: DFATransition[] = [
    ...dfa.transitions,
    ...routedTransitions,
    ...deadSelfLoops,
  ];

  const completedDFA: DFA = {
    states: allCompletedStates,
    transitions: allCompletedTransitions,
    startState: dfa.startState,
    acceptStates: dfa.acceptStates,
    alphabet,
  };

  // Group missing transitions by state
  const missingByState = new Map<string, { state: DFAState; symbols: string[] }>();
  for (const m of missingTransitions) {
    if (!missingByState.has(m.state.id)) {
      missingByState.set(m.state.id, { state: m.state, symbols: [] });
    }
    missingByState.get(m.state.id)!.symbols.push(m.symbol);
  }

  const missingSummaries = [...missingByState.values()].map(({ state, symbols }) => {
    return `State ${state.label}: missing on {${symbols.join(', ')}} → routed to DEAD`;
  });

  // Step 1: Detect missing transitions and add DEAD state with all transitions present
  steps.push({
    id: stepId++,
    description: `DFA Completion: Detected ${missingTransitions.length} missing transition(s) over alphabet Σ = {${alphabet.join(', ')}}:\n• ${missingSummaries.join('\n• ')}\n\nCreated non-accepting trap state DEAD with self-loops δ(DEAD, c) = DEAD and connected all missing transitions.`,
    currentDFAState: deadStateId,
    newDFAStateName: 'DEAD',
    isAccepting: false,
    closureResult: [],
    dfaSnapshot: completedDFA,
  });

  // For each state with missing transitions, record an explanatory focus step
  for (const { state, symbols } of missingByState.values()) {
    const deltaList = symbols.map(s => `δ(${state.label}, '${s}') = DEAD`).join(', ');

    steps.push({
      id: stepId++,
      description: `DFA Completion: State ${state.label} has no natural transition on ${symbols.map(s => `'${s}'`).join(', ')}. Routed to trap state: ${deltaList}.`,
      currentDFAState: state.id,
      symbol: symbols.join(', '),
      closureResult: [],
      dfaSnapshot: completedDFA,
    });
  }

  // Final step: Total transition coverage
  steps.push({
    id: stepId++,
    description: `Complete DFA finalized! Every state now has exactly one outgoing transition for each symbol in Σ = {${alphabet.join(', ')}}. Total states: ${allCompletedStates.length}, total transitions: ${allCompletedTransitions.length}.`,
    currentDFAState: '',
    dfaSnapshot: completedDFA,
  });

  return {
    dfa: completedDFA,
    steps,
    hasDeadState: true,
  };
}
