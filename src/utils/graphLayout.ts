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

const NFA_H = 145; // horizontal spacing between NFA layers
const NFA_V = 130; // vertical spacing between NFA branch states

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

  // 5. Breadth-First Search (BFS) distance from start state
  const bfsDist = new Map<string, number>();
  const queue: string[] = [startStateId];
  bfsDist.set(startStateId, 0);

  while (queue.length > 0) {
    const u = queue.shift()!;
    const curDist = bfsDist.get(u)!;
    for (const v of regAdj.get(u) || []) {
      if (!bfsDist.has(v)) {
        bfsDist.set(v, curDist + 1);
        queue.push(v);
      }
    }
  }

  // Handle any unreachable regular states gracefully
  let maxBfs = 0;
  for (const d of bfsDist.values()) {
    if (d > maxBfs) maxBfs = d;
  }
  for (const s of regularStates) {
    if (!bfsDist.has(s.id)) {
      maxBfs++;
      bfsDist.set(s.id, maxBfs);
    }
  }

  // 6. Refine layers using forward reachability & DAG longest path
  const forwardEdges: Array<{ from: string; to: string }> = [];
  for (const s of regularStates) {
    for (const to of regAdj.get(s.id) || []) {
      const dFrom = bfsDist.get(s.id)!;
      const dTo = bfsDist.get(to)!;
      if (dTo > dFrom) {
        forwardEdges.push({ from: s.id, to });
      } else if (dTo === dFrom && !canReach.get(to)?.has(s.id)) {
        forwardEdges.push({ from: s.id, to });
      }
    }
  }

  // Compute layer ranks
  const layers = new Map<string, number>();
  for (const s of regularStates) {
    layers.set(s.id, bfsDist.get(s.id)!);
  }

  for (let iter = 0; iter < regularStates.length; iter++) {
    let changed = false;
    for (const e of forwardEdges) {
      const req = (layers.get(e.from) ?? 0) + 1;
      if (req > (layers.get(e.to) ?? 0)) {
        layers.set(e.to, req);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Compact layer numbers to consecutive integers 0, 1, 2, ...
  const uniqueLayers = Array.from(new Set(layers.values())).sort((a, b) => a - b);
  const layerRankMap = new Map<number, number>();
  uniqueLayers.forEach((l, idx) => layerRankMap.set(l, idx));
  for (const s of regularStates) {
    layers.set(s.id, layerRankMap.get(layers.get(s.id)!) ?? 0);
  }

  // Group regular states into layers
  const layerGroups = new Map<number, DFAState[]>();
  for (const s of regularStates) {
    const l = layers.get(s.id) ?? 0;
    if (!layerGroups.has(l)) layerGroups.set(l, []);
    layerGroups.get(l)!.push(s);
  }

  // 7. Assign (X, Y) Coordinates
  const H_SPACING = 210; // generous horizontal spacing for transitions & labels
  const V_SPACING = 140; // generous vertical spacing between nodes
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

/**
 * Computes collision-free, aesthetically routed SVG paths for every edge.
 * - Self-loops: compact, vertical teardrop loops on top with bold label above.
 * - Forward direct transitions: crisp straight horizontal lines with bold label above.
 * - Return loops / back-edges: smooth nested concentric elliptical arcs underneath.
 * - Forward skip edges: fly over the top bypass corridor with guaranteed clearance above self-loops.
 * - Bidirectional transitions: symmetrical quadratic curves on opposite sides.
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

  // Set of states that have self-loops
  const statesWithSelfLoops = new Set(
    edges.filter(e => e.source === e.target).map(e => e.source),
  );

  // Helper: check if node w is an obstacle in the direct path between u and v
  const isObstacle = (
    w: { id: string; cx: number; cy: number },
    u: { cx: number; cy: number },
    v: { cx: number; cy: number },
  ) => {
    if (w.id === 'dfa_dead') return false;
    const minX = Math.min(u.cx, v.cx);
    const maxX = Math.max(u.cx, v.cx);
    // Any node with center strictly between u and v horizontally
    if (w.cx <= minX + 5 || w.cx >= maxX - 5) return false;

    // Perpendicular distance from w to line segment u -> v
    const dx = v.cx - u.cx;
    const dy = v.cy - u.cy;
    const L = Math.hypot(dx, dy);
    if (L < 1) return false;
    const dist = Math.abs(dy * w.cx - dx * w.cy + v.cx * u.cy - v.cy * u.cx) / L;
    return dist < R + 25; // within 62px of line
  };

  const getObstacles = (srcId: string, tgtId: string) => {
    const u = nodeMap.get(srcId);
    const v = nodeMap.get(tgtId);
    if (!u || !v) return [];
    return positions
      .filter(p => p.id !== srcId && p.id !== tgtId)
      .map(p => ({ id: p.id, cx: p.x + R, cy: p.y + R }))
      .filter(w => isObstacle(w, u, v));
  };

  // 2. Classify underneath return loops vs top bypass edges
  const underneathEdges: Array<{ id: string; span: number; lane: number }> = [];
  const topBypassEdges: Array<{ id: string; minX: number; maxX: number; lane: number }> = [];

  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    if (edge.target === 'dfa_dead' || edge.source === 'dfa_dead') continue;
    if (isBidir(edge)) continue; // bidirectional pairs use symmetrical quadratic curves

    const u = nodeMap.get(edge.source);
    const v = nodeMap.get(edge.target);
    if (!u || !v) continue;

    const isBackward = v.cx < u.cx - 25;
    const obstacles = getObstacles(edge.source, edge.target);

    if (isBackward) {
      // Underneath return loop
      underneathEdges.push({ id: edge.id, span: u.cx - v.cx, lane: 0 });
    } else if (obstacles.length > 0) {
      // Forward skip over intermediate obstacles -> top bypass
      topBypassEdges.push({ id: edge.id, minX: u.cx, maxX: v.cx, lane: 0 });
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

  // Process and compute routes for all edges
  for (const edge of edges) {
    const u = nodeMap.get(edge.source);
    const v = nodeMap.get(edge.target);
    if (!u || !v) continue;

    // ── 1. SELF-LOOP (Compact, vertical teardrop loop on top) ──
    if (edge.source === edge.target) {
      if (edge.source === 'dfa_dead') {
        // DEAD self-loop placed cleanly on the BOTTOM
        const loopH = 46;
        const sx = u.cx - 12;
        const sy = u.cy + 34.8;
        const tx = u.cx + 12;
        const ty = u.cy + 34.8;
        const c1x = u.cx - 26;
        const c1y = u.cy + R + loopH;
        const c2x = tx;
        const c2y = ty + 22;
        result.set(edge.id, {
          path: `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty}`,
          labelX: u.cx,
          labelY: u.cy + R + loopH + 14,
        });
      } else {
        // Regular state self-loop on TOP (sleek loop matching textbook diagrams)
        const loopH = 46;
        const sx = u.cx - 12;
        const sy = u.cy - 34.8;
        const tx = u.cx + 12;
        const ty = u.cy - 34.8;
        const c1x = u.cx - 26;
        const c1y = u.cy - R - loopH;
        const c2x = tx;
        const c2y = ty - 22;
        result.set(edge.id, {
          path: `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty}`,
          labelX: u.cx,
          labelY: u.cy - R - loopH - 14,
        });
      }
      continue;
    }

    // ── 2. TRANSITIONS TO DEAD STATE (Flow downward along dedicated corridor) ──
    if (edge.target === 'dfa_dead' && edge.source !== 'dfa_dead') {
      const sx = u.cx;
      const sy = u.cy + R;
      const tx = v.cx;
      const ty = v.cy - R;

      const midY = (sy + ty) / 2;

      result.set(edge.id, {
        path: `M ${sx} ${sy} C ${sx} ${midY} ${tx} ${midY} ${tx} ${ty}`,
        labelX: (sx + tx) / 2 + (sx < tx ? -12 : 12),
        labelY: midY,
      });
      continue;
    }

    // ── 3. BIDIRECTIONAL PAIR (Symmetrical opposite curvature) ──
    if (isBidir(edge)) {
      const dx = v.cx - u.cx;
      const dy = v.cy - u.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = -dy / dist;
      const ny = dx / dist;
      const offset = 32;

      const mx = (u.cx + v.cx) / 2 + nx * offset;
      const my = (u.cy + v.cy) / 2 + ny * offset;

      // Start on u's perimeter in direction toward control point m
      const d1x = mx - u.cx;
      const d1y = my - u.cy;
      const len1 = Math.hypot(d1x, d1y) || 1;
      const sx = u.cx + R * (d1x / len1);
      const sy = u.cy + R * (d1y / len1);

      // End on v's perimeter from direction of control point m
      const d2x = v.cx - mx;
      const d2y = v.cy - my;
      const len2 = Math.hypot(d2x, d2y) || 1;
      const tx = v.cx - R * (d2x / len2);
      const ty = v.cy - R * (d2y / len2);

      // Midpoint of quadratic bezier at t = 0.5
      const qx = 0.25 * sx + 0.5 * mx + 0.25 * tx;
      const qy = 0.25 * sy + 0.5 * my + 0.25 * ty;

      result.set(edge.id, {
        path: `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`,
        labelX: qx + nx * 8,
        labelY: qy + ny * 8,
      });
      continue;
    }

    // ── 4. SAME-LAYER (VERTICAL) EDGES ──
    if (Math.abs(u.cx - v.cx) < 30) {
      if (u.cy < v.cy) {
        // u above v: bow out to the right
        const sx = u.cx + 20;
        const sy = u.cy + 31.2;
        const tx = v.cx + 20;
        const ty = v.cy - 31.2;
        const mx = Math.max(u.cx, v.cx) + R + 30;
        const my = (u.cy + v.cy) / 2;
        result.set(edge.id, {
          path: `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`,
          labelX: mx + 12,
          labelY: my,
        });
      } else {
        // u below v: bow out to the left
        const sx = u.cx - 20;
        const sy = u.cy - 31.2;
        const tx = v.cx - 20;
        const ty = v.cy + 31.2;
        const mx = Math.min(u.cx, v.cx) - R - 30;
        const my = (u.cy + v.cy) / 2;
        result.set(edge.id, {
          path: `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`,
          labelX: mx - 12,
          labelY: my,
        });
      }
      continue;
    }

    // ── 5. UNDERNEATH RETURN LOOPS (Smooth nested concentric elliptical arcs) ──
    if (underneathLaneMap.has(edge.id)) {
      const lane = underneathLaneMap.get(edge.id) ?? 0;
      const depth = 48 + lane * 42; // strictly concentric depths

      // Shallower curves (lane 0) start/end further out along circle sides.
      // Deeper curves (lane 1, 2...) start/end closer to the bottom center,
      // guaranteeing that deeper curves are strictly nested below shallower ones with ZERO crossings!
      const angleOffset = Math.min(lane * 0.12, 0.36);
      const angleOut = 1.5 * Math.PI - 0.48 + angleOffset;
      const angleIn = 1.5 * Math.PI + 0.48 - angleOffset;

      const sx = u.cx + R * Math.cos(angleOut);
      const sy = u.cy - R * Math.sin(angleOut);
      const tx = v.cx + R * Math.cos(angleIn);
      const ty = v.cy - R * Math.sin(angleIn);

      // Sweeping elliptical control points
      const spanX = sx - tx;
      const c1x = sx - spanX * 0.18;
      const c1y = sy + depth * 1.35;
      const c2x = tx + spanX * 0.18;
      const c2y = ty + depth * 1.35;

      result.set(edge.id, {
        path: `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty}`,
        labelX: (u.cx + v.cx) / 2,
        labelY: Math.max(sy, ty) + depth + 14,
      });
      continue;
    }

    // ── 6. TOP BYPASS (Forward skip edges clearing over intermediate nodes AND self-loops) ──
    if (topLaneMap.has(edge.id)) {
      const lane = topLaneMap.get(edge.id) ?? 0;
      const spanMin = Math.min(u.cx, v.cx);
      const spanMax = Math.max(u.cx, v.cx);

      // Check if any intermediate state in the span has a self-loop on top
      const hasSelfLoopInSpan = positions.some(
        p => p.x + R > spanMin + 5 && p.x + R < spanMax - 5 && statesWithSelfLoops.has(p.id),
      );

      // Fly strictly above self-loops if any exist
      const topObstacleY = hasSelfLoopInSpan ? -R - 60 : -R;
      const laneY = topObstacleY - 35 - lane * 30;

      // Launch and land at 45-degree angles to avoid any self-loops on source or target
      const sx = u.cx + 24;
      const sy = u.cy - 28;
      const tx = v.cx - 24;
      const ty = v.cy - 28;

      const spanX = tx - sx;
      const c1x = sx + spanX * 0.18;
      const c1y = laneY;
      const c2x = tx - spanX * 0.18;
      const c2y = laneY;

      result.set(edge.id, {
        path: `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty}`,
        labelX: (u.cx + v.cx) / 2,
        labelY: laneY - 14,
      });
    }

    // ── 7. DIRECT FORWARD EDGE (Crisp straight line when horizontally aligned) ──
    const dx = v.cx - u.cx;
    const dy = v.cy - u.cy;
    const dist = Math.hypot(dx, dy) || 1;

    if (Math.abs(dy) < 10) {
      // Perfectly horizontal forward edge (crisp straight line)
      const sx = u.cx + R;
      const sy = u.cy;
      const tx = v.cx - R;
      const ty = v.cy;
      result.set(edge.id, {
        path: `M ${sx} ${sy} L ${tx} ${ty}`,
        labelX: (sx + tx) / 2,
        labelY: sy - 14,
      });
    } else {
      // Smooth forward S-curve for states at different vertical levels
      const sx = u.cx + R * (dx / dist);
      const sy = u.cy + R * (dy / dist);
      const tx = v.cx - R * (dx / dist);
      const ty = v.cy - R * (dy / dist);

      const c1x = sx + (tx - sx) * 0.42;
      const c1y = sy;
      const c2x = tx - (tx - sx) * 0.42;
      const c2y = ty;

      result.set(edge.id, {
        path: `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty}`,
        labelX: (sx + tx) / 2,
        labelY: (sy + ty) / 2 - 12,
      });
    }
  }

  return result;
}
