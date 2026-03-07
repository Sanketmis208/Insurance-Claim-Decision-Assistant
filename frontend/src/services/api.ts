// src/services/api.ts
import axios from 'axios'

// ── Existing Claim Types ───────────────────────────────────────────────────

export interface RuleEvaluation {
  rule_name: string
  passed: boolean
  detail: string
}

export interface ExtractedParameters {
  age: number
  medical_procedure: string
  location: string | null
  policy_duration_years: number
  coverage_amount: number
  claimed_amount: number | null
  pre_existing_condition: boolean | null
  additional_notes: string | null
}

export interface ClaimDecisionResponse {
  decision: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW'
  approved_amount: number
  justification: string
  rule_evaluations: RuleEvaluation[]
  extracted_parameters: ExtractedParameters | null
}

// ── New RAG Types ──────────────────────────────────────────────────────────

export interface PolicyUploadResponse {
  message: string
  filename: string
  pages_loaded: number
  chunks_stored: number
  chunk_size: number
  chunk_overlap: number
}

export interface PolicyQuestionResponse {
  answer: string
  source_context: string
  chunks_used: number
}

export interface PolicyStatusResponse {
  has_documents: boolean
  document_count: number
  message: string
}

// ── Axios Client ───────────────────────────────────────────────────────────

const apiClient = axios.create({
  baseURL: 'http://localhost:8002',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
})

// ── API Functions ──────────────────────────────────────────────────────────

export async function evaluateClaim(query: string): Promise<ClaimDecisionResponse> {
  const response = await apiClient.post<ClaimDecisionResponse>(
    '/api/v1/evaluate-claim', { query }
  )
  return response.data
}

export async function uploadPolicy(file: File): Promise<PolicyUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await apiClient.post<PolicyUploadResponse>(
    '/api/v1/upload-policy',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return response.data
}

export async function askPolicy(question: string): Promise<PolicyQuestionResponse> {
  const response = await apiClient.post<PolicyQuestionResponse>(
    '/api/v1/ask-policy', { question }
  )
  return response.data
}

export async function getPolicyStatus(): Promise<PolicyStatusResponse> {
  const response = await apiClient.get<PolicyStatusResponse>('/api/v1/policy-status')
  return response.data
}