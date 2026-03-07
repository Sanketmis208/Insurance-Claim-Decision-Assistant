// src/pages/Dashboard.tsx
import { useState, useEffect } from 'react'
import ThemeToggle from '../components/ThemeToggle'  // ← removed useTheme import

import {
  Shield, Zap, Brain, GitBranch,
  FileSearch, ClipboardCheck, Database, ChevronRight
} from 'lucide-react'
import clsx from 'clsx'
import ClaimForm from '../components/ClaimForm'
import DecisionCard from '../components/DecisionCard'
import Loader from '../components/Loader'
import PolicyUpload from '../components/PolicyUpload'
import PolicyQA from '../components/PolicyQA'
import {
  evaluateClaim,
  uploadPolicy,
  askPolicy,
  getPolicyStatus,
  type ClaimDecisionResponse,
  type PolicyUploadResponse,
} from '../services/api'

type Tab = 'claim' | 'rag'
type ClaimState = 'idle' | 'loading' | 'result' | 'error'

export default function Dashboard() {
  // ← removed: const { theme, toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<Tab>('claim')

  // ── Claim state ──
  const [claimState, setClaimState] = useState<ClaimState>('idle')
  const [claimResult, setClaimResult] = useState<ClaimDecisionResponse | null>(null)
  const [claimError, setClaimError] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')

  // ── RAG state ──
  const [policyLoaded, setPolicyLoaded] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [policyInfo, setPolicyInfo] = useState<PolicyUploadResponse | null>(null)

  // Check policy status on load
  useEffect(() => {
    getPolicyStatus()
      .then((s) => setPolicyLoaded(s.has_documents))
      .catch(() => {})
  }, [])

  const handleClaimSubmit = async (query: string) => {
    setClaimState('loading')
    setClaimResult(null)
    setClaimError('')
    setSubmittedQuery(query)
    try {
      const data = await evaluateClaim(query)
      setClaimResult(data)
      setClaimState('result')
    } catch (err: unknown) {
      setClaimState('error')
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : 'Could not connect to backend on port 8002.'
      setClaimError(msg ?? 'Unknown error.')
    }
  }

  const handleClaimReset = () => {
    setClaimState('idle')
    setClaimResult(null)
    setClaimError('')
    setSubmittedQuery('')
  }

  const handleUploadSuccess = (data: PolicyUploadResponse) => {
    setPolicyLoaded(true)
    setPolicyInfo(data)
  }

  const tabs = [
    {
      id: 'claim' as Tab,
      label: 'Claim Evaluator',
      icon: <ClipboardCheck size={14} />,
      desc: 'AI rule-based decision',
    },
    {
      id: 'rag' as Tab,
      label: 'Policy Q&A',
      icon: <FileSearch size={14} />,
      desc: 'RAG document search',
      badge: policyLoaded,
    },
  ]

  return (
    <div className="noise min-h-screen bg-[#0a0d12] relative overflow-x-hidden">

      {/* ── Background ── */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-60 -left-60 w-[500px] h-[500px] rounded-full bg-yellow-700/4 blur-3xl" />
        <div className="absolute -bottom-60 -right-60 w-[500px] h-[500px] rounded-full bg-blue-700/4 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: `linear-gradient(rgba(201,168,76,0.6) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(201,168,76,0.6) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10 border-b border-slate-800/60 bg-[#0a0d12]/90 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-600 to-yellow-800 flex items-center justify-center shadow-lg shadow-yellow-900/30">
              <Shield size={15} className="text-black" />
            </div>
            <div>
              <h1 className="font-display text-sm font-semibold text-slate-200 leading-none">ClaimAI</h1>
              <p className="text-[10px] font-mono text-slate-600 mt-0.5 tracking-wider">INSURANCE ASSISTANT</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Policy status pill */}
            <div className={clsx(
              'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-300',
              policyLoaded
                ? 'bg-blue-950/40 border-blue-900/40'
                : 'bg-slate-900/60 border-slate-800/60'
            )}>
              <Database size={11} className={policyLoaded ? 'text-blue-400' : 'text-slate-600'} />
              <span className={clsx(
                'text-xs font-mono tracking-wider',
                policyLoaded ? 'text-blue-400' : 'text-slate-600'
              )}>
                {policyLoaded ? 'POLICY LOADED' : 'NO POLICY'}
              </span>
            </div>

            {/* API live */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-950/40 border border-green-900/40">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-mono text-green-500 tracking-wider">API LIVE</span>
            </div>

            {/* ← removed theme/onToggle props, ThemeToggle manages itself */}
            <ThemeToggle />
            
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px w-6 bg-yellow-700/60" />
              <span className="text-xs font-mono text-yellow-700 tracking-widest uppercase">
                Full-Stack AI System
              </span>
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-bold leading-tight mb-3">
              <span className="text-slate-100">Insurance Claim</span><br />
              <span className="text-gold-gradient">Decision Assistant</span>
            </h2>
            <p className="text-slate-500 font-body text-sm leading-relaxed max-w-lg">
              Two AI engines in one platform — instant rule-based claim decisions
              and RAG-powered policy document intelligence.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
            {[
              { icon: <Brain size={12} />, label: 'LLaMA 3.3 70B', color: 'text-yellow-600' },
              { icon: <GitBranch size={12} />, label: '5 Policy Rules', color: 'text-blue-500' },
              { icon: <Database size={12} />, label: 'ChromaDB RAG', color: 'text-emerald-500' },
              { icon: <Zap size={12} />, label: 'Real-time', color: 'text-purple-400' },
            ].map(({ icon, label, color }) => (
              <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1117] border border-slate-800/60">
                <span className={color}>{icon}</span>
                <span className="text-xs font-mono text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tab Navigation ── */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-6">
        <div className="flex gap-2 p-1.5 bg-[#0d1117] border border-slate-800/60 rounded-2xl w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 relative',
                activeTab === tab.id
                  ? 'bg-slate-800 text-slate-100 shadow-lg'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'
              )}
            >
              <span className={clsx(
                'transition-colors',
                activeTab === tab.id
                  ? tab.id === 'claim' ? 'text-yellow-500' : 'text-blue-400'
                  : 'text-slate-600'
              )}>
                {tab.icon}
              </span>
              <div className="text-left">
                <p className="text-xs font-body font-semibold leading-none">{tab.label}</p>
                <p className={clsx(
                  'text-[10px] font-mono mt-0.5 leading-none',
                  activeTab === tab.id ? 'text-slate-500' : 'text-slate-700'
                )}>
                  {tab.desc}
                </p>
              </div>
              {tab.badge && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 absolute top-2 right-2" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pb-20">

        {/* ════ TAB 1: Claim Evaluator ════ */}
        {activeTab === 'claim' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in">

            {/* Input panel */}
            <div className="rounded-2xl border border-slate-800/60 bg-[#0d1117] p-6">
              <SectionHeader icon={<ClipboardCheck size={13} className="text-yellow-600" />} label="Submit Claim" />
              <ClaimForm onSubmit={handleClaimSubmit} isLoading={claimState === 'loading'} />
            </div>

            {/* Result panel */}
            <div className="rounded-2xl border border-slate-800/60 bg-[#0d1117] p-6 min-h-[420px]">
              <SectionHeader icon={<ChevronRight size={13} className="text-yellow-600" />} label="Decision Output" />

              {claimState === 'idle' && (
                <EmptyState icon={<Shield size={28} className="text-slate-700" />} message="Submit a claim query to see the AI decision" />
              )}
              {claimState === 'loading' && (
                <div className="flex items-center justify-center min-h-64"><Loader /></div>
              )}
              {claimState === 'result' && claimResult && (
                <div>
                  {submittedQuery && (
                    <div className="mb-4 p-3 rounded-xl bg-slate-900/50 border border-slate-800/50">
                      <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-1">Query</p>
                      <p className="text-xs text-slate-500 font-body line-clamp-2">{submittedQuery}</p>
                    </div>
                  )}
                  <DecisionCard data={claimResult} />
                  <button onClick={handleClaimReset}
                    className="mt-5 w-full py-2.5 rounded-xl text-xs font-mono text-slate-600 hover:text-slate-400 border border-slate-800/60 hover:border-slate-700 transition-all duration-200 tracking-wider uppercase">
                    ← New Evaluation
                  </button>
                </div>
              )}
              {claimState === 'error' && (
                <div className="flex flex-col items-center justify-center gap-4 h-64">
                  <div className="w-14 h-14 rounded-2xl bg-red-950/30 border border-red-900/40 flex items-center justify-center">
                    <Shield size={24} className="text-red-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-body font-medium text-red-400 mb-1.5">Evaluation Failed</p>
                    <p className="text-xs text-slate-500 font-body max-w-xs">{claimError}</p>
                  </div>
                  <button onClick={handleClaimReset}
                    className="px-5 py-2 rounded-xl text-xs font-mono text-slate-500 hover:text-slate-300 border border-slate-800 transition-all">
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════ TAB 2: Policy RAG ════ */}
        {activeTab === 'rag' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in">

            {/* Upload panel */}
            <div className="rounded-2xl border border-slate-800/60 bg-[#0d1117] p-6">
              <SectionHeader icon={<Database size={13} className="text-yellow-600" />} label="Upload Policy PDF" />

              {/* Pipeline explainer */}
              <div className="mb-5 grid grid-cols-4 gap-1">
                {[
                  { step: '01', label: 'Upload PDF' },
                  { step: '02', label: 'Chunk Text' },
                  { step: '03', label: 'Embed' },
                  { step: '04', label: 'ChromaDB' },
                ].map(({ step, label }, i, arr) => (
                  <div key={step} className="flex items-center gap-1">
                    <div className="flex-1 text-center">
                      <div className="text-[10px] font-mono text-yellow-700/60">{step}</div>
                      <div className="text-[9px] font-mono text-slate-600 mt-0.5">{label}</div>
                    </div>
                    {i < arr.length - 1 && (
                      <ChevronRight size={10} className="text-slate-700 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              <PolicyUpload
                onUploadSuccess={handleUploadSuccess}
                isLoading={uploadLoading}
                setIsLoading={setUploadLoading}
                uploadFn={uploadPolicy}
              />

              {/* Current policy info */}
              {policyLoaded && !policyInfo && (
                <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-950/20 border border-blue-900/30">
                  <Database size={13} className="text-blue-500" />
                  <p className="text-xs font-mono text-blue-500">
                    Policy already loaded in vector DB
                  </p>
                </div>
              )}
            </div>

            {/* Q&A panel */}
            <div className="rounded-2xl border border-slate-800/60 bg-[#0d1117] p-6">
              <SectionHeader icon={<FileSearch size={13} className="text-blue-400" />} label="Ask Policy AI" />

              {/* RAG pipeline hint */}
              <div className="mb-4 grid grid-cols-3 gap-1">
                {[
                  { step: '01', label: 'Embed Q' },
                  { step: '02', label: 'Search DB' },
                  { step: '03', label: 'LLM Answer' },
                ].map(({ step, label }, i, arr) => (
                  <div key={step} className="flex items-center gap-1">
                    <div className="flex-1 text-center">
                      <div className="text-[10px] font-mono text-blue-700/60">{step}</div>
                      <div className="text-[9px] font-mono text-slate-600 mt-0.5">{label}</div>
                    </div>
                    {i < arr.length - 1 && (
                      <ChevronRight size={10} className="text-slate-700 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              <PolicyQA isEnabled={policyLoaded} askFn={askPolicy} />
            </div>
          </div>
        )}

        {/* ── How It Works ── */}
        <div className="mt-8 rounded-2xl border border-slate-800/60 bg-[#0d1117] p-6">
          <p className="text-xs font-mono text-slate-600 tracking-widest uppercase mb-5">System Architecture</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                icon: <Brain size={16} />,
                title: 'NLU Extraction',
                desc: 'LLaMA 3.3 70B extracts age, procedure, location, duration & coverage from natural language.',
                color: 'text-yellow-400', bg: 'bg-yellow-950/20 border-yellow-900/30',
              },
              {
                icon: <GitBranch size={16} />,
                title: 'Rule Engine',
                desc: '5 configurable policy rules: duration, waiting periods, coverage limits, age & pre-existing.',
                color: 'text-orange-400', bg: 'bg-orange-950/20 border-orange-900/30',
              },
              {
                icon: <Database size={16} />,
                title: 'Vector Store',
                desc: 'Policy PDF chunked, embedded with MiniLM-L6-v2, stored in ChromaDB for semantic retrieval.',
                color: 'text-blue-400', bg: 'bg-blue-950/20 border-blue-900/30',
              },
              {
                icon: <FileSearch size={16} />,
                title: 'RAG Pipeline',
                desc: 'Question embedded → top-3 chunks retrieved → context + question sent to LLM for grounded answer.',
                color: 'text-emerald-400', bg: 'bg-emerald-950/20 border-emerald-900/30',
              },
            ].map(({ icon, title, desc, color, bg }) => (
              <div key={title} className={`p-4 rounded-xl border ${bg}`}>
                <span className={`${color} mb-3 block`}>{icon}</span>
                <h3 className="font-body font-semibold text-slate-200 text-sm mb-1.5">{title}</h3>
                <p className="text-xs text-slate-500 font-body leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-slate-800/60 py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-xs font-mono text-slate-700">
            FastAPI · LangChain · Groq · ChromaDB · React · TypeScript
          </p>
          <p className="text-xs font-mono text-slate-700">Portfolio Project</p>
        </div>
      </footer>
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <div className="h-px flex-1 bg-slate-800/80" />
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-mono text-slate-600 tracking-widest uppercase">{label}</span>
      </div>
      <div className="h-px flex-1 bg-slate-800/80" />
    </div>
  )
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
        {icon}
      </div>
      <p className="text-sm font-body text-slate-600 text-center max-w-48">{message}</p>
    </div>
  )
}