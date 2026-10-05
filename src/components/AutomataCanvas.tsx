'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { NFA, DFA } from '@/types/automata';
import { layoutNFA, layoutDFA, computeAutomataEdgeRoutes, NodePosition } from '@/utils/graphLayout';
import AutomataNodeComponent, { AutomataNodeData } from './AutomataNode';
import AnimatedEdge, { AnimatedEdgeData } from './AnimatedEdge';

const nodeTypes = { automata: AutomataNodeComponent };
const edgeTypes = { animated: AnimatedEdge };

interface AutomataCanvasProps {
  mode: 'nfa' | 'dfa';
  nfa?: NFA | null;
  dfa?: DFA | null;
  fullNFA?: NFA | null;
  fullDFA?: DFA | null;
  highlightedStates?: string[];
  highlightedTransitions?: string[];
  activeState?: string | null;
  activeTransition?: string | null;
  onStateClick?: (stateId: string) => void;
}

const EMPTY: string[] = [];

/** Merge transitions between the same pair into one edge with combined labels. */
function mergeEdges(transitions: Array<{ from: string; to: string; symbol: string }>) {
  const edgeMap = new Map<string, string[]>();
  for (const t of transitions) {
    const key = `${t.from}|||${t.to}`;
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key)!.push(t.symbol);
  }
  return edgeMap;
}

function marker(color: string) {
  return { type: MarkerType.ArrowClosed, color, width: 14, height: 14 };
}

export default function AutomataCanvas({
  mode,
  nfa,
  dfa,
  fullNFA,
  fullDFA,
  highlightedStates = EMPTY,
  highlightedTransitions = EMPTY,
  activeState,
  activeTransition,
  onStateClick,
}: AutomataCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  // Stable positions computed from the complete final automaton
  // This guarantees nodes NEVER jump or change positions during step-by-step construction!
  const stablePositions = useMemo<NodePosition[]>(() => {
    if (mode === 'nfa') {
      const target = fullNFA ?? nfa;
      return target ? layoutNFA(target) : [];
    } else {
      const target = fullDFA ?? dfa;
      return target ? layoutDFA(target) : [];
    }
  }, [mode, fullNFA, fullDFA, nfa, dfa]);

  const posMap = useMemo(() => {
    return new Map<string, NodePosition>(stablePositions.map(p => [p.id, p]));
  }, [stablePositions]);

  // Latest highlight inputs, read by decorate without re-running layout
  const hl = useRef({ highlightedStates, highlightedTransitions, activeState, activeTransition, mode });
  useLayoutEffect(() => {
    hl.current = { highlightedStates, highlightedTransitions, activeState, activeTransition, mode };
  });

  const decorate = useCallback(
    (ns: Node<AutomataNodeData>[], es: Edge<AnimatedEdgeData>[]) => {
      const { highlightedStates: hs, highlightedTransitions: ht, activeState: as, activeTransition: at, mode: m } = hl.current;
      const nextNodes = ns.map(n => ({
        ...n,
        data: { ...n.data, isActive: n.id === as, isHighlighted: hs.includes(n.id) },
      }));
      const nextEdges = es.map(e => {
        const symbols = e.data?.symbols ?? [];
        const isActive = !!at && symbols.some(sym => `${e.source}-${sym}-${e.target}` === at);
        const isHighlighted =
          m === 'nfa'
            ? symbols.some(sym => ht.includes(`${e.source}-${sym}-${e.target}`))
            : hs.includes(e.source);
        const color = isActive ? '#2563eb' : isHighlighted ? '#3b82f6' : '#64748b';
        return {
          ...e,
          data: { ...(e.data as AnimatedEdgeData), isActive, isHighlighted },
          markerEnd: marker(color),
          zIndex: isActive || isHighlighted ? 1 : 0,
        };
      });
      return { nextNodes, nextEdges };
    },
    [],
  );

  // Track layout key to only fitView on major changes (automaton change or view mode switch),
  // NEVER on each step increment!
  const lastFitKey = useRef<string>('');

  useEffect(() => {
    let flowNodes: Node<AutomataNodeData>[] = [];
    let transitions: Array<{ from: string; to: string; symbol: string }> = [];

    if (mode === 'nfa' && nfa) {
      flowNodes = nfa.states.map(s => ({
        id: s.id,
        type: 'automata',
        position: posMap.get(s.id) ?? { x: 0, y: 0 },
        data: { label: s.id, isStart: s.isStart, isAccept: s.isAccept, isActive: false, isHighlighted: false, stateType: 'nfa' },
      }));
      transitions = nfa.transitions;
    } else if (mode === 'dfa' && dfa) {
      flowNodes = dfa.states.map(s => ({
        id: s.id,
        type: 'automata',
        position: posMap.get(s.id) ?? { x: 0, y: 0 },
        data: {
          label: s.label,
          isStart: s.isStart,
          isAccept: s.isAccept,
          isActive: false,
          isHighlighted: false,
          stateType: 'dfa',
          nfaStates: s.nfaStates,
        },
      }));
      transitions = dfa.transitions;
    }

    // Build merged edges
    const rawEdges: Array<{ id: string; source: string; target: string; symbols: string[]; curveOffset?: number }> = [];
    for (const [key, symbols] of mergeEdges(transitions).entries()) {
      const [from, to] = key.split('|||');
      rawEdges.push({
        id: `${from}-${symbols.join('_')}-${to}`,
        source: from,
        target: to,
        symbols,
      });
    }

    // Detect bidirectional edge pairs
    const dirSet = new Set(rawEdges.map(e => `${e.source}|||${e.target}`));
    for (const edge of rawEdges) {
      if (edge.source === edge.target) continue;
      if (dirSet.has(`${edge.target}|||${edge.source}`)) {
        edge.curveOffset = edge.source < edge.target ? -24 : 24;
      }
    }

    // Compute collision-free, obstacle-avoiding edge routes
    const routes = computeAutomataEdgeRoutes(stablePositions, rawEdges);

    const flowEdges: Edge<AnimatedEdgeData>[] = rawEdges.map(edge => {
      const route = routes.get(edge.id);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'animated',
        markerEnd: marker('#64748b'),
        data: {
          label: edge.symbols.join(', '),
          symbols: edge.symbols,
          isActive: false,
          isHighlighted: false,
          curveOffset: edge.curveOffset,
          customPath: route?.path,
          labelX: route?.labelX,
          labelY: route?.labelY,
        },
      };
    });

    const { nextNodes, nextEdges } = decorate(flowNodes, flowEdges);
    setNodes(nextNodes);
    setEdges(nextEdges);

    // Only run fitView when the underlying graph changes, not on animation steps
    const fitKey = `${mode}-${(fullNFA ?? nfa)?.states.length ?? 0}-${(fullDFA ?? dfa)?.states.length ?? 0}`;
    if (fitKey !== lastFitKey.current) {
      lastFitKey.current = fitKey;
      const t = setTimeout(() => fitView({ padding: 0.18, duration: 300 }), 60);
      return () => clearTimeout(t);
    }
  }, [mode, nfa, dfa, fullNFA, fullDFA, posMap, stablePositions, decorate, setNodes, setEdges, fitView]);

  // Update highlighting only (no re-layout, no re-fit, zero jitter)
  const hsKey = highlightedStates.join('|');
  const htKey = highlightedTransitions.join('|');
  useEffect(() => {
    setNodes(prev => decorate(prev, []).nextNodes);
    setEdges(prev => decorate([], prev).nextEdges);
  }, [hsKey, htKey, activeState, activeTransition, decorate, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onStateClick?.(node.id);
    },
    [onStateClick],
  );

  const isEmpty = (mode === 'nfa' && !nfa) || (mode === 'dfa' && !dfa);

  if (isEmpty) {
    return (
      <div className="canvas-empty">
        <p>No automaton to display.</p>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.15}
      maxZoom={2.5}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Controls showInteractive={false} position="bottom-left" />
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d5d9df" />
    </ReactFlow>
  );
}
