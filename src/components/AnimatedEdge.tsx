import React, { memo } from 'react';
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
} from 'reactflow';

export interface AnimatedEdgeData {
  label: string;
  symbols?: string[];
  isActive: boolean;
  isHighlighted: boolean;
  curveOffset?: number;
  customPath?: string;
  labelX?: number;
  labelY?: number;
}

/** Midpoint of a cubic Bézier curve (t = 0.5). */
function cubicMid(p0: number, p1: number, p2: number, p3: number) {
  return (p0 + 3 * p1 + 3 * p2 + p3) / 8;
}

const AnimatedEdge = memo(({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps<AnimatedEdgeData>) => {
  const {
    label = '',
    isActive = false,
    isHighlighted = false,
    curveOffset = 0,
    customPath,
    labelX: customLabelX,
    labelY: customLabelY,
  } = data ?? {};

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (customPath && customLabelX !== undefined && customLabelY !== undefined) {
    // ── Obstacle-avoiding precalculated route ──
    edgePath = customPath;
    labelX = customLabelX;
    labelY = customLabelY;
  } else if (source === target) {
    // ── Self-loop fallback ──
    const h = 54;
    const spread = 16;
    const c1x = sourceX + spread + 20, c1y = sourceY - h;
    const c2x = targetX - spread - 20, c2y = targetY - h;
    edgePath = `M ${sourceX + spread} ${sourceY} C ${c1x} ${c1y} ${c2x} ${c2y} ${targetX - spread} ${targetY}`;
    labelX = cubicMid(sourceX, c1x, c2x, targetX);
    labelY = cubicMid(sourceY, c1y, c2y, targetY) - 8;
  } else if (curveOffset !== 0) {
    // ── Bidirectional fallback ──
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / dist;
    const ny = dx / dist;
    const mx = (sourceX + targetX) / 2 + nx * curveOffset;
    const my = (sourceY + targetY) / 2 + ny * curveOffset;
    edgePath = `M ${sourceX} ${sourceY} Q ${mx} ${my} ${targetX} ${targetY}`;
    labelX = (sourceX + 2 * mx + targetX) / 4;
    labelY = (sourceY + 2 * my + targetY) / 4;
  } else {
    // ── Standard forward edge fallback ──
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  const strokeColor = isActive ? '#2563eb' : isHighlighted ? '#3b82f6' : '#000000';
  const strokeWidth = isActive ? 2.4 : isHighlighted ? 2.0 : 1.8;
  const labelColor = isActive ? '#1d4ed8' : isHighlighted ? '#2563eb' : '#000000';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          transition: 'stroke 200ms, stroke-width 200ms',
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="fade-in"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'none',
            zIndex: isActive || isHighlighted ? 10 : 2,
            fontFamily: 'var(--sans), var(--mono), sans-serif',
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1,
            padding: '1px 4px',
            background: '#ffffff',
            color: labelColor,
            borderRadius: 2,
            whiteSpace: 'nowrap',
            transition: 'color 200ms',
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

AnimatedEdge.displayName = 'AnimatedEdge';
export default AnimatedEdge;
