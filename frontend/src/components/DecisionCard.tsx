import { CheckCircle2, XCircle, AlertCircle, ChevronRight, User, Stethoscope, MapPin, Clock, Shield, IndianRupee } from 'lucide-react'
import clsx from 'clsx'
import type { ClaimDecisionResponse } from '../services/api'

interface DecisionCardProps {
  data: ClaimDecisionResponse
}

function formatINR(amount: number): string {
  if (amount >= 100000) {
    const lakhs = amount / 100000
    return `₹${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(1)}L`
  }
  return `₹${amount.toLocaleString('en-IN')}`
}

function formatINRFull(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

export default function DecisionCard({ data }: DecisionCardProps) {
  const isApproved = data.decision === 'APPROVED'
  const isRejected = data.decision === 'REJECTED'
  const isPending = data.decision === 'PENDING_REVIEW'
  const passedRules = data.rule_evaluations.filter((r) => r.passed).length
  const totalRules = data.rule_evaluations.length

  return (
    <div className="space-y-5 animate-fade-up" style={{ animationFillMode: 'both' }}>

      {/* ── Decision Hero ── */}
      <div
        className={clsx(
          'relative rounded-2xl overflow-hidden border transition-all duration-500',
          isApproved && 'glow-green',
          isRejected && 'glow-red',
        )}
        style={{
          borderColor: isApproved ? 'rgba(34,197,94,0.25)'
            : isRejected ? 'rgba(239,68,68,0.25)'
            : 'rgba(234,179,8,0.25)',
          background: isApproved
            ? 'linear-gradient(135deg, rgba(20,83,45,0.25) 0%, var(--bg-surface) 50%)'
            : isRejected
            ? 'linear-gradient(135deg, rgba(127,29,29,0.25) 0%, var(--bg-surface) 50%)'
            : 'linear-gradient(135deg, rgba(113,63,18,0.2) 0%, var(--bg-surface) 50%)',
        }}
      >
        {/* Corner accent */}
        <div className={clsx(
          'absolute top-0 right-0 w-32 h-32 opacity-10 rounded-bl-full',
          isApproved && 'bg-green-400',
          isRejected && 'bg-red-400',
          isPending && 'bg-yellow-400',
        )} />

        <div className="relative p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs font-mono tracking-widest uppercase mb-2"
                style={{ color: 'var(--text-muted)' }}>
                Claim Decision
              </p>
              <div className="flex items-center gap-3">
                {isApproved && <><CheckCircle2 size={28} className="text-green-500" /><span className="font-display text-3xl font-bold text-green-500">APPROVED</span></>}
                {isRejected && <><XCircle size={28} className="text-red-500" /><span className="font-display text-3xl font-bold text-red-500">REJECTED</span></>}
                {isPending && <><AlertCircle size={28} className="text-yellow-500" /><span className="font-display text-3xl font-bold text-yellow-500">PENDING</span></>}
              </div>
            </div>

            {/* Rules badge */}
            <div
              className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl border"
              style={{
                borderColor: isApproved ? 'rgba(34,197,94,0.3)'
                  : isRejected ? 'rgba(239,68,68,0.3)'
                  : 'rgba(234,179,8,0.3)',
                backgroundColor: isApproved ? 'rgba(34,197,94,0.08)'
                  : isRejected ? 'rgba(239,68,68,0.08)'
                  : 'rgba(234,179,8,0.08)',
              }}
            >
              <span className={clsx(
                'text-xl font-display font-bold',
                isApproved && 'text-green-500',
                isRejected && 'text-red-500',
                isPending && 'text-yellow-500',
              )}>
                {passedRules}/{totalRules}
              </span>
              <span className="text-[9px] font-mono uppercase tracking-wider mt-0.5"
                style={{ color: 'var(--text-muted)' }}>
                Rules
              </span>
            </div>
          </div>

          {/* Approved amount */}
          {isApproved && data.approved_amount > 0 && (
            <div
              className="mb-5 p-4 rounded-xl border"
              style={{
                backgroundColor: 'rgba(34,197,94,0.06)',
                borderColor: 'rgba(34,197,94,0.2)',
              }}
            >
              <p className="text-xs font-mono tracking-widest uppercase mb-1"
                style={{ color: 'var(--text-muted)' }}>
                Approved Amount
              </p>
              <div className="flex items-baseline gap-2">
                <IndianRupee size={20} className="text-green-500 mb-0.5" />
                <span className="font-display text-4xl font-bold text-green-500">
                  {formatINR(data.approved_amount)}
                </span>
                <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
                  ({formatINRFull(data.approved_amount)})
                </span>
              </div>
              <p className="text-xs mt-1.5 font-body" style={{ color: 'var(--text-muted)' }}>
                After 10% co-pay deductible applied
              </p>
            </div>
          )}

          {/* Justification */}
          <div
            className="p-4 rounded-xl border"
            style={{
              backgroundColor: 'var(--bg-surface-2)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <p className="text-xs font-mono tracking-widest uppercase mb-2"
              style={{ color: 'var(--text-muted)' }}>
              Justification
            </p>
            <p className="text-sm font-body leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {data.justification}
            </p>
          </div>
        </div>
      </div>

      {/* ── Extracted Parameters ── */}
      {data.extracted_parameters && (
        <div
          className="rounded-2xl overflow-hidden border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border)',
          }}
        >
          <div
            className="px-5 py-3.5 border-b flex items-center gap-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <Shield size={13} className="text-yellow-600" />
            <span className="text-xs font-mono tracking-widest uppercase"
              style={{ color: 'var(--text-secondary)' }}>
              Extracted Parameters
            </span>
          </div>

          <div className="p-5 grid grid-cols-2 gap-3">
            {[
              { icon: <User size={13} />, label: 'Age', value: `${data.extracted_parameters.age} Years` },
              { icon: <Stethoscope size={13} />, label: 'Procedure', value: data.extracted_parameters.medical_procedure },
              { icon: <MapPin size={13} />, label: 'Location', value: data.extracted_parameters.location ?? 'Not specified' },
              { icon: <Clock size={13} />, label: 'Policy Duration', value: `${data.extracted_parameters.policy_duration_years} Year(s)` },
              { icon: <IndianRupee size={13} />, label: 'Coverage', value: formatINRFull(data.extracted_parameters.coverage_amount) },
              { icon: <IndianRupee size={13} />, label: 'Claimed', value: data.extracted_parameters.claimed_amount ? formatINRFull(data.extracted_parameters.claimed_amount) : 'Full Coverage' },
            ].map(({ icon, label, value }) => (
              <div
                key={label}
                className="p-3 rounded-xl border"
                style={{
                  backgroundColor: 'var(--bg-surface-2)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span style={{ color: 'var(--gold)' }}>{icon}</span>
                  <span className="text-[10px] font-mono tracking-wider uppercase"
                    style={{ color: 'var(--text-muted)' }}>
                    {label}
                  </span>
                </div>
                <p className="text-sm font-body capitalize truncate"
                  style={{ color: 'var(--gold)' }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rule Evaluations ── */}
      <div
        className="rounded-2xl overflow-hidden border"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border)',
        }}
      >
        <div
          className="px-5 py-3.5 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <ChevronRight size={13} className="text-yellow-600" />
            <span className="text-xs font-mono tracking-widest uppercase"
              style={{ color: 'var(--text-secondary)' }}>
              Rule Breakdown
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {passedRules} / {totalRules} passed
          </span>
        </div>

        <div style={{ borderColor: 'var(--border)' }}>
          {data.rule_evaluations.map((rule, idx) => (
            <div
              key={idx}
              className={clsx('px-5 py-4 flex items-start gap-3 transition-colors duration-150 border-b last:border-b-0')}
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = rule.passed
                  ? 'rgba(34,197,94,0.04)'
                  : 'rgba(239,68,68,0.04)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
              }}
            >
              <div className="mt-0.5 flex-shrink-0">
                {rule.passed
                  ? <CheckCircle2 size={16} className="text-green-500" />
                  : <XCircle size={16} className="text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-body font-medium" style={{ color: 'var(--text-primary)' }}>
                    {rule.rule_name}
                  </p>
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded-md border"
                    style={{
                      color: rule.passed ? '#22c55e' : '#ef4444',
                      borderColor: rule.passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
                      backgroundColor: rule.passed ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                    }}
                  >
                    {rule.passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <p className="text-xs font-body leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {rule.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}