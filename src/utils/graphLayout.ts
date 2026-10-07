// Graph Layout and Edge Routing utility for Automata (NFA & DFA)
// NFA: Thompson-construction-aware semantic layout (longest-path ranking,
//      branch separation for union alternatives, back-edge detection for star loops).
// DFA: Semantic layered layout with BFS progression, DAG forward longest-path ranking,
//      barycenter edge-crossing reduction, dedicated DEAD-state positioning, and clearance guarantees.
// Edge Routing: Geometric obstacle-aware routing with circle perimeter docking,
//      compact local self-loops, symmetrical bidirectional separation,
//      crisp straight forward edges, and smooth nested concentric return arcs with ZERO crossings.

import { NFA, DFA, DFAState } from '../types/automata';

export interface NodePosition {
  id: string;
  x: number;
  y: number;
}

export const NODE_SIZE = 74;
const R = NODE_SIZE / 2; // radius = 37

const NFA_H = 165; // horizontal spacing between NFA layers
const NFA_V = 150; // vertical spacing between NFA branch states

// ==========================================================================
// NFA LAYOUT — Thompson-construction-aware semantic positioning
// ==========================================================================
export function layoutNFA(nfa: NFA): NodePosition[] {
  if (nfa.states.length === 0) return [];
  if (nfa.states.length === 1) return [{ id: nfa.states[0].id, x: 60, y: 0 }];

  const stateSet = new Set(nfa.states.map(s => s.id));

  // Adjacency
  const adj = new Map<string, string[]>();
  for (const s of nfa.states) adj.set(s.id, []);
  for (const t of nfa.transitions) {
    if (t.from !== t.to && stateSet.has(t.from) && stateSet.has(t.to)) {
      adj.get(t.from)!.push(t.to);
    }
  }

  // Back-edge detection (DFS coloring)
  const color = new Map<string, number>();
  const backEdges = new Set<string>();

  function dfs(u: string) {
    color.set(u, 1); // visiting
    for (const v of adj.get(u) || []) {
      if (color.get(v) === 1) backEdges.add(`${u}->${v}`);
      else if (!color.has(v) || color.get(v) === 0) dfs(v);
    }
    color.set(u, 2); // done
  }
  dfs(nfa.startState);
  for (const s of nfa.states) {
    if (!color.has(s.id)) dfs(s.id);
  }

  // Forward-only edges for ranking
  const fwdEdges = nfa.transitions.filter(
    t =>
      t.from !== t.to &&
      !backEdges.has(`${t.from}->${t.to}`) &&
      stateSet.has(t.from) &&
      stateSet.has(t.to),
  );

  // Longest-path rank (Bellman-Ford on DAG)
  const rank = new Map<string, number>();
  for (const s of nfa.states) rank.set(s.id, 0);

  for (let i = 0; i < nfa.states.length; i++) {
    let changed = false;
    for (const t of fwdEdges) {
      const r = (rank.get(t.from) ?? 0) + 1;
      if (r > (rank.get(t.to) ?? 0)) {
        rank.set(t.to, r);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Group into layers
  const layers = new Map<number, string[]>();
  for (const s of nfa.states) {
    const r = rank.get(s.id) ?? 0;
    if (!layers.has(r)) layers.set(r, []);
    layers.get(r)!.push(s.id);
  }

  const sortedRanks = [...layers.keys()].sort((a, b) => a - b);

  // Assign positions
  const positions: NodePosition[] = [];
  const assignedY = new Map<string, number>();

  for (const r of sortedRanks) {
    const ids = layers.get(r)!;
    const x = 60 + r * NFA_H;

    // Sort by average predecessor Y to keep branches separated & uncrossed
    ids.sort((a, b) => {
      const yA = nfa.transitions
        .filter(t => t.to === a && assignedY.has(t.from))
        .map(t => assignedY.get(t.from)!);
      const yB = nfa.transitions
        .filter(t => t.to === b && assignedY.has(t.from))
        .map(t => assignedY.get(t.from)!);
      const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
      return avg(yA) - avg(yB);
    });

    const totalH = (ids.length - 1) * NFA_V;
    const startY = -totalH / 2;

    ids.forEach((id, idx) => {
      const y = startY + idx * NFA_V;
      assignedY.set(id, y);
      positions.push({ id, x, y });
    });
  }

  return positions;
}

// ==========================================================================
// DFA LAYOUT — Deterministic semantic layered layout with dedicated DEAD-state
// ==========================================================================
export function layoutDFA(dfa: DFA): NodePosition[] {
  if (dfa.states.length === 0) return [];
  if (dfa.states.length === 1) return [{ id: dfa.states[0].id, x: 70, y: 0 }];

  // 1. Separate DEAD state if present (sink/trap state with self-loops)
  const deadState = dfa.states.find(s => s.id === 'dfa_dead' || s.label === 'DEAD');
  const regularStates = dfa.states.filter(s => s !== deadState);

  if (regularStates.length === 0) {
    return dfa.states.map((s, idx) => ({ id: s.id, x: 70 + idx * 210, y: 0 }));
  }

  // 2. Identify start state (always anchored at Layer 0)
  const startStateId = dfa.startState || regularStates[0]?.id || dfa.states[0].id;

  // 3. Adjacency of regular states (excluding self-loops)
  const regIdSet = new Set(regularStates.map(s => s.id));
  const regAdj = new Map<string, string[]>();
  for (const s of regularStates) regAdj.set(s.id, []);

  for (const t of dfa.transitions) {
    if (t.from !== t.to && regIdSet.has(t.from) && regIdSet.has(t.to)) {
      if (!regAdj.get(t.from)!.includes(t.to)) {
        regAdj.get(t.from)!.push(t.to);
      }
    }
  }

  // 4. Reachability matrix (transitive closure) for regular states
  const canReach = new Map<string, Set<string>>();
  for (const s of regularStates) {
    const reachable = new Set<string>();
    const q = [s.id];
    while (q.length > 0) {
      const curr = q.shift()!;
      for (const next of regAdj.get(curr) || []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          q.push(next);
        }
      }
    }
    canReach.set(s.id, reachable);
  }

  // 5. Compute distance to nearest accept state for all regular states (reverse BFS)
  const distToAccept = new Map<string, number>();
  const acceptSet = new Set(dfa.acceptStates.filter(id => regIdSet.has(id)));
  const revAdj = new Map<string, string[]>();
  for (const s of regularStates) revAdj.set(s.id, []);
  for (const [from, toList] of regAdj.entries()) {
    for (const to of toList) {
      revAdj.get(to)!.push(from);
    }
  }

  const acceptQueue: string[] = [];
  for (const acc of acceptSet) {
    distToAccept.set(acc, 0);
    acceptQueue.push(acc);
  }
  while (acceptQueue.length > 0) {
    const curr = acceptQueue.shift()!;
    const curDist = distToAccept.get(curr)!;
    for (const pred of revAdj.get(curr) || []) {
      if (!distToAccept.has(pred)) {
        distToAccept.set(pred, curDist + 1);
        acceptQueue.push(pred);
      }
    }
  }

  // 6. DFS cycle-breaking from startStateId to identify forward spine edges vs return back-edges
  const color = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
  const backEdges = new Set<string>();

  function getSortedTargets(u: string): string[] {
    const targets = regAdj.get(u) || [];
    return [...targets].sort((a, b) => {
      // If a can reach b and b cannot reach a, a must be visited before b (a precedes b in forward flow)
      const aCanReachB = canReach.get(a)?.has(b) ?? false;
      const bCanReachA = canReach.get(b)?.has(a) ?? false;
      if (aCanReachB && !bCanReachA) return -1;
      if (!aCanReachB && bCanReachA) return 1;

      // Prioritize the state that has a longer forward path to accept
      const dA = distToAccept.get(a) ?? 999;
      const dB = distToAccept.get(b) ?? 999;
      if (dA !== dB) return dB - dA;

      return a.localeCompare(b);
    });
  }

  function dfs(u: string) {
    color.set(u, 1);
    for (const v of getSortedTargets(u)) {
      if (color.get(v) === 1) {
        // Target is an active ancestor on current call path -> back-edge (return loop)
        backEdges.add(`${u}->${v}`);
      } else if (!color.has(v) || color.get(v) === 0) {
        dfs(v);
      }
    }
    color.set(u, 2);
  }

  dfs(startStateId);
  for (const s of regularStates) {
    if (!color.has(s.id) || color.get(s.id) === 0) dfs(s.id);
  }

  // Forward edges = all non-self-loop transitions not in backEdges
  const forwardEdges = dfa.transitions.filter(
    t => t.from !== t.to &&
         !backEdges.has(`${t.from}->${t.to}`) &&
         regIdSet.has(t.from) &&
         regIdSet.has(t.to),
  );

  // Compute Longest-Path Rank on Forward DAG (Bellman-Ford)
  const rank = new Map<string, number>();
  for (const s of regularStates) rank.set(s.id, 0);

  for (let iter = 0; iter < regularStates.length; iter++) {
    let changed = false;
    for (const e of forwardEdges) {
      const req = (rank.get(e.from) ?? 0) + 1;
      if (req > (rank.get(e.to) ?? 0)) {
        rank.set(e.to, req);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Compact layer numbers to consecutive integers 0, 1, 2, ...
  const uniqueLayers = Array.from(new Set(rank.values())).sort((a, b) => a - b);
  const layerRankMap = new Map<number, number>();
  uniqueLayers.forEach((l, idx) => layerRankMap.set(l, idx));
  const layers = new Map<string, number>();
  for (const s of regularStates) {
    layers.set(s.id, layerRankMap.get(rank.get(s.id)!) ?? 0);
  }

  // Group regular states into layers
  const layerGroups = new Map<number, DFAState[]>();
  for (const s of regularStates) {
    const l = layers.get(s.id) ?? 0;
    if (!layerGroups.has(l)) layerGroups.set(l, []);
    layerGroups.get(l)!.push(s);
  }

  // 7. Assign (X, Y) Coordinates
  const H_SPACING = 220; // generous horizontal spacing for transitions & labels
  const V_SPACING = 195; // generous vertical spacing between nodes (prevents vertical label and edge collisions)
  const positions: NodePosition[] = [];
  const assignedY = new Map<string, number>();

  const sortedLayerIndices = Array.from(layerGroups.keys()).sort((a, b) => a - b);

  for (const l of sortedLayerIndices) {
    const statesInLayer = layerGroups.get(l)!;
    const x = 70 + l * H_SPACING;

    if (statesInLayer.length === 1) {
      const s = statesInLayer[0];
      const y = 0;
      assignedY.set(s.id, y);
      positions.push({ id: s.id, x, y });
    } else {
      // Sort states vertically within layer by predecessor barycenter to minimize edge crossings
      statesInLayer.sort((a, b) => {
        const getBary = (st: DFAState) => {
          const preds = dfa.transitions
            .filter(t => t.to === st.id && t.from !== st.id && assignedY.has(t.from))
            .map(t => assignedY.get(t.from)!);
          if (preds.length > 0) {
            return preds.reduce((acc, v) => acc + v, 0) / preds.length;
          }
          return 0;
        };

        const baryA = getBary(a);
        const baryB = getBary(b);
        if (Math.abs(baryA - baryB) > 5) {
          return baryA - baryB;
        }
        // Stable deterministic tie-breakers: start first, accept last, then label
        if (a.isStart !== b.isStart) return a.isStart ? -1 : 1;
        if (a.isAccept !== b.isAccept) return a.isAccept ? 1 : -1;
        return a.label.localeCompare(b.label);
      });

      const totalH = (statesInLayer.length - 1) * V_SPACING;
      const startY = -totalH / 2;

      statesInLayer.forEach((s, idx) => {
        const y = startY + idx * V_SPACING;
        assignedY.set(s.id, y);
        positions.push({ id: s.id, x, y });
      });
    }
  }

  // 8. Position DEAD state safely to the right / bottom of the regular flow
  if (deadState) {
    const maxX = Math.max(...positions.map(p => p.x));
    const maxY = Math.max(...positions.map(p => p.y));

    // Count backward return edges
    const backEdgeCount = dfa.transitions.filter(t => {
      const f = positions.find(p => p.id === t.from);
      const to = positions.find(p => p.id === t.to);
      return f && to && to.x < f.x - 25;
    }).length;

    // Place DEAD state with dedicated clearance
    const deadX = maxX + 40;
    const deadY = maxY + 150 + Math.min(backEdgeCount, 4) * 45;

    positions.push({
      id: deadState.id,
      x: deadX,
      y: deadY,
    });
  }

  // 9. Overlap & clearance validation pass
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const p1 = positions[i];
      const p2 = positions[j];
      const dx = Math.abs(p1.x - p2.x);
      const dy = Math.abs(p1.y - p2.y);
      if (dx < NODE_SIZE + 20 && dy < NODE_SIZE + 20) {
        if (p2.y >= p1.y) {
          p2.y += NODE_SIZE + 25;
        } else {
          p1.y += NODE_SIZE + 25;
        }
      }
    }
  }

  return positions;
}

// ==========================================================================
// EDGE ROUTING — Clean, textbook-grade automata edge routing (Zero Crossings)
// ==========================================================================

export interface EdgeRouteResult {
  path: string;
  labelX: number;
  labelY: number;
}

export interface EdgeInput {
  id: string;
  source: string;
  target: string;
  symbols?: string[];
  curveOffset?: number;
}

export type CurveType = 'line' | 'quad' | 'cubic';

export interface CurveDefinition {
  type: CurveType;
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2?: { x: number; y: number };
  p3?: { x: number; y: number };
  pathString: string;
}

export interface CurveEvaluation {
  x: number;
  y: number;
  tangentX: number;
  tangentY: number;
  normalX: number;
  normalY: number;
}

/**
 * Mathematically evaluates a point, tangent vector, and unit normal vector
 * at parameter t ∈ [0, 1] on any parametric line, quadratic, or cubic Bézier curve.
 */
export function evaluateCurve(curve: CurveDefinition, t: number): CurveEvaluation {
  let x = 0;
  let y = 0;
  let tx = 0;
  let ty = 0;

  if (curve.type === 'line') {
    const { p0, p1 } = curve;
    x = (1 - t) * p0.x + t * p1.x;
    y = (1 - t) * p0.y + t * p1.y;
    tx = p1.x - p0.x;
    ty = p1.y - p0.y;
  } else if (curve.type === 'quad') {
    const { p0, p1, p2 } = curve;
    const p2Def = p2 ?? p1;
    const mt = 1 - t;
    x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2Def.x;
    y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2Def.y;
    tx = 2 * mt * (p1.x - p0.x) + 2 * t * (p2Def.x - p1.x);
    ty = 2 * mt * (p1.y - p0.y) + 2 * t * (p2Def.y - p1.y);
  } else {
    const { p0, p1, p2, p3 } = curve;
    const p2Def = p2 ?? p1;
    const p3Def = p3 ?? p2Def;
    const mt = 1 - t;
    x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2Def.x + t * t * t * p3Def.x;
    y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2Def.y + t * t * t * p3Def.y;
    tx = 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2Def.x - p1.x) + 3 * t * t * (p3Def.x - p2Def.x);
    ty = 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2Def.y - p1.y) + 3 * t * t * (p3Def.y - p2Def.y);
  }

  const len = Math.hypot(tx, ty) || 1;
  const utx = tx / len;
  const uty = ty / len;
  // Perpendicular unit normal: (-uty, utx)
  const unx = -uty;
  const uny = utx;

  return {
    x,
    y,
    tangentX: utx,
    tangentY: uty,
    normalX: unx,
    normalY: uny,
  };
}

interface EdgeIntermediate {
  id: string;
  label: string;
  curve: CurveDefinition;
  isSelfLoop: boolean;
  getOutwardNormal: (t: number) => { nx: number; ny: number };
}

/**
 * Computes collision-free, aesthetically routed SVG paths for every edge.
 * - Self-loops: compact, vertical teardrop loops with label bound to the loop crest.
 * - Forward direct transitions: crisp straight lines with label sitting directly above the line.
 * - Return loops / back-edges: smooth nested concentric elliptical arcs underneath with label at the apex.
 * - Forward skip edges: fly over the top bypass corridor with guaranteed clearance.
 * - Bidirectional transitions: symmetrical quadratic curves with labels on respective outer sides.
 * - Label positioning: strictly evaluated from the curve's actual parametric geometry, collision-checked.
 */
export function computeAutomataEdgeRoutes(
  positions: NodePosition[],
  edges: EdgeInput[],
): Map<string, EdgeRouteResult> {
  const result = new Map<string, EdgeRouteResult>();
  const nodeMap = new Map(positions.map(p => [p.id, { ...p, cx: p.x + R, cy: p.y + R }]));

  // 1. Detect bidirectional pairs
  const edgeDirSet = new Set(edges.map(e => `${e.source}|||${e.target}`));
  const isBidir = (e: EdgeInput) =>
    e.source !== e.target &&
    edgeDirSet.has(`${e.target}|||${e.source}`);

  // Self-loop direction analysis for every node
  const statesWithSelfLoops = new Set(
    edges.filter(e => e.source === e.target).map(e => e.source),
  );

  const statesWithTopSelfLoops = new Set<string>();
  const statesWithBottomSelfLoops = new Set<string>();

  for (const p of positions) {
    if (!statesWithSelfLoops.has(p.id)) continue;
    const hasNodeAbove = positions.some(
      other => other.id !== p.id && Math.abs(other.x - p.x) < 70 && other.y < p.y - 10,
    );
    const hasNodeBelow = positions.some(
      other => other.id !== p.id && Math.abs(other.x - p.x) < 70 && other.y > p.y + 10,
    );
    const loopOnBottom = p.id === 'dfa_dead' || hasNodeAbove || (p.y > 20 && !hasNodeBelow);
    if (loopOnBottom) {
      statesWithBottomSelfLoops.add(p.id);
    } else {
      statesWithTopSelfLoops.add(p.id);
    }
  }

  // Helper to measure distance from a point to a line segment
  function pointDistToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  // 2. Classify underneath return loops vs top bypass edges with obstacle detection
  const underneathEdges: Array<{ id: string; span: number; lane: number }> = [];
  const topBypassEdges: Array<{ id: string; minX: number; maxX: number; lane: number }> = [];

  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    if (edge.target === 'dfa_dead' || edge.source === 'dfa_dead') continue;
    if (isBidir(edge)) continue; // bidirectional pairs use symmetrical quadratic curves

    const u = nodeMap.get(edge.source);
    const v = nodeMap.get(edge.target);
    if (!u || !v) continue;

    const spanMinX = Math.min(u.cx, v.cx);
    const spanMaxX = Math.max(u.cx, v.cx);
    const nodesInSpan = positions.filter(
      p => p.id !== edge.source && p.id !== edge.target && p.id !== 'dfa_dead' &&
           p.x + R > spanMinX + 15 && p.x + R < spanMaxX - 15,
    );

    const isBackward = v.cx < u.cx - 20;

    if (isBackward) {
      // Underneath return loop (must clear below all nodes in span)
      underneathEdges.push({ id: edge.id, span: u.cx - v.cx, lane: 0 });
    } else if (v.cx > u.cx + 20) {
      // Only bypass if the direct straight line between u and v is obstructed by an intermediate node
      const isObstructed = nodesInSpan.some(p => {
        const pcx = p.x + R;
        const pcy = p.y + R;
        return pointDistToSegment(pcx, pcy, u.cx, u.cy, v.cx, v.cy) < R + 22;
      });

      if (isObstructed) {
        topBypassEdges.push({ id: edge.id, minX: u.cx, maxX: v.cx, lane: 0 });
      }
    }
  }

  // Sort underneath return edges strictly by span: shorter spans get inner arcs, longer spans get outer arcs
  underneathEdges.sort((a, b) => a.span - b.span);
  underneathEdges.forEach((e, idx) => {
    e.lane = idx;
  });
  const underneathLaneMap = new Map(underneathEdges.map(e => [e.id, e.lane]));

  // Allocate distinct lanes for top bypass arches
  topBypassEdges.sort((a, b) => (b.maxX - b.minX) - (a.maxX - a.minX));
  for (let i = 0; i < topBypassEdges.length; i++) {
    for (let j = 0; j < i; j++) {
      if (topBypassEdges[i].minX < topBypassEdges[j].maxX && topBypassEdges[i].maxX > topBypassEdges[j].minX) {
        topBypassEdges[i].lane = Math.max(topBypassEdges[i].lane, topBypassEdges[j].lane + 1);
      }
    }
  }
  const topLaneMap = new Map(topBypassEdges.map(e => [e.id, e.lane]));

  // Build intermediate curves for all edges
  const intermediateList: EdgeIntermediate[] = [];

  for (const edge of edges) {
    const u = nodeMap.get(edge.source);
    const v = nodeMap.get(edge.target);
    if (!u || !v) continue;

    const label = (edge.symbols && edge.symbols.length > 0) ? edge.symbols.join(', ') : '';

    // ── 1. SELF-LOOP (Orientation-aware: symmetrical loop matching textbook style) ──
    if (edge.source === edge.target) {
      const loopOnBottom = statesWithBottomSelfLoops.has(edge.source);
      const loopH = 44;

      if (loopOnBottom) {
        const p0 = { x: u.cx - 14, y: u.cy + 34 };
        const p1 = { x: u.cx - 28, y: u.cy + R + loopH };
        const p2 = { x: u.cx + 28, y: u.cy + R + loopH };
        const p3 = { x: u.cx + 14, y: u.cy + 34 };
        const pathString = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
        intermediateList.push({
          id: edge.id,
          label,
          curve: { type: 'cubic', p0, p1, p2, p3, pathString },
          isSelfLoop: true,
          getOutwardNormal: () => ({ nx: 0, ny: 1 }),
        });
      } else {
        const p0 = { x: u.cx - 14, y: u.cy - 34 };
        const p1 = { x: u.cx - 28, y: u.cy - R - loopH };
        const p2 = { x: u.cx + 28, y: u.cy - R - loopH };
        const p3 = { x: u.cx + 14, y: u.cy - 34 };
        const pathString = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
        intermediateList.push({
          id: edge.id,
          label,
          curve: { type: 'cubic', p0, p1, p2, p3, pathString },
          isSelfLoop: true,
          getOutwardNormal: () => ({ nx: 0, ny: -1 }),
        });
      }
      continue;
    }

    // ── 2. TRANSITIONS TO DEAD STATE (Flow downward along dedicated corridor) ──
    if (edge.target === 'dfa_dead' && edge.source !== 'dfa_dead') {
      const midY = (u.cy + R + v.cy - R) / 2;
      const p0 = { x: u.cx, y: u.cy + R };
      const p1 = { x: u.cx, y: midY };
      const p2 = { x: v.cx, y: midY };
      const p3 = { x: v.cx, y: v.cy - R };
      const pathString = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
      intermediateList.push({
        id: edge.id,
        label,
        curve: { type: 'cubic', p0, p1, p2, p3, pathString },
        isSelfLoop: false,
        getOutwardNormal: (t: number) => {
          const ev = evaluateCurve({ type: 'cubic', p0, p1, p2, p3, pathString }, t);
          return { nx: ev.normalX, ny: ev.normalY };
        },
      });
      continue;
    }

    // ── 3. BIDIRECTIONAL PAIR (Symmetrical opposite curvature with generous clearance) ──
    if (isBidir(edge)) {
      const dx = v.cx - u.cx;
      const dy = v.cy - u.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = -dy / dist;
      const ny = dx / dist;

      const isSteep = Math.abs(dx) < 40;
      const offset = isSteep ? 52 : 30;

      const mx = (u.cx + v.cx) / 2 + nx * offset;
      const my = (u.cy + v.cy) / 2 + ny * offset;

      const d1x = mx - u.cx;
      const d1y = my - u.cy;
      const len1 = Math.hypot(d1x, d1y) || 1;
      const p0 = { x: u.cx + R * (d1x / len1), y: u.cy + R * (d1y / len1) };

      const d2x = v.cx - mx;
      const d2y = v.cy - my;
      const len2 = Math.hypot(d2x, d2y) || 1;
      const p2 = { x: v.cx - R * (d2x / len2), y: v.cy - R * (d2y / len2) };
      const p1 = { x: mx, y: my };

      const pathString = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
      const curve: CurveDefinition = { type: 'quad', p0, p1, p2, pathString };

      const bowDirX = mx - (u.cx + v.cx) / 2;
      const bowDirY = my - (u.cy + v.cy) / 2;

      intermediateList.push({
        id: edge.id,
        label,
        curve,
        isSelfLoop: false,
        getOutwardNormal: (t: number) => {
          const ev = evaluateCurve(curve, t);
          const dot = ev.normalX * bowDirX + ev.normalY * bowDirY;
          return dot >= 0 ? { nx: ev.normalX, ny: ev.normalY } : { nx: -ev.normalX, ny: -ev.normalY };
        },
      });
      continue;
    }

    // ── 4. SAME-LAYER (VERTICAL) EDGES ──
    if (Math.abs(u.cx - v.cx) < 30) {
      if (u.cy < v.cy) {
        const p0 = { x: u.cx + 20, y: u.cy + 31.2 };
        const p2 = { x: v.cx + 20, y: v.cy - 31.2 };
        const p1 = { x: Math.max(u.cx, v.cx) + R + 36, y: (u.cy + v.cy) / 2 };
        const pathString = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
        const curve: CurveDefinition = { type: 'quad', p0, p1, p2, pathString };
        intermediateList.push({
          id: edge.id,
          label,
          curve,
          isSelfLoop: false,
          getOutwardNormal: (t: number) => {
            const ev = evaluateCurve(curve, t);
            return ev.normalX >= 0 ? { nx: ev.normalX, ny: ev.normalY } : { nx: -ev.normalX, ny: -ev.normalY };
          },
        });
      } else {
        const p0 = { x: u.cx - 20, y: u.cy - 31.2 };
        const p2 = { x: v.cx - 20, y: v.cy + 31.2 };
        const p1 = { x: Math.min(u.cx, v.cx) - R - 36, y: (u.cy + v.cy) / 2 };
        const pathString = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
        const curve: CurveDefinition = { type: 'quad', p0, p1, p2, pathString };
        intermediateList.push({
          id: edge.id,
          label,
          curve,
          isSelfLoop: false,
          getOutwardNormal: (t: number) => {
            const ev = evaluateCurve(curve, t);
            return ev.normalX <= 0 ? { nx: ev.normalX, ny: ev.normalY } : { nx: -ev.normalX, ny: -ev.normalY };
          },
        });
      }
      continue;
    }

    // ── 5. UNDERNEATH RETURN LOOPS (Dynamic obstacle clearance below ALL nodes in span) ──
    if (underneathLaneMap.has(edge.id)) {
      const lane = underneathLaneMap.get(edge.id) ?? 0;
      const spanMinX = Math.min(u.cx, v.cx);
      const spanMaxX = Math.max(u.cx, v.cx);

      const nodesInSpan = positions.filter(
        p => p.id !== edge.source && p.id !== edge.target && p.id !== 'dfa_dead' &&
             p.x + R > spanMinX + 12 && p.x + R < spanMaxX - 12,
      );

      const maxObstacleBottom = Math.max(
        u.cy + R,
        v.cy + R,
        ...nodesInSpan.map(p => (p.y + R) + R + (statesWithBottomSelfLoops.has(p.id) ? 60 : 0)),
      );

      const targetBottomY = maxObstacleBottom + 45 + lane * 38;
      const depth = Math.max(48 + lane * 38, targetBottomY - Math.max(u.cy, v.cy));

      const angleOffset = Math.min(lane * 0.12, 0.36);
      const angleOut = 1.5 * Math.PI - 0.48 + angleOffset;
      const angleIn = 1.5 * Math.PI + 0.48 - angleOffset;

      const p0 = { x: u.cx + R * Math.cos(angleOut), y: u.cy - R * Math.sin(angleOut) };
      const p3 = { x: v.cx + R * Math.cos(angleIn), y: v.cy - R * Math.sin(angleIn) };

      const spanX = p0.x - p3.x;
      const p1 = { x: p0.x - spanX * 0.18, y: p0.y + depth * 1.35 };
      const p2 = { x: p3.x + spanX * 0.18, y: p3.y + depth * 1.35 };

      const pathString = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
      const curve: CurveDefinition = { type: 'cubic', p0, p1, p2, p3, pathString };

      intermediateList.push({
        id: edge.id,
        label,
        curve,
        isSelfLoop: false,
        getOutwardNormal: (t: number) => {
          const ev = evaluateCurve(curve, t);
          return ev.normalY >= 0 ? { nx: ev.normalX, ny: ev.normalY } : { nx: -ev.normalX, ny: -ev.normalY };
        },
      });
      continue;
    }

    // ── 6. TOP BYPASS (Dynamic obstacle clearance above ALL nodes and self-loops in span) ──
    if (topLaneMap.has(edge.id)) {
      const lane = topLaneMap.get(edge.id) ?? 0;
      const spanMinX = Math.min(u.cx, v.cx);
      const spanMaxX = Math.max(u.cx, v.cx);

      const nodesInSpan = positions.filter(
        p => p.id !== edge.source && p.id !== edge.target && p.id !== 'dfa_dead' &&
             p.x + R > spanMinX + 12 && p.x + R < spanMaxX - 12,
      );

      const minObstacleTop = Math.min(
        u.cy - R,
        v.cy - R,
        ...nodesInSpan.map(p => (p.y + R) - R - (statesWithTopSelfLoops.has(p.id) ? 60 : 0)),
      );

      const laneY = minObstacleTop - 45 - lane * 32;

      const p0 = { x: u.cx + 24, y: u.cy - 28 };
      const p3 = { x: v.cx - 24, y: v.cy - 28 };

      const spanX = p3.x - p0.x;
      const p1 = { x: p0.x + spanX * 0.18, y: laneY };
      const p2 = { x: p3.x - spanX * 0.18, y: laneY };

      const pathString = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
      const curve: CurveDefinition = { type: 'cubic', p0, p1, p2, p3, pathString };

      intermediateList.push({
        id: edge.id,
        label,
        curve,
        isSelfLoop: false,
        getOutwardNormal: (t: number) => {
          const ev = evaluateCurve(curve, t);
          return ev.normalY <= 0 ? { nx: ev.normalX, ny: ev.normalY } : { nx: -ev.normalX, ny: -ev.normalY };
        },
      });
      continue;
    }

    // ── 7. DIRECT FORWARD EDGE (Formal textbook straight arrow between circle perimeters) ──
    const dx = v.cx - u.cx;
    const dy = v.cy - u.cy;
    const dist = Math.hypot(dx, dy) || 1;

    const p0 = { x: u.cx + R * (dx / dist), y: u.cy + R * (dy / dist) };
    const p1 = { x: v.cx - R * (dx / dist), y: v.cy - R * (dy / dist) };
    const pathString = `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
    const curve: CurveDefinition = { type: 'line', p0, p1, pathString };

    intermediateList.push({
      id: edge.id,
      label,
      curve,
      isSelfLoop: false,
      getOutwardNormal: (t: number) => {
        const ev = evaluateCurve(curve, t);
        let ny = ev.normalY;
        let nx = ev.normalX;
        if (ny > 0 || (Math.abs(ny) < 1e-4 && nx < 0)) {
          nx = -nx;
          ny = -ny;
        }
        return { nx, ny };
      },
    });
  }

  // ── 8. DETERMINISTIC COLLISION-AWARE LABEL PLACEMENT ──
  // Track placed label bounding boxes to guarantee zero overlaps
  const placedBoxes: Array<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    cx: number;
    cy: number;
  }> = [];

  function boxIntersectsNode(cx: number, cy: number, w: number, h: number, node: NodePosition): boolean {
    const ncx = node.x + R;
    const ncy = node.y + R;
    const halfW = w / 2;
    const halfH = h / 2;
    const clampX = Math.max(cx - halfW, Math.min(ncx, cx + halfW));
    const clampY = Math.max(cy - halfH, Math.min(ncy, cy + halfH));
    const distSq = (ncx - clampX) * (ncx - clampX) + (ncy - clampY) * (ncy - clampY);
    return distSq < (R + 4) * (R + 4);
  }

  // Sort edges deterministically: self-loops first, straight lines next, bidirectional, bypass, return
  const edgePriority = (item: EdgeIntermediate) => {
    if (item.isSelfLoop) return 0;
    if (item.curve.type === 'line') return 1;
    if (item.curve.type === 'quad') return 2;
    return 3;
  };
  intermediateList.sort((a, b) => edgePriority(a) - edgePriority(b) || a.id.localeCompare(b.id));

  for (const item of intermediateList) {
    const labelText = item.label;
    const boxW = Math.max(24, labelText.length * 8.5 + 13);
    const boxH = 22;

    const tCandidates = item.isSelfLoop
      ? [0.5, 0.48, 0.52]
      : [0.5, 0.42, 0.58, 0.35, 0.65, 0.28, 0.72];

    const offsetCandidates = item.isSelfLoop
      ? [8, 12, 5, 15]
      : [8, 11, 5, 14, 0];

    let bestX = 0;
    let bestY = 0;
    let bestScore = Infinity;

    for (const t of tCandidates) {
      const ev = evaluateCurve(item.curve, t);
      const norm = item.getOutwardNormal(t);

      for (const offset of offsetCandidates) {
        const lx = ev.x + norm.nx * offset;
        const ly = ev.y + norm.ny * offset;

        const minX = lx - boxW / 2;
        const maxX = lx + boxW / 2;
        const minY = ly - boxH / 2;
        const maxY = ly + boxH / 2;

        // Check node collisions
        let nodeCollision = false;
        for (const p of positions) {
          if (boxIntersectsNode(lx, ly, boxW, boxH, p)) {
            nodeCollision = true;
            break;
          }
        }

        // Check label collisions with already placed labels
        let labelCollision = false;
        let overlapArea = 0;
        for (const pb of placedBoxes) {
          const overlapX = Math.max(0, Math.min(maxX, pb.maxX) - Math.max(minX, pb.minX));
          const overlapY = Math.max(0, Math.min(maxY, pb.maxY) - Math.max(minY, pb.minY));
          if (overlapX > 0 && overlapY > 0) {
            labelCollision = true;
            overlapArea += overlapX * overlapY;
          }
        }

        let score = Math.abs(t - 0.5) * 80 + Math.abs(offset - 8);
        if (nodeCollision) score += 10000;
        if (labelCollision) score += 2000 + overlapArea;

        if (score < bestScore) {
          bestScore = score;
          bestX = lx;
          bestY = ly;
          if (score === 0) break;
        }
      }
      if (bestScore === 0) break;
    }

    placedBoxes.push({
      minX: bestX - boxW / 2,
      maxX: bestX + boxW / 2,
      minY: bestY - boxH / 2,
      maxY: bestY + boxH / 2,
      cx: bestX,
      cy: bestY,
    });

    result.set(item.id, {
      path: item.curve.pathString,
      labelX: bestX,
      labelY: bestY,
    });
  }

  return result;
}
