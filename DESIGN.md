# Insurance Claim Decision Assistant — System Design

## 1. Overview

The Insurance Claim Decision Assistant is a full-stack AI system with two independent but complementary engines:

1. **Claim Evaluator** — accepts a natural language claim query, extracts structured parameters using an LLM, and evaluates them against a configurable rule engine to produce an APPROVED / REJECTED / PENDING_REVIEW decision.
2. **Policy Q&A (RAG)** — accepts an insurance policy PDF, indexes it into a vector database, and answers natural language questions about it using semantic retrieval + LLM generation.

Both engines share the same backend (FastAPI), the same LLM provider (Groq / LLaMA 3.3 70B), and are exposed through a single React/TypeScript frontend.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + Vite)                      │
│  localhost:3000                                                        │
│                                                                        │
│  ┌───────────────────┐          ┌───────────────────────────────┐     │
│  │  Claim Evaluator  │          │        Policy Q&A (RAG)        │     │
│  │  Tab                         │  Tab                           │     │
│  │  ClaimForm        │          │  PolicyUpload + PolicyQA       │     │
│  │  DecisionCard     │          │                                │     │
│  └────────┬──────────┘          └──────────────┬────────────────┘     │
│           │  POST /api/v1/evaluate-claim        │  POST /api/v1/upload-policy
│           │                                     │  POST /api/v1/ask-policy
│           │                                     │  GET  /api/v1/policy-status
└───────────┼─────────────────────────────────────┼────────────────────┘
            │         Vite Proxy (→ :8002)         │
            ▼                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI + Uvicorn)                      │
│  localhost:8002                                                        │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │                      routes.py (APIRouter)                    │     │
│  │  POST /evaluate-claim   POST /upload-policy  GET /policy-status│    │
│  │  POST /ask-policy       GET /health                           │     │
│  └──────┬───────────────────┬──────────────────┬────────────────┘     │
│         │                   │                  │                       │
│         ▼                   ▼                  ▼                       │
│  ┌─────────────┐   ┌────────────────┐  ┌────────────────┐            │
│  │ claim_parser│   │ pdf_ingestion  │  │  rag_pipeline  │            │
│  │ (orchestrator)  │ (PDF → chunks  │  │ (Q → retrieve  │            │
│  └──────┬──────┘   │  → embed       │  │  → LLM answer) │            │
│         │          │  → ChromaDB)   │  └───────┬────────┘            │
│         ▼          └───────┬────────┘          │                      │
│  ┌─────────────┐           │            ┌──────┴──────────┐           │
│  │llm_pipeline │           ▼            │  vector_store   │           │
│  │(Groq LLaMA) │   ┌───────────────┐   │  (ChromaDB      │           │
│  └──────┬──────┘   │  vector_store │   │   EphemeralClient│           │
│         │          │  (ChromaDB    │   │   MiniLM-L6-v2) │           │
│         ▼          │   EphemeralCl)│   └─────────────────┘           │
│  ┌─────────────┐   └───────────────┘                                  │
│  │decision_    │                                                       │
│  │engine       │                                                       │
│  │(5 rules)    │                                                       │
│  └─────────────┘                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Backend Design

### 3.1 Module Responsibilities

| Module | Role |
|---|---|
| `main.py` | FastAPI app factory; lifespan hooks for startup tasks (dir creation, model warm-up) |
| `config.py` | Pydantic `BaseSettings`; reads `.env`; single `settings` singleton |
| `routes.py` | All HTTP endpoints; input validation; error mapping to HTTP status codes |
| `models.py` | All Pydantic request/response schemas |
| `claim_parser.py` | Orchestrates the claim evaluation pipeline (LLM → decision engine) |
| `llm_pipeline.py` | LLM extraction chain; structured output via `ChatGroq` + LangChain |
| `decision_engine.py` | 5 rule functions + registry; `PolicyConfig` dataclass; stateless evaluation |
| `pdf_ingestion.py` | PDF upload → parse → chunk → embed → store pipeline |
| `rag_pipeline.py` | Question → embed → retrieve → LLM answer pipeline |
| `vector_store.py` | ChromaDB client singleton; HuggingFace embeddings singleton |
| `utils.py` | Logging configuration; INR formatter |

### 3.2 Claim Evaluation Pipeline

```
User Query (natural language)
    │
    ▼
[llm_pipeline.py] — ChatGroq (LLaMA 3.3 70B)
    │  Structured output via .with_structured_output(ExtractedClaimParameters)
    │  Extracts: age, medical_procedure, location, policy_duration_years,
    │            coverage_amount, claimed_amount, pre_existing_condition
    ▼
ExtractedClaimParameters (Pydantic model)
    │
    ▼
[decision_engine.py] — Rule Registry (5 rules)
    │
    ├── rule_policy_duration        min 2 years active
    ├── rule_waiting_period         procedure-specific waiting periods
    ├── rule_coverage_amount        claimed ≤ coverage ≤ 1 crore cap
    ├── rule_age_restriction        18–80 general; procedure-specific overrides
    └── rule_pre_existing_condition 3+ years required if pre-existing
    │
    ▼
ClaimDecisionResponse
    ├── decision: APPROVED | REJECTED | PENDING_REVIEW
    ├── approved_amount (coverage × 0.90 after 10% co-pay)
    ├── justification (human-readable)
    ├── rule_evaluations[] (per-rule pass/fail + detail)
    └── extracted_parameters (echo back for transparency)
```

### 3.3 RAG (Policy Q&A) Pipeline

#### Ingestion (upload time)

```
PDF file (bytes)
    │
    ▼
[pdf_ingestion.py]
    ├── Validate: .pdf extension, ≤ 50 MB
    ├── Clear old uploads (single-policy design)
    ├── Save to ./uploads/
    ├── PyPDFLoader → List[Document] (one per page)
    ├── Filter blank pages
    ├── RecursiveCharacterTextSplitter
    │   chunk_size=800, overlap=150
    │   separators: [\n\n, \n, ". ", " ", ""]
    ├── reset_collection() — clear old ChromaDB collection
    └── vector_store.add_documents(chunks)
            │
            ▼ HuggingFaceEmbeddings (all-MiniLM-L6-v2, CPU)
            ▼ ChromaDB EphemeralClient (in-memory)
```

#### Query time

```
User Question (natural language)
    │
    ▼
[rag_pipeline.py]
    ├── Guard: collection_exists_and_has_docs() → 404 if empty
    ├── Embed question via MiniLM-L6-v2
    ├── Cosine similarity search → top-3 chunks (RAG_TOP_K)
    ├── Format source_context (Excerpt N — Page X of Filename)
    └── RetrievalQA chain (stuff strategy)
            ├── Retriever: top-3 chunks
            ├── Prompt: grounded policy analyst persona
            └── LLM: ChatGroq (LLaMA 3.3 70B, temperature=0.1)
    │
    ▼
PolicyQuestionResponse
    ├── answer (LLM-generated, grounded in policy text)
    ├── source_context (raw excerpts for auditability)
    └── chunks_used (integer)
```

### 3.4 API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/evaluate-claim` | NLU extraction + rule decision | None |
| `POST` | `/api/v1/upload-policy` | Ingest PDF into ChromaDB | None |
| `POST` | `/api/v1/ask-policy` | RAG question answering | None |
| `GET` | `/api/v1/policy-status` | Check if policy is loaded | None |
| `GET` | `/api/v1/health` | Service health check | None |

### 3.5 Data Models

#### Request Models
```python
ClaimRequest          query: str (10–2000 chars)
PolicyQuestionRequest question: str (5–1000 chars)
```

#### Response Models
```python
ClaimDecisionResponse
  decision:             APPROVED | REJECTED | PENDING_REVIEW
  approved_amount:      float ≥ 0
  justification:        str
  rule_evaluations:     List[RuleEvaluation]
  extracted_parameters: ExtractedClaimParameters | None

ExtractedClaimParameters
  age:                     int (0–120)
  medical_procedure:       str (normalized to lowercase)
  location:                str | None
  policy_duration_years:   float ≥ 0
  coverage_amount:         float ≥ 0
  claimed_amount:          float | None
  pre_existing_condition:  bool | None

RuleEvaluation
  rule_name: str
  passed:    bool
  detail:    str

PolicyUploadResponse
  message, filename, pages_loaded, chunks_stored, chunk_size, chunk_overlap

PolicyQuestionResponse
  answer, source_context, chunks_used

VectorStoreStatusResponse
  has_documents, document_count, message
```

### 3.6 Decision Engine — Rule Details

| Rule | Logic | Failure Condition |
|---|---|---|
| Policy Duration | `policy_duration_years >= 2.0` | Policy younger than 2 years |
| Waiting Period | Procedure-keyword match → specific wait years | Duration < wait time; cosmetic = always rejected |
| Coverage Amount | `claimed ≤ coverage ≤ 1 crore` | Over-coverage or over system cap |
| Age Restriction | General: 18–80; procedure-specific overrides | Outside allowed range |
| Pre-existing Condition | If `pre_existing = True`, requires 3+ years | Policy < 3 years with pre-existing |

**Waiting Period Table:**

| Procedure | Wait (years) |
|---|---|
| Knee / Hip / Joint Replacement | 2.0 |
| Cataract | 1.0 |
| Hernia | 1.0 |
| Bariatric / Weight Loss | 3.0 |
| Cosmetic | ∞ (excluded) |
| Dental | 1.0 |
| Maternity | 0.75 (9 months) |

### 3.7 Configuration (`.env` / `config.py`)

| Variable | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | — | **Required.** Groq API key |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Model for RAG answers |
| `APP_TITLE` | `Insurance Claim Decision Assistant` | FastAPI app title |
| `APP_VERSION` | `1.0.0` | API version |
| `DEBUG` | `false` | Debug mode |
| `LOG_LEVEL` | `INFO` | Logging level |
| `UPLOAD_DIR` | `./uploads` | PDF storage directory |
| `CHROMA_PERSIST_DIR` | `./chroma_db` | ChromaDB directory (informational only; app uses EphemeralClient) |
| `RAG_TOP_K` | `3` | Chunks retrieved per query |
| `CHUNK_SIZE` | `800` | Characters per text chunk |
| `CHUNK_OVERLAP` | `150` | Overlap between consecutive chunks |

---

## 4. Frontend Design

### 4.1 Component Tree

```
App.tsx
└── Dashboard.tsx  (all state lives here)
    ├── Header
    │   ├── ThemeToggle
    │   └── Policy status pill + API live indicator
    ├── Hero section
    ├── Tab Navigation (claim | rag)
    │
    ├── [Tab: claim]
    │   ├── ClaimForm         — textarea + example queries + submit button
    │   └── DecisionCard      — decision hero + extracted params + rule breakdown
    │
    ├── [Tab: rag]
    │   ├── PolicyUpload      — drag-and-drop PDF upload + ingestion stats
    │   └── PolicyQA          — question input + answer history + source toggle
    │
    └── System Architecture cards (static explainer)
```

### 4.2 State Management

All state is co-located in `Dashboard.tsx` using React `useState` / `useEffect`. No external state library is used.

| State | Type | Description |
|---|---|---|
| `activeTab` | `'claim' \| 'rag'` | Active tab selection |
| `claimState` | `'idle' \| 'loading' \| 'result' \| 'error'` | Claim evaluation lifecycle |
| `claimResult` | `ClaimDecisionResponse \| null` | Last evaluation result |
| `claimError` | `string` | Error message for failed evaluation |
| `policyLoaded` | `boolean` | Whether a policy is in ChromaDB |
| `uploadLoading` | `boolean` | PDF upload in-progress flag |
| `policyInfo` | `PolicyUploadResponse \| null` | Last upload stats |

### 4.3 API Layer (`services/api.ts`)

Axios client with `baseURL = http://localhost:8002` (or `VITE_API_URL` env var).

```typescript
evaluateClaim(query)   → POST /api/v1/evaluate-claim
uploadPolicy(file)     → POST /api/v1/upload-policy  (multipart/form-data)
askPolicy(question)    → POST /api/v1/ask-policy
getPolicyStatus()      → GET  /api/v1/policy-status
```

Timeout: 60 seconds (LLM calls can be slow).

### 4.4 Vite Proxy

```typescript
// vite.config.ts
proxy: {
  '/api': { target: 'http://localhost:8002', changeOrigin: true }
}
```

All `/api/*` requests from the React dev server are forwarded to FastAPI on port 8002, avoiding CORS issues in development.

---

## 5. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | React + TypeScript | Vite 5 |
| Styling | Tailwind CSS | v3 |
| HTTP client | Axios | — |
| Icons | Lucide React | — |
| Backend framework | FastAPI | 0.115.6 |
| ASGI server | Uvicorn | 0.32.1 |
| LLM provider | Groq (LLaMA 3.3 70B) | — |
| LLM orchestration | LangChain + langchain-groq | — |
| Embeddings | HuggingFace sentence-transformers (all-MiniLM-L6-v2) | — |
| Vector database | ChromaDB (EphemeralClient) | 0.5.23 |
| PDF parsing | PyPDF | 4.3.1 |
| Data validation | Pydantic v2 + pydantic-settings | 2.10.4 |
| HTTP client (backend) | HTTPX | 0.28.1 |

---

## 6. Non-Functional Design Decisions

### In-Memory Vector Store
ChromaDB `EphemeralClient` is used instead of `PersistentClient` to avoid macOS SQLite read-only filesystem issues. Data resets on server restart, which is acceptable since PDFs are re-ingested on every upload.

### Single-Policy Design
Only one policy PDF is active at a time. Uploading a new PDF automatically:
1. Deletes all existing PDFs from `./uploads/`
2. Resets the ChromaDB collection
3. Ingests the new document from scratch

This prevents cross-policy answer contamination.

### LLM Caching (`@lru_cache`)
Both `_get_llm()` in `llm_pipeline.py` and `get_llm()` in `rag_pipeline.py` cache the `ChatGroq` instance to avoid re-initializing the client on every request.

### Pre-warming Embeddings
On startup, `main.py` loads the `all-MiniLM-L6-v2` model during the lifespan hook so the first `/upload-policy` request isn't slow (model download + initialization happens at boot, not at first user request).

### Structured LLM Output
`ChatGroq.with_structured_output(ExtractedClaimParameters)` forces the LLM to return valid JSON matching the Pydantic schema, eliminating manual parsing and reducing hallucination risk for structured fields.

### Co-Pay Deductible
Approved claims automatically have a 10% co-pay deductible applied:
```
approved_amount = (claimed_amount or coverage_amount) × 0.90
```

### Rule Extensibility
Rules are registered in `RULE_REGISTRY` as `(name, callable)` tuples. Adding a new rule requires only defining a function with signature `(params, config) → (bool, str)` and appending it to the list — no changes to the engine loop.

---

## 7. Deployment (Render)

```yaml
# render.yaml
services:
  - type: web
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: GROQ_API_KEY
        sync: false
```

The frontend must be deployed separately (e.g. Vercel, Netlify) with `VITE_API_URL` pointing to the Render backend URL.

---

## 8. Known Limitations

- **No authentication** — all endpoints are public; suitable for portfolio/demo use only
- **In-memory vector store** — policy data is lost on server restart; re-upload required
- **Single policy** — only one PDF supported at a time
- **No streaming** — LLM responses are returned as complete JSON, not streamed
- **Python 3.9 venv vs. system Python** — `uvicorn --reload` spawns a subprocess that may pick up the system Python (Anaconda) instead of the project venv; use the full path to `.venv/bin/uvicorn` to avoid this
