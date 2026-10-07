// Subset Construction Algorithm: NFA → DFA
// Also records step-by-step construction for visualization

import { NFA, DFA, DFAState, DFATransition, DFAConstructionStep } from '../types/automata';
import { epsilonClosure, move } from './epsilonClosure';

// Convert a set of NFA state IDs to a canonical string key
function setKey(states: string[]): string {
  return [...new Set(states)].sort().join(',');
}

// Generate DFA state label: q0, q1, q2, ...
function generateLabel(index: number): string {
  return `q${index}`;
}

export interface SubsetConstructionResult {
  dfa: DFA;
  steps: DFAConstructionStep[];
}

export function subsetConstruction(nfa: NFA): SubsetConstructionResult {
  const steps: DFAConstructionStep[] = [];
  let stepId = 0;

  const alphabet = nfa.alphabet;

  // Compute start state closure
  const startClosure = epsilonClosure(nfa, [nfa.startState]);

  const dfaStateMap = new Map<string, DFAState>(); // key -> DFAState
  const dfaTransitions: DFATransition[] = [];

  const queue: string[][] = [startClosure]; // sets of NFA states to process
  let labelIndex = 0;

  const processed = new Set<string>();

  // Helper: get or create a DFA state for a set of NFA states
  function getDFAState(nfaStates: string[]): DFAState {
    const key = setKey(nfaStates);
    if (!dfaStateMap.has(key)) {
      const label = generateLabel(labelIndex++);
      const isAccept = nfaStates.some(s => nfa.acceptStates.includes(s));
      const isStart = key === setKey(startClosure);
      const state: DFAState = {
        id: `dfa_${key.replace(/,/g, '_')}`,
        nfaStates,
        isStart,
        isAccept,
        label,
      };
      dfaStateMap.set(key, state);
    }
    return dfaStateMap.get(key)!;
  }

  // Initialize start DFA state
  const startDFAState = getDFAState(startClosure);

  function buildDFASnapshot(): DFA {
    const allStates = [...dfaStateMap.values()];
    return {
      states: allStates,
      transitions: [...dfaTransitions],
      startState: startDFAState.id,
      acceptStates: allStates.filter(s => s.isAccept).map(s => s.id),
      alphabet,
    };
  }

  steps.push({
    id: stepId++,
    description: `Start DFA construction. Initial state ${startDFAState.label} = ε-closure({${nfa.startState}}) = {${startClosure.join(', ')}}`,
    currentDFAState: startDFAState.id,
    closureResult: startClosure,
    dfaSnapshot: buildDFASnapshot(),
  });

  while (queue.length > 0) {
    const currentSet = queue.shift()!;
    const currentKey = setKey(currentSet);

    if (processed.has(currentKey)) continue;
    processed.add(currentKey);

    const currentDFAState = getDFAState(currentSet);

    for (const symbol of alphabet) {
      // Compute move
      const moveResult = move(nfa, currentSet, symbol);

      if (moveResult.length === 0) {
        steps.push({
          id: stepId++,
          description: `From DFA state ${currentDFAState.label} = {${currentSet.join(', ')}}, on symbol '${symbol}': move = ∅ (dead state)`,
          currentDFAState: currentDFAState.id,
          symbol,
          moveResult: [],
          closureResult: [],
          dfaSnapshot: buildDFASnapshot(),
        });
        continue;
      }

      // Compute ε-closure of move result
      const closureResult = epsilonClosure(nfa, moveResult);
      const targetKey = setKey(closureResult);

      let targetDFAState = dfaStateMap.get(targetKey);
      let isNew = false;
      if (!targetDFAState) {
        isNew = true;
        targetDFAState = getDFAState(closureResult);
        queue.push(closureResult);
      }

      // Add DFA transition
      const transitionExists = dfaTransitions.some(
        t => t.from === currentDFAState.id && t.symbol === symbol && t.to === targetDFAState!.id
      );
      if (!transitionExists) {
        dfaTransitions.push({
          from: currentDFAState.id,
          to: targetDFAState.id,
          symbol,
        });
      }

      steps.push({
        id: stepId++,
        description: `From ${currentDFAState.label} = {${currentSet.join(', ')}}, on '${symbol}':
  move = {${moveResult.join(', ')}}
  ε-closure = {${closureResult.join(', ')}}
  → DFA state ${targetDFAState.label}${isNew ? ' (new!)' : ''} ${targetDFAState.isAccept ? '(accepting)' : ''}`,
        currentDFAState: currentDFAState.id,
        symbol,
        moveResult,
        closureResult,
        newDFAStateName: isNew ? targetDFAState.label : undefined,
        isAccepting: targetDFAState.isAccept,
        dfaSnapshot: buildDFASnapshot(),
      });
    }
  }

  const allDFAStates = [...dfaStateMap.values()];
  const finalDFA: DFA = {
    states: allDFAStates,
    transitions: dfaTransitions,
    startState: startDFAState.id,
    acceptStates: allDFAStates.filter(s => s.isAccept).map(s => s.id),
    alphabet,
  };

  steps.push({
    id: stepId++,
    description: `DFA construction complete! ${allDFAStates.length} states, ${dfaTransitions.length} transitions.`,
    currentDFAState: '',
    dfaSnapshot: finalDFA,
  });

  return { dfa: finalDFA, steps };
}
