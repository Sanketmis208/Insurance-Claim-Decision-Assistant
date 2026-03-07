// src/components/PolicyQA.tsx
import { useState } from 'react'
import { MessageCircle, Search, BookOpen, Layers, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'
import type { PolicyQuestionResponse } from '../services/api'

interface PolicyQAProps {
  isEnabled: boolean
  askFn: (question: string) => Promise<PolicyQuestionResponse>
}

const SAMPLE_QUESTIONS = [
  'What is the waiting period for knee replacement surgery?',
  'Are pre-existing conditions covered in this policy?',
  'What procedures are excluded from coverage?',
  'What is the maximum coverage amount?',
  'How do I file a claim?',
]

interface QAEntry {
  question: string
  response: PolicyQuestionResponse
  id: number
}

export default function PolicyQA({ isEnabled, askFn }: PolicyQAProps) {
  const [question, setQuestion] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [history, setHistory] = useState<QAEntry[]>([])
  const [error, setError] = useState('')
  const [expandedSource, setExpandedSource] = useState<number | null>(null)

  const handleAsk = async () => {
    if (!question.trim() || question.trim().length < 5 || isLoading) return
    setIsLoading(true)
    setError('')
    const q = question.trim()
    setQuestion('')

    try {
      const result = await askFn(q)
      setHistory(prev => [{ question: q, response: result, id: Date.now() }, ...prev])
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : 'Failed to get answer. Please try again.'
      setError(msg ?? 'Request failed.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAsk()
  }

  return (
    <div className="space-y-4">

      {/* Disabled overlay hint */}
      {!isEnabled && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
          <AlertCircle size={14} className="text-yellow-600/70 flex-shrink-0" />
          <p className="text-xs font-body text-slate-500">
            Upload an insurance policy PDF first to enable Q&A
          </p>
        </div>
      )}

      {/* Question Input */}
      <div className={clsx(
        'relative rounded-2xl transition-all duration-300',
        isEnabled
          ? 'shadow-[0_0_0_1px_rgba(201,168,76,0.2)]'
          : 'opacity-50 pointer-events-none shadow-[0_0_0_1px_rgba(100,100,100,0.15)]'
      )}>
        <div className="absolute top-3.5 left-4 text-yellow-600/50">
          <Search size={15} />
        </div>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isEnabled || isLoading}
          placeholder="Ask anything about your policy document..."
          rows={3}
          className="w-full bg-[#0d1117] rounded-2xl pl-10 pr-4 pt-3.5 pb-3.5 text-slate-200 placeholder-slate-700 font-body text-sm leading-relaxed resize-none border-0 focus:ring-0 focus:outline-none"
        />
      </div>

      {/* Sample questions */}
      {isEnabled && history.length === 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
            Suggested questions
          </p>
          {SAMPLE_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => setQuestion(q)}
              disabled={isLoading}
              className="w-full text-left text-xs text-slate-500 hover:text-yellow-600/80 bg-[#0d1117] hover:bg-[#161b22] border border-slate-800 hover:border-yellow-800/30 rounded-xl px-3.5 py-2.5 transition-all duration-200 font-body"
            >
              <span className="text-yellow-700/50 font-mono mr-2">→</span>{q}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-950/20 border border-red-900/30">
          <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
          <p className="text-xs font-body text-red-400">{error}</p>
        </div>
      )}

      {/* Ask button */}
      <button
        onClick={handleAsk}
        disabled={!isEnabled || !question.trim() || isLoading}
        className={clsx(
          'w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl font-body font-medium text-sm transition-all duration-300',
          !isEnabled || !question.trim() || isLoading
            ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800 text-white hover:shadow-[0_0_25px_rgba(59,130,246,0.2)] hover:scale-[1.01]'
        )}
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            Searching policy...
          </>
        ) : (
          <>
            <MessageCircle size={15} />
            Ask Policy AI
          </>
        )}
      </button>

      {/* Q&A History */}
      {history.length > 0 && (
        <div className="space-y-3 mt-2">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-800/60" />
            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest px-2">
              Answers ({history.length})
            </span>
            <div className="h-px flex-1 bg-slate-800/60" />
          </div>

          {history.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-slate-800/60 bg-[#0d1117] overflow-hidden animate-fade-up"
            >
              {/* Question header */}
              <div className="px-4 py-3 border-b border-slate-800/40 bg-slate-900/40 flex items-start gap-2.5">
                <MessageCircle size={13} className="text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs font-body text-slate-300 leading-relaxed">{entry.question}</p>
              </div>

              {/* Answer */}
              <div className="px-4 py-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <BookOpen size={13} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-1.5">
                      AI Answer
                    </p>
                    <p className="text-sm font-body text-slate-200 leading-relaxed">
                      {entry.response.answer}
                    </p>
                  </div>
                </div>

                {/* Metadata row */}
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Layers size={11} className="text-slate-600" />
                    <span className="text-[10px] font-mono text-slate-600">
                      {entry.response.chunks_used} chunk{entry.response.chunks_used !== 1 ? 's' : ''} retrieved
                    </span>
                  </div>
                  <div className="w-px h-3 bg-slate-800" />
                  <span className="text-[10px] font-mono text-slate-700">
                    Groq LLaMA 3.3 70B
                  </span>
                </div>

                {/* Source context toggle */}
                {entry.response.source_context && (
                  <div>
                    <button
                      onClick={() => setExpandedSource(
                        expandedSource === entry.id ? null : entry.id
                      )}
                      className="flex items-center gap-1.5 text-[10px] font-mono text-slate-600 hover:text-yellow-600 transition-colors uppercase tracking-wider"
                    >
                      {expandedSource === entry.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      {expandedSource === entry.id ? 'Hide' : 'Show'} source excerpts
                    </button>

                    {expandedSource === entry.id && (
                      <div className="mt-2 p-3 rounded-xl bg-slate-900/60 border border-slate-800/50 animate-fade-in">
                        <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-2">
                          Retrieved Policy Sections
                        </p>
                        <pre className="text-[11px] font-mono text-slate-500 leading-relaxed whitespace-pre-wrap break-words">
                          {entry.response.source_context}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}