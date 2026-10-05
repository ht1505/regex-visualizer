// Thompson's Construction Algorithm
// Converts a postfix regex to an ε-NFA

import { Token } from './tokenizer';
import { State, Transition, NFA, NFAFragment, ConstructionStep } from '../types/automata';

let stateCounter = 0;

function freshState(prefix = 'q'): string {
  return `${prefix}${stateCounter++}`;
}

function resetCounter() {
  stateCounter = 0;
}

function makeState(id: string, isStart = false, isAccept = false): State {
  return { id, isStart, isAccept };
}

function makeTransition(from: string, to: string, symbol: string): Transition {
  return { from, to, symbol };
}

/**
 * Build NFA from postfix expression using Thompson's Construction.
 * Returns both the final NFA and an array of ConstructionSteps for animation.
 */
export function thompsonConstruction(postfix: Token[]): {
  nfa: NFA;
  steps: ConstructionStep[];
} {
  resetCounter();

  const stack: NFAFragment[] = [];
  const steps: ConstructionStep[] = [];
  let stepId = 0;

  // Track all states and transitions accumulated so far
  const allStates: State[] = [];
  const allTransitions: Transition[] = [];
  const seenStates = new Set<string>();
  const seenTransitions = new Set<string>();
  const mergedInto = new Map<string, string>();

  function addStates(newStates: State[]) {
    for (const s of newStates) {
      if (!seenStates.has(s.id)) {
        seenStates.add(s.id);
        allStates.push(s);
      }
    }
  }

  function addTransitions(newTransitions: Transition[]) {
    for (const t of newTransitions) {
      const key = `${t.from}-${t.symbol}-${t.to}`;
      if (!seenTransitions.has(key)) {
        seenTransitions.add(key);
        allTransitions.push(t);
      }
    }
  }

  function snapshotNFA(currentFrag?: NFAFragment): NFA {
    const curStart = currentFrag?.start ?? (allStates.find(s => s.isStart)?.id ?? (allStates[0]?.id ?? ''));
    const curAccept = currentFrag?.accept ?? (allStates.find(s => s.isAccept)?.id ?? '');
    return {
      states: allStates.map(s => ({
        ...s,
        isStart: s.id === curStart,
        isAccept: s.id === curAccept,
      })),
      transitions: [...allTransitions],
      startState: curStart,
      acceptStates: curAccept ? [curAccept] : [],
      alphabet: [...new Set(allTransitions.filter(t => t.symbol !== 'ε').map(t => t.symbol))].sort(),
    };
  }

  for (const token of postfix) {
    if (token.type === 'SYMBOL') {
      // Create simple NFA: q0 --symbol--> q1
      const q0 = freshState();
      const q1 = freshState();

      const s0 = makeState(q0, false, false);
      const s1 = makeState(q1, false, false);
      const t = makeTransition(q0, q1, token.value);

      const frag: NFAFragment = {
        start: q0,
        accept: q1,
        states: [s0, s1],
        transitions: [t],
      };

      addStates([s0, s1]);
      addTransitions([t]);
      stack.push(frag);

      steps.push({
        id: stepId++,
        type: 'symbol',
        description: `Create symbol fragment for '${token.value}': ${q0} --${token.value}→ ${q1}`,
        operand: token.value,
        newStates: [s0, s1],
        newTransitions: [t],
        highlightedStates: [q0, q1],
        highlightedTransitions: [`${q0}-${token.value}-${q1}`],
        nfaSnapshot: snapshotNFA(frag),
        fragmentStart: q0,
        fragmentAccept: q1,
      });
    } else if (token.type === 'CONCAT') {
      // In standard Thompson's construction (Dragon Book Algorithm 3.23),
      // concatenation directly merges frag1.accept with frag2.start (no intermediate ε-transition)
      if (stack.length < 2) throw new Error('Not enough operands for concatenation.');
      const frag2 = stack.pop()!;
      const frag1 = stack.pop()!;

      const removeId = frag2.start;
      const targetId = frag1.accept;
      mergedInto.set(removeId, targetId);

      // Re-route any transitions touching frag2.start in frag2
      const updatedFrag2Transitions = frag2.transitions.map(t => ({
        from: t.from === removeId ? targetId : t.from,
        to: t.to === removeId ? targetId : t.to,
        symbol: t.symbol,
      }));

      // Update allTransitions in place
      for (let i = 0; i < allTransitions.length; i++) {
        const t = allTransitions[i];
        if (t.from === removeId || t.to === removeId) {
          allTransitions[i] = {
            from: t.from === removeId ? targetId : t.from,
            to: t.to === removeId ? targetId : t.to,
            symbol: t.symbol,
          };
        }
      }

      // Remove removeId from allStates
      const removeIdx = allStates.findIndex(s => s.id === removeId);
      if (removeIdx !== -1) {
        allStates.splice(removeIdx, 1);
      }

      const newAccept = frag2.accept === removeId ? targetId : frag2.accept;

      const newFrag: NFAFragment = {
        start: frag1.start,
        accept: newAccept,
        states: [...frag1.states, ...frag2.states.filter(s => s.id !== removeId)],
        transitions: [...frag1.transitions, ...updatedFrag2Transitions],
      };

      stack.push(newFrag);

      steps.push({
        id: stepId++,
        type: 'concat',
        description: `Apply CONCATENATION: connect ${frag1.accept} directly to next symbol (states merged, no ε needed)`,
        newStates: [],
        newTransitions: [],
        highlightedStates: [frag1.start, targetId, newFrag.accept],
        highlightedTransitions: [],
        nfaSnapshot: snapshotNFA(newFrag),
        fragmentStart: frag1.start,
        fragmentAccept: newFrag.accept,
      });
    } else if (token.type === 'UNION') {
      // Pop two fragments, create new start/accept with ε-transitions
      if (stack.length < 2) throw new Error('Not enough operands for union.');
      const frag2 = stack.pop()!;
      const frag1 = stack.pop()!;

      const qStart = freshState();
      const qAccept = freshState();

      const sStart = makeState(qStart, false, false);
      const sAccept = makeState(qAccept, false, false);

      const t1 = makeTransition(qStart, frag1.start, 'ε');
      const t2 = makeTransition(qStart, frag2.start, 'ε');
      const t3 = makeTransition(frag1.accept, qAccept, 'ε');
      const t4 = makeTransition(frag2.accept, qAccept, 'ε');

      const newFrag: NFAFragment = {
        start: qStart,
        accept: qAccept,
        states: [sStart, sAccept, ...frag1.states, ...frag2.states],
        transitions: [...frag1.transitions, ...frag2.transitions, t1, t2, t3, t4],
      };

      addStates([sStart, sAccept]);
      addTransitions([t1, t2, t3, t4]);
      stack.push(newFrag);

      steps.push({
        id: stepId++,
        type: 'union',
        description: `Apply UNION: new start ${qStart} branches to ${frag1.start} and ${frag2.start}; both converge at new accept ${qAccept}`,
        newStates: [sStart, sAccept],
        newTransitions: [t1, t2, t3, t4],
        highlightedStates: [qStart, qAccept, frag1.start, frag2.start, frag1.accept, frag2.accept],
        highlightedTransitions: [
          `${qStart}-ε-${frag1.start}`,
          `${qStart}-ε-${frag2.start}`,
          `${frag1.accept}-ε-${qAccept}`,
          `${frag2.accept}-ε-${qAccept}`,
        ],
        nfaSnapshot: snapshotNFA(newFrag),
        fragmentStart: qStart,
        fragmentAccept: qAccept,
      });
    } else if (token.type === 'STAR') {
      // Pop one fragment, add new start/accept
      if (stack.length < 1) throw new Error('Not enough operands for Kleene star.');
      const frag = stack.pop()!;

      const qStart = freshState();
      const qAccept = freshState();

      const sStart = makeState(qStart, false, false);
      const sAccept = makeState(qAccept, false, false);

      const t1 = makeTransition(qStart, frag.start, 'ε');
      const t2 = makeTransition(qStart, qAccept, 'ε');   // zero occurrences
      const t3 = makeTransition(frag.accept, frag.start, 'ε'); // loop back
      const t4 = makeTransition(frag.accept, qAccept, 'ε');

      const newFrag: NFAFragment = {
        start: qStart,
        accept: qAccept,
        states: [sStart, sAccept, ...frag.states],
        transitions: [...frag.transitions, t1, t2, t3, t4],
      };

      addStates([sStart, sAccept]);
      addTransitions([t1, t2, t3, t4]);
      stack.push(newFrag);

      steps.push({
        id: stepId++,
        type: 'star',
        description: `Apply KLEENE STAR (*): new start ${qStart}, new accept ${qAccept}, loop ${frag.accept} --ε→ ${frag.start}`,
        newStates: [sStart, sAccept],
        newTransitions: [t1, t2, t3, t4],
        highlightedStates: [qStart, qAccept, frag.start, frag.accept],
        highlightedTransitions: [
          `${qStart}-ε-${frag.start}`,
          `${qStart}-ε-${qAccept}`,
          `${frag.accept}-ε-${frag.start}`,
          `${frag.accept}-ε-${qAccept}`,
        ],
        nfaSnapshot: snapshotNFA(newFrag),
        fragmentStart: qStart,
        fragmentAccept: qAccept,
      });
    } else if (token.type === 'PLUS') {
      // One or more: same as STAR but without the skip epsilon (qStart -> qAccept)
      if (stack.length < 1) throw new Error('Not enough operands for plus.');
      const frag = stack.pop()!;

      const qStart = freshState();
      const qAccept = freshState();

      const sStart = makeState(qStart, false, false);
      const sAccept = makeState(qAccept, false, false);

      const t1 = makeTransition(qStart, frag.start, 'ε');
      const t2 = makeTransition(frag.accept, frag.start, 'ε'); // loop
      const t3 = makeTransition(frag.accept, qAccept, 'ε');

      const newFrag: NFAFragment = {
        start: qStart,
        accept: qAccept,
        states: [sStart, sAccept, ...frag.states],
        transitions: [...frag.transitions, t1, t2, t3],
      };

      addStates([sStart, sAccept]);
      addTransitions([t1, t2, t3]);
      stack.push(newFrag);

      steps.push({
        id: stepId++,
        type: 'plus',
        description: `Apply PLUS (+, one or more): ${qStart} --ε→ ${frag.start}, loop ${frag.accept} --ε→ ${frag.start}`,
        newStates: [sStart, sAccept],
        newTransitions: [t1, t2, t3],
        highlightedStates: [qStart, qAccept, frag.start, frag.accept],
        highlightedTransitions: [
          `${qStart}-ε-${frag.start}`,
          `${frag.accept}-ε-${frag.start}`,
          `${frag.accept}-ε-${qAccept}`,
        ],
        nfaSnapshot: snapshotNFA(newFrag),
        fragmentStart: qStart,
        fragmentAccept: qAccept,
      });
    } else if (token.type === 'OPTIONAL') {
      // Zero or one: same as epsilon or frag
      if (stack.length < 1) throw new Error('Not enough operands for optional.');
      const frag = stack.pop()!;

      const qStart = freshState();
      const qAccept = freshState();

      const sStart = makeState(qStart, false, false);
      const sAccept = makeState(qAccept, false, false);

      const t1 = makeTransition(qStart, frag.start, 'ε');
      const t2 = makeTransition(qStart, qAccept, 'ε');   // skip entirely
      const t3 = makeTransition(frag.accept, qAccept, 'ε');

      const newFrag: NFAFragment = {
        start: qStart,
        accept: qAccept,
        states: [sStart, sAccept, ...frag.states],
        transitions: [...frag.transitions, t1, t2, t3],
      };

      addStates([sStart, sAccept]);
      addTransitions([t1, t2, t3]);
      stack.push(newFrag);

      steps.push({
        id: stepId++,
        type: 'optional',
        description: `Apply OPTIONAL (?, zero or one): ${qStart} can skip to ${qAccept} directly`,
        newStates: [sStart, sAccept],
        newTransitions: [t1, t2, t3],
        highlightedStates: [qStart, qAccept, frag.start, frag.accept],
        highlightedTransitions: [
          `${qStart}-ε-${frag.start}`,
          `${qStart}-ε-${qAccept}`,
          `${frag.accept}-ε-${qAccept}`,
        ],
        nfaSnapshot: snapshotNFA(newFrag),
        fragmentStart: qStart,
        fragmentAccept: qAccept,
      });
    }
  }

  if (stack.length !== 1) {
    throw new Error('Invalid regex: unexpected stack state after construction.');
  }

  const finalFrag = stack[0];

  // Canonical DFS renumbering:
  // Numbers states so that start state is ALWAYS q0,
  // upper branches are traversed before lower branches,
  // and the accept state is always the final qN.
  const idMap = new Map<string, string>();
  const visited = new Set<string>();
  const orderedIds: string[] = [];

  const startId = finalFrag.start;
  const acceptId = finalFrag.accept;

  function dfs(curr: string) {
    if (visited.has(curr)) return;
    visited.add(curr);
    orderedIds.push(curr);

    const outgoing = allTransitions.filter(t => t.from === curr && t.to !== curr);
    for (const t of outgoing) {
      if (t.to !== acceptId && !visited.has(t.to)) {
        dfs(t.to);
      }
    }
  }

  dfs(startId);

  // Add any unreached states
  for (const s of allStates) {
    if (s.id !== acceptId && !visited.has(s.id)) {
      dfs(s.id);
    }
  }

  // Accept state is always last
  if (acceptId && !visited.has(acceptId)) {
    visited.add(acceptId);
    orderedIds.push(acceptId);
  }

  // Map to q0, q1, ...
  orderedIds.forEach((oldId, index) => {
    idMap.set(oldId, `q${index}`);
  });

  function getCanonicalOldId(id: string): string {
    let curr = id;
    while (mergedInto.has(curr)) {
      curr = mergedInto.get(curr)!;
    }
    return curr;
  }

  function mapId(oldId: string): string {
    const canonical = getCanonicalOldId(oldId);
    return idMap.get(canonical) ?? (idMap.get(oldId) ?? oldId);
  }

  function mapState(s: State, isStartOverride?: boolean, isAcceptOverride?: boolean): State {
    const newId = mapId(s.id);
    return {
      id: newId,
      isStart: isStartOverride !== undefined ? isStartOverride : newId === mapId(finalFrag.start),
      isAccept: isAcceptOverride !== undefined ? isAcceptOverride : newId === mapId(finalFrag.accept),
    };
  }

  function mapTransition(t: Transition): Transition {
    return {
      from: mapId(t.from),
      to: mapId(t.to),
      symbol: t.symbol,
    };
  }

  function mapDescription(desc: string): string {
    return desc.replace(/\bq\d+\b/g, match => mapId(match));
  }

  // Renumber construction steps
  const renumberedSteps: ConstructionStep[] = steps.map(step => {
    const fragStartMapped = step.fragmentStart ? mapId(step.fragmentStart) : '';
    const fragAcceptMapped = step.fragmentAccept ? mapId(step.fragmentAccept) : '';

    const stepSnapshot: NFA = {
      states: step.nfaSnapshot.states
        .map(s => {
          const mappedId = mapId(s.id);
          return {
            id: mappedId,
            isStart: mappedId === fragStartMapped,
            isAccept: mappedId === fragAcceptMapped,
          };
        })
        .filter((s, idx, arr) => arr.findIndex(x => x.id === s.id) === idx),
      transitions: step.nfaSnapshot.transitions.map(mapTransition),
      startState: fragStartMapped,
      acceptStates: fragAcceptMapped ? [fragAcceptMapped] : [],
      alphabet: [...new Set(step.nfaSnapshot.transitions.filter(t => t.symbol !== 'ε').map(t => t.symbol))].sort(),
    };

    return {
      ...step,
      description: mapDescription(step.description),
      newStates: step.newStates.map(s => mapState(s)),
      newTransitions: step.newTransitions.map(mapTransition),
      highlightedStates: step.highlightedStates.map(mapId),
      highlightedTransitions: step.highlightedTransitions.map(tKey => {
        const parts = tKey.split('-');
        if (parts.length >= 3) {
          const from = mapId(parts[0]);
          const sym = parts.slice(1, parts.length - 1).join('-');
          const to = mapId(parts[parts.length - 1]);
          return `${from}-${sym}-${to}`;
        }
        return tKey;
      }),
      nfaSnapshot: stepSnapshot,
      fragmentStart: fragStartMapped,
      fragmentAccept: fragAcceptMapped,
    };
  });

  const finalStates: State[] = orderedIds.map(oldId => ({
    id: mapId(oldId),
    isStart: mapId(oldId) === mapId(finalFrag.start),
    isAccept: mapId(oldId) === mapId(finalFrag.accept),
  }));

  const renumberedTransitions = allTransitions.map(mapTransition);

  const nfa: NFA = {
    states: finalStates,
    transitions: renumberedTransitions,
    startState: mapId(finalFrag.start),
    acceptStates: [mapId(finalFrag.accept)],
    alphabet: [...new Set(renumberedTransitions.filter(t => t.symbol !== 'ε').map(t => t.symbol))].sort(),
  };

  return { nfa, steps: renumberedSteps };
}
