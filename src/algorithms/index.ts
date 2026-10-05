// Main algorithm orchestrator - ties together all algorithms

import { validateRegex, tokenize, insertConcatenation, Token } from './tokenizer';
import { toPostfix, postfixToString } from './postfix';
import { thompsonConstruction } from './thompson';
import { subsetConstruction } from './subsetConstruction';
import { completeDFA } from './completeDFA';
import { minimizeDFA } from './minimizeDFA';
import { NFA, DFA, ConstructionStep, DFAConstructionStep } from '../types/automata';

export interface AutomataResult {
  tokens: Token[];
  tokensWithConcat: Token[];
  postfix: Token[];
  postfixString: string;
  nfa: NFA;
  constructionSteps: ConstructionStep[];
  dfa: DFA;
  dfaSteps: DFAConstructionStep[];
  minimizedDFA: DFA | null;
}

/**
 * Main entry point: take a regex string and produce all automata with construction steps.
 */
export function buildAutomata(regex: string, enableMinimization = true): AutomataResult {
  // Phase 1: Validate and tokenize
  validateRegex(regex);
  const tokens = tokenize(regex);
  const tokensWithConcat = insertConcatenation(tokens);

  // Phase 2: Convert to postfix
  const postfix = toPostfix(tokensWithConcat);
  const postfixString = postfixToString(postfix);

  // Phase 3: Thompson's Construction (NFA)
  const { nfa, steps: constructionSteps } = thompsonConstruction(postfix);

  // Phase 4: Subset Construction (DFA)
  const { dfa: rawDFA, steps: subsetSteps } = subsetConstruction(nfa);

  // Phase 5: Complete DFA (ensure total transition function with DEAD state if needed)
  const { dfa, steps: dfaSteps } = completeDFA(rawDFA, subsetSteps);

  // Phase 5: Optional DFA Minimization
  let minimizedDFA: DFA | null = null;
  if (enableMinimization && dfa.states.length > 0) {
    try {
      const minDFA = minimizeDFA(dfa);
      minimizedDFA = minDFA;
    } catch (e) {
      // minimization failed, skip
      console.warn('DFA minimization failed:', e);
    }
  }

  return {
    tokens,
    tokensWithConcat,
    postfix,
    postfixString,
    nfa,
    constructionSteps,
    dfa,
    dfaSteps,
    minimizedDFA,
  };
}
