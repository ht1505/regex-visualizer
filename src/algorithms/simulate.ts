// String simulation on DFA

import { DFA, DFATransition, SimulationStep } from '../types/automata';

/**
 * Simulate a string on the given DFA.
 * Returns an array of SimulationSteps for animation.
 */
export function simulateDFA(dfa: DFA, input: string): SimulationStep[] {
  const steps: SimulationStep[] = [];

  if (!dfa.startState) {
    return [{
      inputIndex: -1,
      currentChar: null,
      currentState: '',
      description: 'No DFA available for simulation.',
      isRejected: true,
    }];
  }

  // Build transition lookup
  const transMap = new Map<string, Map<string, DFATransition>>();
  for (const t of dfa.transitions) {
    if (!transMap.has(t.from)) transMap.set(t.from, new Map());
    transMap.get(t.from)!.set(t.symbol, t);
  }

  let currentState = dfa.startState;

  // Initial step
  steps.push({
    inputIndex: -1,
    currentChar: null,
    currentState,
    description: `Start in state ${dfa.states.find(s => s.id === currentState)?.label ?? currentState}`,
  });

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const stateLabel = dfa.states.find(s => s.id === currentState)?.label ?? currentState;
    const transitions = transMap.get(currentState);
    const transition = transitions?.get(char);

    if (!transition) {
      steps.push({
        inputIndex: i,
        currentChar: char,
        currentState,
        description: `In state ${stateLabel}, no transition on '${char}' → REJECTED`,
        isRejected: true,
      });
      return steps;
    }

    const nextState = transition.to;
    const nextLabel = dfa.states.find(s => s.id === nextState)?.label ?? nextState;

    steps.push({
      inputIndex: i,
      currentChar: char,
      currentState: nextState,
      transitionUsed: transition,
      description: `Read '${char}': ${stateLabel} → ${nextLabel}`,
    });

    currentState = nextState;
  }

  // Check if final state is accepting
  const isAccepted = dfa.acceptStates.includes(currentState);
  const finalLabel = dfa.states.find(s => s.id === currentState)?.label ?? currentState;

  steps.push({
    inputIndex: input.length,
    currentChar: null,
    currentState,
    description: isAccepted
      ? `End of input in state ${finalLabel} (accepting) → ACCEPTED ✓`
      : `End of input in state ${finalLabel} (non-accepting) → REJECTED ✗`,
    isAccepted,
    isRejected: !isAccepted,
  });

  return steps;
}
