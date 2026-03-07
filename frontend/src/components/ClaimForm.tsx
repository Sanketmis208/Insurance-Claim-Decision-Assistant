import { useState } from 'react'
import { Send, Sparkles, FileText } from 'lucide-react'
import clsx from 'clsx'

interface ClaimFormProps {
  onSubmit: (query: string) => void
  isLoading: boolean
}

const EXAMPLE_QUERIES = [
  "I am 46 years old. I had knee replacement surgery in Mumbai. My policy started 3 years ago with a coverage of 5 lakhs. Can my claim be approved?",
  "I am 35 years old. I need cataract surgery. My policy started 6 months ago with coverage of 3 lakhs.",
  "I am 55 years old. I had heart bypass surgery in Delhi. My policy is 4 years old with 10 lakhs coverage.",
  "I am 28 years old. I want cosmetic nose surgery. My policy started 2 years ago with 8 lakhs coverage.",
]

export default function ClaimForm({ onSubmit, isLoading }: ClaimFormProps) {
  const [query, setQuery] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [focused, setFocused] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value)
    setCharCount(e.target.value.length)
  }

  const handleSubmit = () => {
    if (query.trim().length < 10) return
    onSubmit(query.trim())
  }

  const handleExample = (example: string) => {
    setQuery(example)
    setCharCount(example.length)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
  }

  const isEmpty = query.trim().length < 10

  return (
    <div className="space-y-5 animate-fade-up" style={{ animationFillMode: 'both' }}>
      <div className="flex items-center gap-2">
        <FileText size={14} className="text-yellow-600" />
        <span className="text-xs font-mono text-slate-500 tracking-widest uppercase">
          Claim Query
        </span>
      </div>

      <div className={clsx(
        'relative rounded-2xl transition-all duration-300',
        focused
          ? 'shadow-[0_0_0_1px_rgba(201,168,76,0.5),0_0_30px_rgba(201,168,76,0.08)]'
          : 'shadow-[0_0_0_1px_rgba(201,168,76,0.15)]'
      )}>
        <div className="absolute top-4 left-4 text-yellow-600/40">
          <Sparkles size={16} />
        </div>
        <textarea
          value={query}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder="Describe your insurance claim in plain English..."
          rows={6}
          className={clsx(
            'w-full bg-[#0d1117] rounded-2xl pl-10 pr-5 pt-4 pb-4',
            'text-slate-200 placeholder-slate-700 font-body text-sm leading-relaxed',
            'resize-none transition-colors duration-200 border-0 focus:ring-0',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
        />
        <div className="absolute bottom-3 right-4 text-xs font-mono text-slate-700">
          {charCount > 0 && <span>{charCount}</span>}
        </div>
      </div>

      <p className="text-xs text-slate-700 font-mono">⌘ + Enter to submit</p>

      <div className="space-y-2">
        <p className="text-xs font-mono text-slate-600 tracking-widest uppercase">Try an example</p>
        <div className="grid grid-cols-1 gap-2">
          {EXAMPLE_QUERIES.map((ex, i) => (
            <button
              key={i}
              onClick={() => handleExample(ex)}
              disabled={isLoading}
              className={clsx(
                'text-left text-xs text-slate-500 hover:text-yellow-600/80',
                'bg-[#0d1117] hover:bg-[#161b22]',
                'border border-slate-800 hover:border-yellow-800/40',
                'rounded-xl px-4 py-2.5 transition-all duration-200 truncate font-body',
                isLoading && 'opacity-40 cursor-not-allowed'
              )}
            >
              <span className="text-yellow-700/60 font-mono mr-2">#{i + 1}</span>
              {ex.substring(0, 80)}…
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isEmpty || isLoading}
        className={clsx(
          'w-full flex items-center justify-center gap-3',
          'py-4 px-6 rounded-2xl font-body font-medium text-sm tracking-wide transition-all duration-300',
          isEmpty || isLoading
            ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
            : 'bg-gradient-to-r from-yellow-700 via-yellow-600 to-yellow-700 text-black hover:shadow-[0_0_30px_rgba(201,168,76,0.3)] hover:scale-[1.01] active:scale-[0.99]'
        )}
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Send size={15} />
            Evaluate Claim
          </>
        )}
      </button>
    </div>
  )
}