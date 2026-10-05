// Core Types for Automata Visualization

export interface State {
  id: string;
  isStart: boolean;
  isAccept: boolean;
  label?: string;
}

export interface Transition {
  from: string;
  to: string;
  symbol: string; // 'ε' for epsilon
}

export interface NFA {
  states: State[];
  transitions: Transition[];
  startState: string;
  acceptStates: string[];
  alphabet: string[];
}

export interface DFAState {
  id: string;
  nfaStates: string[]; // set of NFA state IDs
  isStart: boolean;
  isAccept: boolean;
  label: string; // e.g. 'A', 'B', 'C'
}

export interface DFATransition {
  from: string;
  to: string;
  symbol: string;
}

export interface DFA {
  states: DFAState[];
  transitions: DFATransition[];
  startState: string;
  acceptStates: string[];
  alphabet: string[];
}

// NFA fragment used during Thompson's construction
export interface NFAFragment {
  start: string;
  accept: string;
  states: State[];
  transitions: Transition[];
}

// A step in the construction process (for animation)
export interface ConstructionStep {
  id: number;
  type: 'symbol' | 'concat' | 'union' | 'star' | 'plus' | 'optional' | 'epsilon-closure' | 'move' | 'subset' | 'info';
  description: string;
  operand?: string;
  newStates: State[];
  newTransitions: Transition[];
  highlightedStates: string[];
  highlightedTransitions: string[];
  nfaSnapshot: NFA; // snapshot of NFA at this step
  fragmentStart?: string;
  fragmentAccept?: string;
}

export interface DFAConstructionStep {
  id: number;
  description: string;
  currentDFAState: string;
  symbol?: string;
  moveResult?: string[];
  closureResult?: string[];
  newDFAStateName?: string;
  isAccepting?: boolean;
  dfaSnapshot: DFA;
}

export interface SimulationStep {
  inputIndex: number;
  currentChar: string | null;
  currentState: string;
  transitionUsed?: DFATransition;
  isAccepted?: boolean;
  isRejected?: boolean;
  description: string;
}

export type AutomataStage = 'idle' | 'regex' | 'postfix' | 'nfa' | 'dfa' | 'minimized';

export interface AppState {
  regex: string;
  tokens: string[];
  postfix: string;
  nfa: NFA | null;
  dfa: DFA | null;
  minimizedDFA: DFA | null;
  constructionSteps: ConstructionStep[];
  dfaSteps: DFAConstructionStep[];
  currentStep: number;
  currentStage: AutomataStage;
  error: string | null;
  isAnimating: boolean;
  animationSpeed: number; // ms per step
  mode: 'auto' | 'step';
  selectedState: string | null;
  simulationInput: string;
  simulationSteps: SimulationStep[];
  simulationIndex: number;
  isSimulating: boolean;
}
