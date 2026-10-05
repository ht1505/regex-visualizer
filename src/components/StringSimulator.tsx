'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DFA, SimulationStep } from '@/types/automata';
import { simulateDFA } from '@/algorithms/simulate';

export interface SimulationHighlight {
  stateId: string | null;
  transition: string | null; // `${from}-${symbol}-${to}`
}

interface StringSimulatorProps {
  dfa: DFA | null;
  /** Reports the state / transition to highlight on the graph. */
  onHighlightChange?: (h: SimulationHighlight) => void;
  /** Called when a new simulation is started. */
  onRun?: () => void;
}

const SPEED_OPTIONS = [
  { label: '0.5×', ms: 2000 },
  { label: '1×', ms: 1000 },
  { label: '2×', ms: 500 },
  { label: '4×', ms: 250 },
];

export default function StringSimulator({ dfa, onHighlightChange, onRun }: StringSimulatorProps) {
  const [input, setInput] = useState('abb');
  const [simInput, setSimInput] = useState(''); // input string the current trace was produced for
  const [steps, setSteps] = useState<SimulationStep[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const speed = SPEED_OPTIONS[speedIdx];

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleSimulate = useCallback(() => {
    if (!dfa) return;
    clearTimer();

    const simSteps = simulateDFA(dfa, input);
    setSteps(simSteps);
    setSimInput(input);
    setCurrentIdx(0);
    setIsPlaying(simSteps.length > 1);
    setHasRun(true);
    onRun?.();
  }, [dfa, input, onRun]);

  const handlePlay = () => {
    if (currentIdx >= steps.length - 1) {
      setCurrentIdx(0);
    }
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
    clearTimer();
  };

  const handleRestart = () => {
    clearTimer();
    setIsPlaying(false);
    setCurrentIdx(0);
  };

  // Auto-advance when playing
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentIdx(prev => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false);
            clearTimer();
            return prev;
          }
          return prev + 1;
        });
      }, speed.ms);
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [isPlaying, steps.length, speed.ms]);

  const currentStep = steps[currentIdx];

  // Report graph highlight to parent
  useEffect(() => {
    if (!onHighlightChange) return;
    if (!currentStep) {
      onHighlightChange({ stateId: null, transition: null });
      return;
    }
    const t = currentStep.transitionUsed;
    onHighlightChange({
      stateId: currentStep.currentState || null,
      transition: t ? `${t.from}-${t.symbol}-${t.to}` : null,
    });
  }, [currentStep, onHighlightChange]);

  // Clear highlight when the simulator is unmounted (e.g. tab switch)
  useEffect(() => () => onHighlightChange?.({ stateId: null, transition: null }), [onHighlightChange]);

  const isAccepted = steps[steps.length - 1]?.isAccepted;
  const isDone = currentIdx >= steps.length - 1 && steps.length > 0;

  const labelOf = (id: string) => dfa?.states.find(s => s.id === id)?.label ?? (id || '—');
  const simChars = simInput.split('');

  if (!dfa) {
    return <p className="placeholder-text">Generate an automaton to simulate input strings.</p>;
  }

  return (
    <div className="sim-grid">
      {/* Left: input + controls */}
      <div className="sim-controls">
        <div>
          <label htmlFor="sim-input" className="section-label">Input String</label>
          <div className="input-row">
            <input
              id="sim-input"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSimulate(); }}
              placeholder="empty string = ε"
              className="text-input mono"
              spellCheck={false}
              autoComplete="off"
            />
            <button id="run-simulation" onClick={handleSimulate} className="btn btn-primary">
              Run Simulation
            </button>
          </div>
        </div>

        {hasRun && (
          <>
            <div>
              <span className="section-label">Input Tape</span>
              <div className="tape" aria-label="Input tape">
                {simChars.length === 0 ? (
                  <span className="tape-empty">ε (empty string)</span>
                ) : (
                  simChars.map((char, i) => {
                    const charIdx = currentStep?.inputIndex ?? -1;
                    const cls = i === charIdx ? 'is-current' : i < charIdx ? 'is-read' : '';
                    return (
                      <span key={i} className={`tape-cell ${cls}`}>{char}</span>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <span className="section-label">Playback</span>
              <div className="step-controls-row" style={{ flexWrap: 'wrap' }}>
                <button onClick={handleRestart} className="btn btn-sm" title="Reset to start">Reset</button>
                <button
                  onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
                  disabled={currentIdx <= 0}
                  className="btn btn-sm"
                >
                  Previous
                </button>
                {isPlaying ? (
                  <button onClick={handlePause} className="btn btn-sm">Pause</button>
                ) : (
                  <button onClick={handlePlay} disabled={steps.length <= 1} className="btn btn-sm">Play</button>
                )}
                <button
                  onClick={() => setCurrentIdx(prev => Math.min(steps.length - 1, prev + 1))}
                  disabled={currentIdx >= steps.length - 1}
                  className="btn btn-sm"
                >
                  Next
                </button>
                <span className="spacer" />
                <select
                  aria-label="Playback speed"
                  className="select select-sm"
                  value={speedIdx}
                  onChange={e => setSpeedIdx(Number(e.target.value))}
                >
                  {SPEED_OPTIONS.map((opt, i) => (
                    <option key={i} value={i}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="step-counter" style={{ marginTop: 8 }}>
                Step {Math.min(currentIdx + 1, steps.length)} of {steps.length}
              </div>
            </div>

            {isDone && (
              <div className={`result-box ${isAccepted ? 'accepted' : 'rejected'}`} role="status">
                <div className="result-label">Result</div>
                <div className="result-value">{isAccepted ? 'ACCEPTED' : 'REJECTED'}</div>
                <div className="result-text">
                  The input string <span className="mono">&quot;{simInput || 'ε'}&quot;</span>{' '}
                  {isAccepted ? 'is accepted by the DFA.' : 'is not accepted by the DFA.'}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: execution trace */}
      <div>
        <span className="section-label">Execution Trace</span>
        {hasRun ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  <th>Character</th>
                  <th>Transition</th>
                  <th className="align-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {steps.slice(0, currentIdx + 1).map((s, i) => {
                  const isCurrent = i === currentIdx;
                  let ch = '—';
                  let transition = '';
                  let note: React.ReactNode = '';

                  if (i === 0) {
                    transition = `→ ${labelOf(s.currentState)}`;
                    note = 'Start state';
                  } else if (s.transitionUsed) {
                    ch = s.currentChar ?? '—';
                    transition = `${labelOf(s.transitionUsed.from)} → ${labelOf(s.transitionUsed.to)}`;
                    note = <span className="mono">δ({labelOf(s.transitionUsed.from)}, {ch}) = {labelOf(s.transitionUsed.to)}</span>;
                  } else if (s.currentChar !== null) {
                    ch = s.currentChar;
                    transition = `${labelOf(s.currentState)} → ∅`;
                    note = <span className="status-reject">No transition defined</span>;
                  } else {
                    ch = 'end';
                    transition = labelOf(s.currentState);
                    note = s.isAccepted
                      ? <span className="status-accept">Accepting state</span>
                      : <span className="status-reject">Non-accepting state</span>;
                  }

                  return (
                    <tr key={i} className={isCurrent ? 'is-current' : ''}>
                      <td className="secondary">{i}</td>
                      <td>{ch}</td>
                      <td>{transition}</td>
                      <td className="text align-left">{note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="placeholder-text" style={{ textAlign: 'left', paddingTop: 4 }}>
            Enter an input string and select &quot;Run Simulation&quot;. The current state and transition are highlighted on the DFA graph.
          </p>
        )}
      </div>
    </div>
  );
}
