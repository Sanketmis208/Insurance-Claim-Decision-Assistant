// src/components/PolicyUpload.tsx
import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, CheckCircle2, AlertCircle, X, Database } from 'lucide-react'
import clsx from 'clsx'
import type { PolicyUploadResponse } from '../services/api'

interface PolicyUploadProps {
  onUploadSuccess: (data: PolicyUploadResponse) => void
  isLoading: boolean
  setIsLoading: (v: boolean) => void
  uploadFn: (file: File) => Promise<PolicyUploadResponse>
}

export default function PolicyUpload({
  onUploadSuccess,
  isLoading,
  setIsLoading,
  uploadFn,
}: PolicyUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<PolicyUploadResponse | null>(null)
  const [error, setError] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted.')
      return
    }
    setSelectedFile(file)
    setError('')
    setUploadResult(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setIsLoading(true)
    setError('')
    try {
      const result = await uploadFn(selectedFile)
      setUploadResult(result)
      onUploadSuccess(result)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : 'Upload failed. Please try again.'
      setError(msg ?? 'Upload failed.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setSelectedFile(null)
    setUploadResult(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-4">

      {/* Success state */}
      {uploadResult ? (
        <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-5 animate-fade-in">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={20} className="text-emerald-400" />
              <div>
                <p className="text-sm font-body font-semibold text-emerald-300">
                  Policy Ingested Successfully
                </p>
                <p className="text-xs text-emerald-600 font-mono mt-0.5">
                  {uploadResult.filename}
                </p>
              </div>
            </div>
            <button onClick={handleClear} className="text-slate-600 hover:text-slate-400 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Pages', value: uploadResult.pages_loaded },
              { label: 'Chunks', value: uploadResult.chunks_stored },
              { label: 'Chunk Size', value: `${uploadResult.chunk_size}c` },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-900/30">
                <p className="text-lg font-display font-bold text-emerald-300">{value}</p>
                <p className="text-[10px] font-mono text-emerald-700 uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Database size={12} className="text-emerald-600" />
            <p className="text-xs font-mono text-emerald-700">
              Stored in ChromaDB · Ready for semantic search
            </p>
          </div>

          {/* Re-upload button */}
          <button
            onClick={handleClear}
            className="mt-3 w-full py-2 rounded-xl text-xs font-mono text-slate-600 hover:text-slate-400 border border-slate-800 hover:border-slate-700 transition-all duration-200 tracking-wider uppercase"
          >
            Upload Different Policy
          </button>
        </div>
      ) : (
        <>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              'relative rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer',
              'flex flex-col items-center justify-center gap-3 p-8',
              dragOver
                ? 'border-yellow-600/60 bg-yellow-950/10'
                : selectedFile
                  ? 'border-yellow-700/40 bg-yellow-950/5'
                  : 'border-slate-700/50 hover:border-slate-600/60 bg-[#0a0d12]'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleInputChange}
              className="hidden"
            />

            {selectedFile ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-yellow-950/40 border border-yellow-800/40 flex items-center justify-center">
                  <FileText size={22} className="text-yellow-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-body font-medium text-slate-200">{selectedFile.name}</p>
                  <p className="text-xs font-mono text-slate-600 mt-0.5">
                    {(selectedFile.size / 1024).toFixed(1)} KB · Ready to upload
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className={clsx(
                  'w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300',
                  dragOver ? 'bg-yellow-700/20 border border-yellow-600/40' : 'bg-slate-900 border border-slate-700'
                )}>
                  <Upload size={20} className={dragOver ? 'text-yellow-500' : 'text-slate-600'} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-body text-slate-400">
                    Drop your policy PDF here
                  </p>
                  <p className="text-xs font-mono text-slate-700 mt-1">
                    or click to browse · PDF only
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-950/20 border border-red-900/30">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-xs font-body text-red-400">{error}</p>
            </div>
          )}

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isLoading}
            className={clsx(
              'w-full flex items-center justify-center gap-2.5',
              'py-3.5 px-6 rounded-2xl font-body font-medium text-sm transition-all duration-300',
              !selectedFile || isLoading
                ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                : 'bg-gradient-to-r from-yellow-700 via-yellow-600 to-yellow-700 text-black hover:shadow-[0_0_25px_rgba(201,168,76,0.25)] hover:scale-[1.01]'
            )}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Processing PDF...
              </>
            ) : (
              <>
                <Database size={15} />
                Ingest into Vector DB
              </>
            )}
          </button>
        </>
      )}
    </div>
  )
}