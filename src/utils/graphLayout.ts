// Graph Layout and Edge Routing utility for Automata (NFA & DFA)
// NFA: Thompson-construction-aware semantic layout (longest-path ranking,
//      branch separation for union alternatives, back-edge detection for star loops).
// DFA: Dagre automatic layered layout with dedicated DEAD-state positioning.
// Edge Routing: Obstacle-aware route synthesis with dedicated upper/lower lanes,
//      guaranteeing zero node penetration and local star loops.

import dagre from 'dagre';
import { NFA, DFA } from '../types/automata';

export interface NodePosition {
  id: string;
  x: number;
  y: number;
}

export const NODE_SIZE = 74;
const R = NODE_SIZE / 2;

const NFA_H = 145; // horizontal spacing between NFA layers
const NFA_V = 130; // vertical spacing between NFA branch states

// ==========================================================================
// NFA LAYOUT — Thompson-construction-aware semantic positioning
// ==========================================================================
export function layoutNFA(nfa: NFA): NodePosition[] {
  if (nfa.states.length === 0) return [];
  if (nfa.states.length === 1) return [{ id: nfa.states[0].id, x: 60, y: 0 }];

  const stateSet = new Set(nfa.states.map(s => s.id));

  // ---- adjacency ---
  const adj = new Map<string, string[]>();
  for (const s of nfa.states) adj.set(s.id, []);
  for (const t of nfa.transitions) {
    if (t.from !== t.to && stateSet.has(t.from) && stateSet.has(t.to)) {
      adj.get(t.from)!.push(t.to);
    }
  }

  // ---- back-edge detection (DFS coloring) ----
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

  // ---- forward-only edges for ranking ----
  const fwdEdges = nfa.transitions.filter(
    t =>
      t.from !== t.to &&
      !backEdges.has(`${t.from}->${t.to}`) &&
      stateSet.has(t.from) &&
      stateSet.has(t.to),
  );

  // ---- longest-path rank (Bellman-Ford on DAG) ----
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

  // ---- group into layers ----
  const layers = new Map<number, string[]>();
  for (const s of nfa.states) {
    const r = rank.get(s.id) ?? 0;
    if (!layers.has(r)) layers.set(r, []);
    layers.get(r)!.push(s.id);
  }

  const sortedRanks = [...layers.keys()].sort((a, b) => a - b);

  // ---- assign positions ----
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
// DFA LAYOUT — dagre automatic layout with dedicated DEAD-state positioning
// ==========================================================================
function dagreLayout(
  nodeIds: string[],
  edges: Array<{ from: string; to: string }>,
  opts: dagre.GraphLabel = {},
): NodePosition[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 80,
    ranksep: 170,
    marginx: 40,
    marginy: 40,
    ...opts,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const id of nodeIds) {
    g.setNode(id, { width: NODE_SIZE, height: NODE_SIZE });
  }

  const seen = new Set<string>();
  for (const e of edges) {
    if (e.from === e.to) continue;
    const key = `${e.from}\u2192${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    g.setEdge(e.from, e.to);
  }

  dagre.layout(g);

  return nodeIds.map(id => {
    const n = g.node(id);
    return { id, x: n.x - NODE_SIZE / 2, y: n.y - NODE_SIZE / 2 };
  });
}

export function layoutDFA(dfa: DFA): NodePosition[] {
  if (dfa.states.length === 0) return [];
  if (dfa.states.length === 1) return [{ id: dfa.states[0].id, x: 80, y: 0 }];

  // Exclude DEAD self-loops from layout edges
  const layoutEdges = dfa.transitions
    .filter(t => !(t.from === 'dfa_dead' && t.to === 'dfa_dead'))
    .map(t => ({ from: t.from, to: t.to }));

  const positions = dagreLayout(
    dfa.states.map(s => s.id),
    layoutEdges,
    { nodesep: 85, ranksep: 180, marginx: 50, marginy: 35 },
  );

  // Reposition DEAD state below the main flow
  const deadIdx = positions.findIndex(p => p.id === 'dfa_dead');
  if (deadIdx >= 0 && positions.length > 2) {
    const others = positions.filter(p => p.id !== 'dfa_dead');
    const maxX = Math.max(...others.map(p => p.x));
    const maxY = Math.max(...others.map(p => p.y));
    const avgX = others.reduce((sum, p) => sum + p.x, 0) / others.length;
    positions[deadIdx] = {
      id: 'dfa_dead',
      x: Math.max(avgX, maxX - 20),
      y: maxY + 175,
    };
  }

  return positions;
}

// ==========================================================================
// EDGE ROUTING — Obstacle-avoiding paths with dedicated upper/lower lanes
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

/**
 * Computes collision-free, aesthetically routed SVG paths for every edge.
 * - Self-loops arch neatly on top.
 * - Bidirectional edges are offset symmetrically.
 * - Backward loop edges route under the local fragment without touching intermediate nodes.
 * - Forward skip edges route over the local fragment without passing through nodes.
 * - Direct forward edges connect cleanly without unnecessary curves.
 */
export function computeAutomataEdgeRoutes(
  positions: NodePosition[],
  edges: EdgeInput[],
): Map<string, EdgeRouteResult> {
  const result = new Map<string, EdgeRouteResult>();
  const nodeMap = new Map(positions.map(p => [p.id, { ...p, cx: p.x + R, cy: p.y + R }]));

  // Detect bidirectional pairs
  const edgeDirSet = new Set(edges.map(e => `${e.source}|||${e.target}`));

  // Classify edges for lane allocation
  const archAboveList: Array<{ id: string; minX: number; maxX: number; lane: number }> = [];
  const archBelowList: Array<{ id: string; minX: number; maxX: number; lane: number }> = [];

  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    const u = nodeMap.get(edge.source);
    const v = nodeMap.get(edge.target);
    if (!u || !v) continue;

    const minX = Math.min(u.cx, v.cx);
    const maxX = Math.max(u.cx, v.cx);
    const isBack = v.cx < u.cx - 15;

    // Check intermediate nodes between u and v
    const intermediate = positions.filter(
      n => n.id !== edge.source && n.id !== edge.target && n.x + R > minX + 25 && n.x + R < maxX - 25,
    );

    if (isBack) {
      archBelowList.push({ id: edge.id, minX, maxX, lane: 0 });
    } else if (intermediate.length > 0) {
      archAboveList.push({ id: edge.id, minX, maxX, lane: 0 });
    }
  }

  // Assign distinct lanes for overlapping arches
  archAboveList.sort((a, b) => a.maxX - a.minX - (b.maxX - b.minX));
  for (let i = 0; i < archAboveList.length; i++) {
    for (let j = 0; j < i; j++) {
      if (archAboveList[i].minX < archAboveList[j].maxX && archAboveList[i].maxX > archAboveList[j].minX) {
        archAboveList[i].lane = Math.max(archAboveList[i].lane, archAboveList[j].lane + 1);
      }
    }
  }

  archBelowList.sort((a, b) => a.maxX - a.minX - (b.maxX - b.minX));
  for (let i = 0; i < archBelowList.length; i++) {
    for (let j = 0; j < i; j++) {
      if (archBelowList[i].minX < archBelowList[j].maxX && archBelowList[i].maxX > archBelowList[j].minX) {
        archBelowList[i].lane = Math.max(archBelowList[i].lane, archBelowList[j].lane + 1);
      }
    }
  }

  const laneAboveMap = new Map(archAboveList.map(a => [a.id, a.lane]));
  const laneBelowMap = new Map(archBelowList.map(a => [a.id, a.lane]));

  // Compute exact path for each edge
  for (const edge of edges) {
    const u = nodeMap.get(edge.source);
    const v = nodeMap.get(edge.target);

    // If either node is missing from positions, skip
    if (!u || !v) continue;

    // 1. Self Loop
    if (edge.source === edge.target) {
      const loopHeight = 52;
      const spread = 15;
      const sx = u.cx + spread;
      const sy = u.cy - R;
      const tx = u.cx - spread;
      const ty = u.cy - R;
      const c1x = u.cx + spread + 20;
      const c1y = u.cy - R - loopHeight;
      const c2x = u.cx - spread - 20;
      const c2y = u.cy - R - loopHeight;
      result.set(edge.id, {
        path: `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty}`,
        labelX: u.cx,
        labelY: u.cy - R - loopHeight - 8,
      });
      continue;
    }

    // 2. Transition to DEAD state situated below
    if (edge.target === 'dfa_dead' && edge.source !== 'dfa_dead') {
      const sx = u.cx;
      const sy = u.cy + R;
      const tx = v.cx;
      const ty = v.cy - R;
      const midY = (sy + ty) / 2;
      result.set(edge.id, {
        path: `M ${sx} ${sy} C ${sx} ${midY} ${tx} ${midY} ${tx} ${ty}`,
        labelX: (sx + tx) / 2 + (sx < tx ? -14 : 14),
        labelY: midY,
      });
      continue;
    }

    const minX = Math.min(u.cx, v.cx);
    const maxX = Math.max(u.cx, v.cx);
    const isBack = v.cx < u.cx - 15;

    const intermediate = positions.filter(
      n => n.id !== edge.source && n.id !== edge.target && n.x + R > minX + 25 && n.x + R < maxX - 25,
    );

    // 3. Backward Loop Edge (arch below)
    if (isBack) {
      const lane = laneBelowMap.get(edge.id) ?? 0;
      const intermediateY = intermediate.map(n => n.y + R * 2);
      const maxBottom = Math.max(u.cy + R, v.cy + R, ...(intermediateY.length ? intermediateY : [u.cy + R]));
      const laneY = maxBottom + 38 + lane * 32;

      const sx = u.cx;
      const sy = u.cy + R;
      const tx = v.cx;
      const ty = v.cy + R;

      result.set(edge.id, {
        path: `M ${sx} ${sy} C ${sx} ${laneY} ${tx} ${laneY} ${tx} ${ty}`,
        labelX: (sx + tx) / 2,
        labelY: laneY + 12,
      });
      continue;
    }

    // 4. Forward Skip Edge with obstacles (arch above)
    if (intermediate.length > 0) {
      const lane = laneAboveMap.get(edge.id) ?? 0;
      const intermediateTopY = intermediate.map(n => n.y);
      const minTop = Math.min(u.cy - R, v.cy - R, ...(intermediateTopY.length ? intermediateTopY : [u.cy - R]));
      const laneY = minTop - 38 - lane * 32;

      const sx = u.cx;
      const sy = u.cy - R;
      const tx = v.cx;
      const ty = v.cy - R;

      result.set(edge.id, {
        path: `M ${sx} ${sy} C ${sx} ${laneY} ${tx} ${laneY} ${tx} ${ty}`,
        labelX: (sx + tx) / 2,
        labelY: laneY - 12,
      });
      continue;
    }

    // 5. Bidirectional Pair (curve offset)
    const isBidir = edgeDirSet.has(`${edge.target}|||${edge.source}`);
    if (isBidir) {
      const dx = v.cx - u.cx;
      const dy = v.cy - u.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = -dy / dist;
      const ny = dx / dist;
      const offset = edge.curveOffset || (edge.source < edge.target ? -24 : 24);

      const sx = u.cx + (dx / dist) * R;
      const sy = u.cy + (dy / dist) * R;
      const tx = v.cx - (dx / dist) * R;
      const ty = v.cy - (dy / dist) * R;

      const mx = (sx + tx) / 2 + nx * offset;
      const my = (sy + ty) / 2 + ny * offset;

      result.set(edge.id, {
        path: `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`,
        labelX: (sx + 2 * mx + tx) / 4,
        labelY: (sy + 2 * my + ty) / 4,
      });
      continue;
    }

    // 6. Direct Forward Edge (smooth horizontal Bézier)
    const sx = u.cx + R;
    const sy = u.cy;
    const tx = v.cx - R;
    const ty = v.cy;
    const dx = tx - sx;
    const c1x = sx + Math.max(25, dx * 0.45);
    const c1y = sy;
    const c2x = tx - Math.max(25, dx * 0.45);
    const c2y = ty;

    result.set(edge.id, {
      path: `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty}`,
      labelX: (sx + 3 * c1x + 3 * c2x + tx) / 8,
      labelY: (sy + 3 * c1y + 3 * c2y + ty) / 8 - 9,
    });
  }

  return result;
}
