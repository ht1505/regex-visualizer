// DFA Minimization using Hopcroft's Algorithm (Table-filling / Partition Refinement)

import { DFA, DFAState, DFATransition } from '../types/automata';

/**
 * Minimize a DFA using partition refinement (Hopcroft's algorithm).
 * 1. Prunes unreachable states from the start state.
 * 2. Partitions into accepting and non-accepting states.
 * 3. Iteratively refines until a fixed point is reached.
 * 4. Orders the start state group first with standard labels A, B, C...
 */
export function minimizeDFA(dfa: DFA): DFA {
  if (dfa.states.length === 0) return dfa;

  const alphabet = dfa.alphabet;

  // 1. Prune unreachable states from start state
  const reachable = new Set<string>();
  const reachStack = [dfa.startState];
  while (reachStack.length > 0) {
    const curr = reachStack.pop()!;
    if (!reachable.has(curr)) {
      reachable.add(curr);
      for (const t of dfa.transitions) {
        if (t.from === curr && !reachable.has(t.to)) {
          reachStack.push(t.to);
        }
      }
    }
  }

  const reachableStates = dfa.states.filter(s => reachable.has(s.id));
  const acceptSet = new Set(dfa.acceptStates);

  // 2. Initial partition: accepting vs non-accepting
  const accepting = new Set(reachableStates.filter(s => acceptSet.has(s.id)).map(s => s.id));
  const nonAccepting = new Set(reachableStates.filter(s => !acceptSet.has(s.id)).map(s => s.id));

  let partition: Set<string>[] = [];
  if (accepting.size > 0) partition.push(accepting);
  if (nonAccepting.size > 0) partition.push(nonAccepting);

  // Build transition lookup: from -> symbol -> to
  const transMap = new Map<string, Map<string, string>>();
  for (const t of dfa.transitions) {
    if (!reachable.has(t.from) || !reachable.has(t.to)) continue;
    if (!transMap.has(t.from)) transMap.set(t.from, new Map());
    transMap.get(t.from)!.set(t.symbol, t.to);
  }

  function groupOf(stateId: string, currentPartition: Set<string>[]): number {
    return currentPartition.findIndex(g => g.has(stateId));
  }

  // 3. Iteratively refine partition
  let changed = true;
  while (changed) {
    changed = false;
    const newPartition: Set<string>[] = [];

    for (const group of partition) {
      if (group.size <= 1) {
        newPartition.push(group);
        continue;
      }

      const stateArray = [...group];
      const subGroups = new Map<string, Set<string>>();

      for (const state of stateArray) {
        const sig = alphabet
          .map(sym => {
            const target = transMap.get(state)?.get(sym);
            if (target === undefined) return '-1';
            return String(groupOf(target, partition));
          })
          .join(',');

        if (!subGroups.has(sig)) subGroups.set(sig, new Set());
        subGroups.get(sig)!.add(state);
      }

      if (subGroups.size > 1) changed = true;
      for (const subGroup of subGroups.values()) {
        newPartition.push(subGroup);
      }
    }

    partition = newPartition;
  }

  // 4. Ensure start state group is at index 0
  const startIdx = partition.findIndex(g => g.has(dfa.startState));
  if (startIdx > 0) {
    const [startGroup] = partition.splice(startIdx, 1);
    partition.unshift(startGroup);
  }

  // Ensure DEAD group (if any) is placed at the end
  const deadIdx = partition.findIndex(g =>
    [...g].some(s => s === 'dfa_dead' || dfa.states.find(st => st.id === s)?.label === 'DEAD'),
  );
  if (deadIdx >= 0 && deadIdx !== partition.length - 1 && deadIdx !== 0) {
    const [deadGroup] = partition.splice(deadIdx, 1);
    partition.push(deadGroup);
  }

  // 5. Build minimized DFA states
  let normalLabelIdx = 0;
  const minStates: DFAState[] = partition.map((group, idx) => {
    const isStart = idx === 0;
    const isAccept = [...group].some(s => acceptSet.has(s));
    const hasDead = [...group].some(stateId => {
      const s = dfa.states.find(st => st.id === stateId);
      return s?.id === 'dfa_dead' || s?.label === 'DEAD';
    });

    const label = hasDead ? 'DEAD' : `q${normalLabelIdx++}`;

    const nfaStates = [...group].flatMap(stateId => {
      const ds = dfa.states.find(s => s.id === stateId);
      return ds ? ds.nfaStates : [];
    });

    return {
      id: hasDead ? 'dfa_dead' : `min_${label}`,
      nfaStates: [...new Set(nfaStates)],
      isStart,
      isAccept,
      label,
    };
  });

  // 6. Build minimized transitions
  function minStateOf(stateId: string): string {
    const groupIdx = partition.findIndex(g => g.has(stateId));
    return minStates[groupIdx]?.id ?? '';
  }

  const minTransitions: DFATransition[] = [];
  const seenTrans = new Set<string>();

  for (const t of dfa.transitions) {
    if (!reachable.has(t.from) || !reachable.has(t.to)) continue;
    const fromMin = minStateOf(t.from);
    const toMin = minStateOf(t.to);
    const key = `${fromMin}-${t.symbol}-${toMin}`;
    if (!seenTrans.has(key)) {
      seenTrans.add(key);
      minTransitions.push({ from: fromMin, to: toMin, symbol: t.symbol });
    }
  }

  const minStartState = minStateOf(dfa.startState);
  const minAcceptStates = minStates.filter(s => s.isAccept).map(s => s.id);

  return {
    states: minStates,
    transitions: minTransitions,
    startState: minStartState,
    acceptStates: minAcceptStates,
    alphabet,
  };
}
