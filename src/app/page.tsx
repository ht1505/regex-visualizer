'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ReactFlowProvider } from 'reactflow';

import { buildAutomata, AutomataResult } from '@/algorithms/index';
import { NFA, DFA, ConstructionStep } from '@/types/automata';

import AutomataCanvas from '@/components/AutomataCanvas';
import TransitionTable from '@/components/TransitionTable';
import StateInfoPanel from '@/components/StateInfoPanel';
import StringSimulator, { SimulationHighlight } from '@/components/StringSimulator';

const EXAMPLES = [
  'a',
  'a|b',
  'ab',
  'a*',
  '(a|b)*',
  '(a|b)*abb',
  '(ab|ba)*',
  'a*b*',
  '(a|b)(a|b)',
  'a(b|c)*d',
];

const SPEEDS = [
  { label: 'Slow', ms: 1500 },
  { label: 'Normal', ms: 800 },
  { label: 'Fast', ms: 300 },
];

const OPERATION_NAMES: Record<ConstructionStep['type'], string> = {
  symbol: 'Symbol',
  concat: 'Concatenation',
  union: 'Union',
  star: 'Kleene Star',
  plus: 'One or More (+)',
  'epsilon-closure': 'ε-closure',
  move: 'Move',
  subset: 'Subset',
  info: 'Information',
};

type ViewMode = 'nfa' | 'dfa' | 'minimized';
type DetailTab = 'table' | 'simulate';

/* ---------------------------------------------------------------------------
   Pure helpers: derive what is shown for a given view mode and step
   ------------------------------------------------------------------------- */

function getStepNFA(r: AutomataResult, mode: ViewMode, step: number): NFA | null {
  if (mode !== 'nfa') return r.nfa;
  if (!r.constructionSteps.length) return r.nfa;
  const s = r.constructionSteps[Math.min(step, r.constructionSteps.length - 1)];
  return s?.nfaSnapshot ?? r.nfa;
}

function getStepDFA(r: AutomataResult, mode: ViewMode, step: number): DFA | null {
  if (mode === 'minimized') return r.minimizedDFA;
  if (mode === 'nfa') return null;
  if (!r.dfaSteps.length) return r.dfa;
  const s = r.dfaSteps[Math.min(step, r.dfaSteps.length - 1)];
  return s?.dfaSnapshot ?? r.dfa;
}

function getHighlightedStates(r: AutomataResult, mode: ViewMode, step: number): string[] {
  if (mode === 'nfa') {
    const s = r.constructionSteps[Math.min(step, r.constructionSteps.length - 1)];
    return s?.highlightedStates ?? [];
  }
  if (mode === 'dfa') {
    const s = r.dfaSteps[Math.min(step, r.dfaSteps.length - 1)];
    return s && s.currentDFAState ? [s.currentDFAState] : [];
  }
  return [];
}

function getHighlightedTransitions(r: AutomataResult, mode: ViewMode, step: number): string[] {
  if (mode === 'nfa') {
    const s = r.constructionSteps[Math.min(step, r.constructionSteps.length - 1)];
    return s?.highlightedTransitions ?? [];
  }
  return [];
}

function getTotalSteps(r: AutomataResult, mode: ViewMode): number {
  if (mode === 'nfa') return r.constructionSteps.length;
  if (mode === 'dfa') return r.dfaSteps.length;
  return 0;
}

const setStr = (xs: string[] | undefined) => (xs && xs.length ? `{${xs.join(', ')}}` : '∅');

/* ---------------------------------------------------------------------------
   Small presentational pieces
   ------------------------------------------------------------------------- */

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 28 28" fill="none" aria-hidden>
      <circle cx="7" cy="14" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="21" cy="14" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="21" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M11.5 14h4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.5 11.8l2.4 2.2-2.4 2.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function EmptyCanvas() {
  return (
    <div className="canvas-empty">
      <svg width="96" height="40" viewBox="0 0 96 40" fill="none" aria-hidden>
        <path d="M0 20h10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 16.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="26" cy="20" r="12" stroke="currentColor" strokeWidth="1.5" />
        <path d="M38 20h18" stroke="currentColor" strokeWidth="1.5" />
        <path d="M53 16.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="72" cy="20" r="12" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="72" cy="20" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <h2>Automata Visualization</h2>
      <p>Enter a regular expression above and select &quot;Generate Automata&quot; to begin.</p>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend" aria-label="Legend">
      <span className="legend-item">
        <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden>
          <path d="M0 4h11" stroke="#334155" strokeWidth="1.5" />
          <path d="M10 1l5 3-5 3z" fill="#334155" />
        </svg>
        Start
      </span>
      <span className="legend-item"><span className="legend-swatch" />State</span>
      <span className="legend-item"><span className="legend-swatch accept" />Accepting</span>
      <span className="legend-item"><span className="legend-swatch active" />Current</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Page
   ------------------------------------------------------------------------- */

export default function HomePage() {
  const [regexInput, setRegexInput] = useState('(a|b)*abb');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AutomataResult | null>(null);
  const [generatedRegex, setGeneratedRegex] = useState('');
  const [resultVersion, setResultVersion] = useState(0);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('nfa');
  const [detailTab, setDetailTab] = useState<DetailTab>('table');
  const [showTrapState, setShowTrapState] = useState(false);

  // Step control
  const [currentStep, setCurrentStep] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(800);

  // Selected state for inspector
  const [selectedState, setSelectedState] = useState<string | null>(null);

  // Simulation highlight (DFA graph)
  const [simHighlight, setSimHighlight] = useState<SimulationHighlight>({ stateId: null, transition: null });

  // Derived: what's currently visible
  const currentNFA = result ? getStepNFA(result, viewMode, currentStep) : null;
  const currentDFA = result ? getStepDFA(result, viewMode, currentStep) : null;
  const highlightedStates = result ? getHighlightedStates(result, viewMode, currentStep) : [];
  const highlightedTransitions = result ? getHighlightedTransitions(result, viewMode, currentStep) : [];
  const totalSteps = result ? getTotalSteps(result, viewMode) : 0;

  // Generate automata
  const handleGenerate = useCallback(() => {
    setError(null);
    setCurrentStep(0);
    setSelectedState(null);
    setIsAutoPlaying(false);
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);

    try {
      const regex = regexInput.trim();
      const res = buildAutomata(regex);
      setResult(res);
      setGeneratedRegex(regex);
      setResultVersion(v => v + 1);
      setViewMode('nfa');
      setCurrentStep(Math.max(0, res.constructionSteps.length - 1));
    } catch (e: unknown) {
      setResult(null);
      setError((e as Error).message ?? 'Unknown error');
    }
  }, [regexInput]);

  // Auto-play steps
  useEffect(() => {
    if (isAutoPlaying && result) {
      autoPlayRef.current = setInterval(() => {
        setCurrentStep(prev => {
          const max = getTotalSteps(result, viewMode) - 1;
          if (prev >= max) {
            setIsAutoPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, autoPlaySpeed);
    } else {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    }
    return () => { if (autoPlayRef.current) clearInterval(autoPlayRef.current); };
  }, [isAutoPlaying, autoPlaySpeed, result, viewMode]);

  const handleViewModeChange = (mode: ViewMode, step?: number) => {
    setViewMode(mode);
    const targetStep =
      step !== undefined
        ? step
        : mode === 'dfa'
        ? Math.max(0, (result?.dfaSteps.length ?? 1) - 1)
        : mode === 'nfa'
        ? Math.max(0, (result?.constructionSteps.length ?? 1) - 1)
        : 0;
    setCurrentStep(targetStep);
    setIsAutoPlaying(false);
    setSelectedState(null);
  };

  const handleReset = () => {
    setRegexInput('');
    setResult(null);
    setGeneratedRegex('');
    setError(null);
    setCurrentStep(0);
    setSelectedState(null);
    setIsAutoPlaying(false);
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleGenerate();
  };

  // When a simulation starts, show the complete DFA so the run can be traced on the graph
  const handleSimulationRun = useCallback(() => {
    if (!result) return;
    setViewMode('dfa');
    setCurrentStep(Math.max(0, result.dfaSteps.length - 1));
    setIsAutoPlaying(false);
    setSelectedState(null);
  }, [result]);

  /* ---------------- Conversion process (pipeline) ---------------- */
  const lastDfaStep = result ? result.dfaSteps.length - 1 : 0;
  let activeStage = -1;
  if (!result) activeStage = regexInput.trim() ? 0 : -1;
  else if (viewMode === 'nfa') activeStage = 2;
  else if (viewMode === 'dfa') activeStage = currentStep < lastDfaStep ? 3 : 4;
  else activeStage = 4;

  const stages = [
    { key: 'regex', label: 'Regex', meta: (result ? generatedRegex : regexInput.trim()) || '—', onClick: undefined as undefined | (() => void) },
    { key: 'parse', label: 'Parse', meta: result ? result.postfixString : '—', onClick: undefined },
    {
      key: 'nfa',
      label: 'ε-NFA',
      meta: result ? `${result.nfa.states.length} states` : "Thompson's construction",
      onClick: result ? () => handleViewModeChange('nfa') : undefined,
    },
    {
      key: 'subset',
      label: 'Subset Construction',
      meta: result ? `${result.dfaSteps.length} steps` : 'ε-closure, move',
      onClick: result ? () => handleViewModeChange('dfa', 0) : undefined,
    },
    {
      key: 'dfa',
      label: 'Complete DFA',
      meta: result
        ? `${result.dfa.states.length} states${result.dfa.states.some(s => s.label === 'DEAD') ? ' · DEAD trap' : ''}`
        : '—',
      onClick: result ? () => handleViewModeChange('dfa', Math.max(0, lastDfaStep)) : undefined,
    },
  ];

  /* ---------------- Step panel content ---------------- */
  function renderStepPanel() {
    if (!result) {
      return <p className="placeholder-text" style={{ textAlign: 'left', padding: 0 }}>No construction in progress.</p>;
    }

    if (viewMode === 'nfa') {
      const step = result.constructionSteps[Math.min(currentStep, result.constructionSteps.length - 1)];
      if (!step) return null;
      return (
        <>
          <div className="kv">
            <span className="kv-label">Method</span>
            <span className="kv-value">Thompson&apos;s Construction</span>
          </div>
          <div className="kv">
            <span className="kv-label">Operation</span>
            <span className="kv-value large">
              {OPERATION_NAMES[step.type] ?? step.type}
              {step.operand && <span className="tag mono">{step.operand}</span>}
            </span>
          </div>
          {step.fragmentStart && (
            <div className="kv">
              <span className="kv-label">Resulting fragment</span>
              <span className="kv-value mono">
                start {step.fragmentStart} · accept {step.fragmentAccept || '—'}
              </span>
            </div>
          )}
          {step.newTransitions.length > 0 && (
            <div className="kv">
              <span className="kv-label">Transitions added</span>
              <ul className="fragment-list">
                {step.newTransitions.map((t, i) => (
                  <li key={i}>
                    {t.from} <span className="arrow">──</span><span className="sym">{t.symbol}</span><span className="arrow">──›</span> {t.to}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <hr className="divider" />
          <div className="kv">
            <span className="kv-label">Description</span>
            <p className="desc-text" style={{ margin: 0 }}>{step.description}</p>
          </div>
        </>
      );
    }

    if (viewMode === 'dfa') {
      const step = result.dfaSteps[Math.min(currentStep, result.dfaSteps.length - 1)];
      if (!step) return null;
      const snapshot = step.dfaSnapshot;
      const current = snapshot.states.find(s => s.id === step.currentDFAState);
      const closureKey = (step.closureResult ?? []).slice().sort().join(',');
      const target = step.symbol
        ? snapshot.states.find(s => s.nfaStates.slice().sort().join(',') === closureKey && closureKey !== '')
        : undefined;

      const isCompletionStep = step.description.startsWith('DFA Completion') || step.description.startsWith('Complete DFA');

      if (isCompletionStep) {
        return (
          <>
            <div className="kv">
              <span className="kv-label">Phase</span>
              <span className="kv-value">DFA Completion (Total Transition Function)</span>
            </div>

            {current && (
              <div className="kv">
                <span className="kv-label">{current.label === 'DEAD' ? 'Trap State' : 'State Modified'}</span>
                <span className="kv-value mono large">
                  {current.label === 'DEAD' ? 'DEAD = ∅ (Trap State)' : `${current.label} = ${setStr(current.nfaStates)}`}
                </span>
              </div>
            )}

            <div className="kv">
              <span className="kv-label">Description</span>
              <p className="desc-text" style={{ margin: 0 }}>{step.description}</p>
            </div>

            <hr className="divider" />

            <div className="kv">
              <span className="kv-label">DFA states ({snapshot.states.length})</span>
              <div className="state-list">
                {snapshot.states.map(s => (
                  <div key={s.id} className={`state-list-row ${s.id === step.currentDFAState ? 'is-current' : ''}`}>
                    <span className="name">{s.label}{s.isAccept ? '*' : ''}</span>
                    <span className="set" title={s.label === 'DEAD' ? '∅ (trap state)' : setStr(s.nfaStates)}>
                      {s.label === 'DEAD' ? '∅ (trap)' : setStr(s.nfaStates)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      }

      return (
        <>
          <div className="kv">
            <span className="kv-label">Method</span>
            <span className="kv-value">Subset Construction</span>
          </div>

          {current && (
            <div className="kv">
              <span className="kv-label">Current DFA state</span>
              <span className="kv-value mono large">
                {current.label} = {setStr(current.nfaStates)}
              </span>
            </div>
          )}

          {/* Initial step: ε-closure of the NFA start state */}
          {current && !step.symbol && (
            <div className="derivation">
              <div className="d-key">ε-closure({result.nfa.startState})</div>
              <div className="d-val">{setStr(step.closureResult)}</div>
              <div className="d-key">Result</div>
              <div className="d-val is-result">
                {current.label} = {setStr(current.nfaStates)}
                <span className="tag">start</span>
                {current.isAccept && <span className="tag success">accepting</span>}
              </div>
            </div>
          )}

          {/* Transition step: move + ε-closure */}
          {current && step.symbol && (
            <div className="derivation">
              <div className="d-key">Input symbol</div>
              <div className="d-val">{step.symbol}</div>
              <div className="d-key">move({current.label}, {step.symbol})</div>
              <div className="d-val">{setStr(step.moveResult)}</div>
              <div className="d-key">ε-closure(…)</div>
              <div className="d-val">{setStr(step.closureResult)}</div>
              <div className="d-key">Result</div>
              <div className="d-val is-result">
                {target ? (
                  <>
                    δ({current.label}, {step.symbol}) = {target.label}
                    {step.newDFAStateName ? <span className="tag accent">new state</span> : <span className="tag">existing</span>}
                    {target.isAccept && <span className="tag success">accepting</span>}
                  </>
                ) : (
                  <>∅ <span className="tag">no transition</span></>
                )}
              </div>
            </div>
          )}

          {/* Final step */}
          {!current && (
            <div className="kv">
              <span className="kv-label">Status</span>
              <span className="kv-value">
                Construction complete: {snapshot.states.length} states, {snapshot.transitions.length} transitions.
              </span>
            </div>
          )}

          <hr className="divider" />

          <div className="kv">
            <span className="kv-label">DFA states ({snapshot.states.length})</span>
            <div className="state-list">
              {snapshot.states.map(s => (
                <div key={s.id} className={`state-list-row ${s.id === step.currentDFAState ? 'is-current' : ''}`}>
                  <span className="name">{s.label}{s.isAccept ? '*' : ''}</span>
                  <span className="set" title={s.label === 'DEAD' ? '∅ (trap state)' : setStr(s.nfaStates)}>
                    {s.label === 'DEAD' ? '∅ (trap)' : setStr(s.nfaStates)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      );
    }

    // Minimized DFA
    const min = result.minimizedDFA;
    if (!min) return null;
    return (
      <>
        <div className="kv">
          <span className="kv-label">Method</span>
          <span className="kv-value">DFA Minimization (partition refinement)</span>
        </div>
        <div className="derivation">
          <div className="d-key">DFA states</div>
          <div className="d-val">{result.dfa.states.length}</div>
          <div className="d-key">Minimized states</div>
          <div className="d-val is-result">{min.states.length}</div>
        </div>
        <p className="desc-text" style={{ margin: 0, color: 'var(--text-2)' }}>
          States that cannot be distinguished by any input string are grouped into the same partition and merged into a single state.
        </p>
        <hr className="divider" />
        <div className="kv">
          <span className="kv-label">Minimized states</span>
          <div className="state-list">
            {min.states.map(s => (
              <div key={s.id} className="state-list-row">
                <span className="name">{s.label}{s.isAccept ? '*' : ''}</span>
                <span className="set" title={setStr(s.nfaStates)}>{setStr(s.nfaStates)}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  const currentDFAStep = result?.dfaSteps[Math.min(currentStep, (result?.dfaSteps.length ?? 1) - 1)];
  const isDFACompletion = currentDFAStep?.description.startsWith('DFA Completion') || currentDFAStep?.description.startsWith('Complete DFA');
  const panelTitle =
    viewMode === 'nfa'
      ? 'Construction Step'
      : viewMode === 'dfa'
      ? (isDFACompletion ? 'DFA Completion' : 'Subset Construction')
      : 'Minimization';
  const hasSteps = !!result && viewMode !== 'minimized' && totalSteps > 0;

  const inspectorDFA = viewMode === 'minimized' ? result?.minimizedDFA : currentDFA;
  const inspectorNFA = viewMode === 'nfa' ? currentNFA : null;

  return (
    <div className="app">
      {/* ------------------------------------------------------------ Header */}
      <header className="app-header">
        <div className="container header-inner">
          <div className="brand">
            <BrandMark />
            <div>
              <h1 className="brand-title">Regex Automata Visualizer</h1>
              <div className="brand-sub">Regular Expression → ε-NFA → DFA</div>
            </div>
          </div>
          <nav className="header-nav" aria-label="Primary">
            <a href="#details" className="hide-sm">Transition Table</a>
            <a href="#details" className="hide-sm" onClick={() => setDetailTab('simulate')}>Simulation</a>
            <a href="#methods">Documentation</a>
          </nav>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------- Regex input */}
        <section className="section section-surface" aria-labelledby="regex-label">
          <div className="container input-grid">
            <div>
              <label id="regex-label" htmlFor="regex-input" className="section-label">Regular Expression</label>
              <div className="input-row">
                <input
                  id="regex-input"
                  type="text"
                  value={regexInput}
                  onChange={e => setRegexInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. (a|b)*abb"
                  className={`text-input mono ${error ? 'is-invalid' : ''}`}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={!!error}
                  aria-describedby={error ? 'regex-error' : 'regex-syntax'}
                />
                <select
                  id="example-select"
                  aria-label="Load example expression"
                  onChange={e => setRegexInput(e.target.value)}
                  value=""
                  className="select"
                >
                  <option value="" disabled>Examples</option>
                  {EXAMPLES.map(ex => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                </select>
                <button
                  id="generate-btn"
                  onClick={handleGenerate}
                  disabled={!regexInput.trim()}
                  className="btn btn-primary"
                >
                  Generate Automata
                </button>
                <button id="reset-btn" onClick={handleReset} className="btn" title="Clear input and results">
                  Clear
                </button>
              </div>

              {error && (
                <div id="regex-error" className="field-error" role="alert">
                  <strong>Invalid expression:</strong>
                  <span className="mono">{error}</span>
                </div>
              )}

              <div id="regex-syntax" className="syntax-ref">
                <span className="syntax-title">Supported:</span>
                <span><code>|</code>Union</span>
                <span><code>*</code>Kleene star</span>
                <span><code>+</code>One or more</span>
                <span><code>( )</code>Grouping</span>
                <span className="syntax-title">Concatenation is implicit.</span>
              </div>
            </div>

            <dl className="parse-output" aria-label="Parse output">
              <dt>Tokens</dt>
              <dd className={result ? '' : 'is-empty'}>
                {result ? result.tokensWithConcat.map(t => t.value).join(' ') : '—'}
              </dd>
              <dt>Postfix</dt>
              <dd className={result ? '' : 'is-empty'}>{result ? result.postfixString : '—'}</dd>
              <dt>Alphabet Σ</dt>
              <dd className={result ? '' : 'is-empty'}>{result ? setStr(result.nfa.alphabet) : '—'}</dd>
            </dl>
          </div>
        </section>

        {/* ---------------------------------------------- Conversion process */}
        <section className="section" aria-labelledby="process-label">
          <div className="container">
            <span id="process-label" className="section-label">Conversion Process</span>
            <ol className="pipeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {stages.map((s, idx) => {
                const isActive = idx === activeStage;
                const isComplete = !!result && idx < activeStage;
                const cls = [
                  'pipeline-step',
                  isActive ? 'is-active' : '',
                  isComplete ? 'is-complete' : '',
                  s.onClick ? 'is-clickable' : '',
                ].join(' ');
                const body = (
                  <>
                    <span className="step-index">
                      {isComplete ? (
                        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                          <path d="M2 5.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                        </svg>
                      ) : (
                        String(idx + 1).padStart(2, '0')
                      )}
                    </span>
                    <span className="step-text">
                      <div className="step-label">{s.label}</div>
                      <div className="step-meta" title={s.meta}>{s.meta}</div>
                    </span>
                  </>
                );
                return (
                  <li key={s.key} style={{ display: 'contents' }}>
                    {s.onClick ? (
                      <button
                        id={`stage-${s.key}`}
                        type="button"
                        className={cls}
                        onClick={s.onClick}
                        aria-current={isActive ? 'step' : undefined}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className={cls} aria-current={isActive ? 'step' : undefined}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------- Workspace */}
        <section className="section" aria-label="Automata visualization">
          <div className="container workspace">
            {/* Canvas */}
            <div className="panel canvas-panel">
              <div className="panel-header">
                <div className="tabs" role="tablist" aria-label="Automaton">
                  <span className="panel-title" style={{ alignSelf: 'center', marginRight: 8 }}>Automaton</span>
                  {[
                    { key: 'nfa' as ViewMode, label: 'ε-NFA', count: result?.nfa.states.length, enabled: !!result },
                    {
                      key: 'dfa' as ViewMode,
                      label: 'DFA',
                      count: result?.dfa.states.length !== undefined
                        ? (!showTrapState && result.dfa.states.some(s => s.id === 'dfa_dead' || s.label === 'DEAD')
                          ? result.dfa.states.length - 1
                          : result.dfa.states.length)
                        : undefined,
                      enabled: !!result,
                    },
                    {
                      key: 'minimized' as ViewMode,
                      label: 'Minimized DFA',
                      count: result?.minimizedDFA?.states.length !== undefined
                        ? (!showTrapState && result.minimizedDFA.states.some(s => s.id === 'dfa_dead' || s.label === 'DEAD')
                          ? result.minimizedDFA.states.length - 1
                          : result.minimizedDFA.states.length)
                        : undefined,
                      enabled: !!result?.minimizedDFA,
                    },
                  ].map(item => (
                    <button
                      key={item.key}
                      id={`view-${item.key}`}
                      role="tab"
                      aria-selected={!!result && viewMode === item.key}
                      disabled={!item.enabled}
                      title={item.key === 'minimized' && result && !result.minimizedDFA ? 'The DFA is already minimal' : undefined}
                      onClick={() => handleViewModeChange(item.key)}
                      className={`tab ${result && viewMode === item.key ? 'is-active' : ''}`}
                    >
                      {item.label}
                      {item.count !== undefined && <span className="tab-count">{item.count}</span>}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {viewMode !== 'nfa' && result && (result.dfa.states.some(s => s.id === 'dfa_dead' || s.label === 'DEAD') || (result.minimizedDFA?.states.some(s => s.id === 'dfa_dead' || s.label === 'DEAD'))) && (
                    <button
                      type="button"
                      id="toggle-trap-state"
                      className={`tab ${showTrapState ? 'is-active' : ''}`}
                      onClick={() => setShowTrapState(prev => !prev)}
                      title={showTrapState ? "Switch to clean textbook view (hides DEAD trap state)" : "Show complete DFA with DEAD trap state"}
                      style={{ height: 26, fontSize: 11.5, padding: '0 8px', borderRadius: 4, cursor: 'pointer' }}
                    >
                      {showTrapState ? "Hide Trap State" : "Show Trap State"}
                    </button>
                  )}
                  <Legend />
                </div>
              </div>

              <div className="canvas-wrap">
                {result ? (
                  <ReactFlowProvider>
                    <AutomataCanvas
                      mode={viewMode === 'nfa' ? 'nfa' : 'dfa'}
                      nfa={viewMode === 'nfa' ? (currentNFA ?? result.nfa) : null}
                      dfa={viewMode !== 'nfa' ? (currentDFA ?? (viewMode === 'minimized' ? result.minimizedDFA : result.dfa)) : null}
                      fullNFA={result.nfa}
                      fullDFA={viewMode === 'minimized' ? result.minimizedDFA : result.dfa}
                      highlightedStates={highlightedStates}
                      highlightedTransitions={highlightedTransitions}
                      activeState={viewMode !== 'nfa' ? simHighlight.stateId : null}
                      activeTransition={viewMode !== 'nfa' ? simHighlight.transition : null}
                      showTrapState={showTrapState}
                      onStateClick={setSelectedState}
                    />
                    {selectedState && (
                      <StateInfoPanel
                        selectedState={selectedState}
                        nfa={inspectorNFA}
                        dfa={viewMode !== 'nfa' ? inspectorDFA : undefined}
                        mode={viewMode === 'nfa' ? 'nfa' : 'dfa'}
                        onClose={() => setSelectedState(null)}
                      />
                    )}
                  </ReactFlowProvider>
                ) : (
                  <EmptyCanvas />
                )}
              </div>
            </div>

            {/* Step panel */}
            <aside className="panel step-panel" aria-label={panelTitle}>
              <div className="panel-header">
                <span className="panel-title">{panelTitle}</span>
                {hasSteps && (
                  <span className="step-counter">
                    Step {currentStep + 1} of {totalSteps}
                  </span>
                )}
              </div>

              <div className="panel-body">{renderStepPanel()}</div>

              {hasSteps && (
                <div className="step-controls">
                  <div className="progress" aria-hidden>
                    <span style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }} />
                  </div>
                  <div className="step-controls-row">
                    <button
                      id="step-first"
                      className="btn btn-sm btn-icon"
                      onClick={() => { setIsAutoPlaying(false); setCurrentStep(0); }}
                      disabled={currentStep === 0}
                      title="First step"
                      aria-label="First step"
                    >
                      |‹
                    </button>
                    <button
                      id="step-prev"
                      className="btn btn-sm"
                      onClick={() => { setIsAutoPlaying(false); setCurrentStep(prev => Math.max(0, prev - 1)); }}
                      disabled={currentStep === 0}
                    >
                      Previous
                    </button>
                    <button
                      id="step-next"
                      className="btn btn-sm"
                      onClick={() => { setIsAutoPlaying(false); setCurrentStep(prev => Math.min(totalSteps - 1, prev + 1)); }}
                      disabled={currentStep >= totalSteps - 1}
                    >
                      Next
                    </button>
                    <button
                      id="step-last"
                      className="btn btn-sm btn-icon"
                      onClick={() => { setIsAutoPlaying(false); setCurrentStep(totalSteps - 1); }}
                      disabled={currentStep >= totalSteps - 1}
                      title="Last step"
                      aria-label="Last step"
                    >
                      ›|
                    </button>
                    <span className="spacer" />
                  </div>
                  <div className="step-controls-row">
                    <button
                      id="step-play"
                      className="btn btn-sm"
                      style={{ minWidth: 64 }}
                      onClick={() => {
                        if (!isAutoPlaying && currentStep >= totalSteps - 1) setCurrentStep(0);
                        setIsAutoPlaying(p => !p);
                      }}
                    >
                      {isAutoPlaying ? 'Pause' : 'Play'}
                    </button>
                    <span className="spacer" />
                    <label htmlFor="speed-select" className="step-counter">Speed</label>
                    <select
                      id="speed-select"
                      className="select select-sm"
                      value={autoPlaySpeed}
                      onChange={e => setAutoPlaySpeed(Number(e.target.value))}
                    >
                      {SPEEDS.map(s => (
                        <option key={s.ms} value={s.ms}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </section>

        {/* ------------------------------------------- Transitions / Simulation */}
        <section id="details" className="section" aria-label="Details">
          <div className="container">
            <div className="panel">
              <div className="panel-header">
                <div className="tabs" role="tablist" aria-label="Details">
                  <button
                    id="tab-table"
                    role="tab"
                    aria-selected={detailTab === 'table'}
                    className={`tab ${detailTab === 'table' ? 'is-active' : ''}`}
                    onClick={() => setDetailTab('table')}
                  >
                    Transition Table
                  </button>
                  <button
                    id="tab-simulate"
                    role="tab"
                    aria-selected={detailTab === 'simulate'}
                    className={`tab ${detailTab === 'simulate' ? 'is-active' : ''}`}
                    onClick={() => setDetailTab('simulate')}
                  >
                    String Simulation
                  </button>
                </div>
                {detailTab === 'simulate' && result && (
                  <span className="step-counter">Runs on the complete DFA</span>
                )}
              </div>
              <div className="panel-body">
                {detailTab === 'table' && (
                  result ? (
                    <TransitionTable
                      nfa={viewMode === 'nfa' ? result.nfa : undefined}
                      dfa={viewMode !== 'nfa' ? (viewMode === 'minimized' ? result.minimizedDFA : result.dfa) : undefined}
                      mode={viewMode === 'nfa' ? 'nfa' : 'dfa'}
                      title={
                        viewMode === 'nfa'
                          ? 'ε-NFA Transition Table'
                          : viewMode === 'dfa'
                          ? 'DFA Transition Table'
                          : 'Minimized DFA Transition Table'
                      }
                    />
                  ) : (
                    <p className="placeholder-text">Generate an automaton to view its transition table.</p>
                  )
                )}
                {detailTab === 'simulate' && (
                  <StringSimulator
                    key={`${resultVersion}-${viewMode === 'minimized' ? 'min' : 'dfa'}`}
                    dfa={viewMode === 'minimized' ? (result?.minimizedDFA ?? result?.dfa ?? null) : (result?.dfa ?? null)}
                    onHighlightChange={setSimHighlight}
                    onRun={handleSimulationRun}
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- Methods */}
        <section id="methods" className="section" style={{ borderBottom: 'none' }} aria-labelledby="methods-label">
          <div className="container">
            <span id="methods-label" className="section-label">Construction Methods</span>
            <div className="methods">
              <div className="method">
                <div className="method-stage">Regex → ε-NFA</div>
                <h3 className="method-name">Thompson&apos;s Construction</h3>
                <p>
                  The expression is tokenized, explicit concatenation is inserted, and it is converted to postfix
                  notation. Each symbol yields a two-state fragment; the operators <span className="mono">·</span>,{' '}
                  <span className="mono">|</span>, <span className="mono">*</span>, <span className="mono">+</span> and{' '}
                  <span className="mono">?</span> combine fragments using ε-transitions.
                </p>
              </div>
              <div className="method">
                <div className="method-stage">ε-NFA → DFA</div>
                <h3 className="method-name">Subset Construction & Completion</h3>
                <p>
                  Each DFA state is a set of NFA states. Starting from <span className="mono">ε-closure(q₀)</span>, for every
                  state <span className="mono">T</span> and symbol <span className="mono">a</span> the target{' '}
                  <span className="mono">U = ε-closure(move(T, a))</span> is computed. If any state has missing transitions
                  over alphabet Σ, a non-accepting <span className="mono">DEAD</span> trap state with self-loops is added to ensure
                  a total transition function.
                </p>
              </div>
              <div className="method">
                <div className="method-stage">DFA → Minimized DFA</div>
                <h3 className="method-name">DFA Minimization</h3>
                <p>
                  States are split into accepting and non-accepting partitions, which are refined until no partition can
                  be distinguished by an input symbol. Each remaining partition becomes one state of the minimal DFA.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <div className="container">Principles of Compiler Design — Regex Automata Visualizer</div>
      </footer>
    </div>
  );
}
