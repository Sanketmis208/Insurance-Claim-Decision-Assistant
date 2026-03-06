export default function Loader() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      {/* Orbital spinner */}
      <div className="relative w-14 h-14">
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-yellow-500/80 animate-spin" />
        {/* Middle ring */}
        <div
          className="absolute inset-2 rounded-full border-2 border-transparent border-t-yellow-400/50 animate-spin"
          style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}
        />
        {/* Core */}
        <div className="absolute inset-4 rounded-full bg-yellow-500/10 animate-pulse-slow" />
      </div>

      {/* Animated dots */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-body text-yellow-600/80 tracking-widest uppercase">
          Analysing Claim
        </span>
        <span className="flex gap-1 ml-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-yellow-500/70 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      </div>

      {/* Steps hint */}
      <div className="flex flex-col items-center gap-1 mt-1">
        {['Extracting parameters via LLM', 'Running policy rules', 'Generating decision'].map(
          (step, i) => (
            <p
              key={i}
              className="text-xs text-slate-600 font-mono animate-pulse-slow"
              style={{ animationDelay: `${i * 0.4}s` }}
            >
              {step}
            </p>
          )
        )}
      </div>
    </div>
  )
}