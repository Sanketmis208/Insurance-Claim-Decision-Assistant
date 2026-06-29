# Insurance Claim Decision Assistant — Conceptual Map

This document explains the **why** behind every concept in this project: what each piece is, why it exists, and how it connects to everything else.

---

## Core Concept: Two AI Pipelines, One Platform

The system solves two different but related problems in insurance:

```
┌─────────────────────────────────────────────────────────────────┐
│  PROBLEM 1: "Can my claim be approved?"                          │
│  → Needs: structured rule evaluation on claim facts             │
│  → Solution: NLU extraction + deterministic rule engine         │
├─────────────────────────────────────────────────────────────────┤
│  PROBLEM 2: "What does my policy actually say about X?"          │
│  → Needs: understanding of an unstructured policy document      │
│  → Solution: RAG pipeline (vector search + LLM generation)      │
└─────────────────────────────────────────────────────────────────┘
```

These two pipelines share the same LLM provider and frontend, but are architecturally independent.

---

## Concept 1: Natural Language Understanding (NLU) Extraction

**What it is:** Using an LLM to parse a freeform sentence and extract specific structured fields.

**Why it's needed:** Users don't fill forms — they write things like:
> "I am 46 years old. I had knee replacement surgery in Mumbai. My policy started 3 years ago with 5 lakhs coverage."

Before any rule can run, the system must know `age=46`, `procedure="knee replacement"`, `duration=3.0`, `coverage=500000`. An LLM handles this far better than regex or form parsing.

**How it works:**
```
User sentence
    │
    ▼
ChatGroq (LLaMA 3.3 70B)
+ .with_structured_output(ExtractedClaimParameters)
    │
    ▼ Forces valid JSON matching the Pydantic schema
ExtractedClaimParameters
  {age: 46, medical_procedure: "knee replacement",
   policy_duration_years: 3.0, coverage_amount: 500000, ...}
```

**Key design choice — structured output:** Instead of asking the LLM to "return JSON" in a prompt and parsing it manually, LangChain's `.with_structured_output()` binds the Pydantic schema directly to the LLM call. This eliminates parsing errors and enforces type safety at the boundary between AI and business logic.

**Currency normalization:** The system prompt instructs the LLM to convert Indian units (e.g., "5 lakhs" → `500000`, "18 months" → `1.5`) so downstream rules always work with consistent SI units.

---

## Concept 2: Rule-Based Decision Engine

**What it is:** A deterministic, auditable set of business rules that evaluate the extracted claim parameters.

**Why deterministic (not LLM-based):** Insurance decisions must be explainable, repeatable, and legally defensible. An LLM might approve a claim one day and reject it the next with slightly different wording. Rules give consistent, traceable outcomes.

**Architecture — Registry Pattern:**
```python
RULE_REGISTRY = [
    ("Policy Duration Check",       rule_policy_duration),
    ("Procedure Waiting Period",     rule_waiting_period),
    ("Coverage Amount Validation",   rule_coverage_amount),
    ("Age Restriction Check",        rule_age_restriction),
    ("Pre-existing Condition Check", rule_pre_existing_condition),
]
```

Each rule is a pure function: `(params, config) → (bool, detail_string)`. The engine loops over all rules, collects results, and decides:
- All pass → `APPROVED` (with 10% co-pay deduction)
- Any fail → `REJECTED` (lists which rules failed)

**Why the registry pattern:** New rules can be added by appending one entry — no changes to the engine loop, no branching logic scattered across files.

**PolicyConfig dataclass:** All numeric thresholds (min duration, waiting periods, age limits, cap amounts) live in one place. They can be swapped without touching rule logic — e.g., load from a database, environment variable, or policy document in a future version.

**Co-pay deductible:** Approved claims are not paid at 100%. A 10% co-pay is applied:
```
approved = base_amount × 0.90
```
This reflects standard insurance practice where the claimant bears a percentage.

---

## Concept 3: Retrieval-Augmented Generation (RAG)

**What it is:** A technique that gives an LLM access to a specific document at query time, so its answers are grounded in that document rather than general training data.

**Why RAG instead of just asking the LLM:** An LLM doesn't know the specific terms of *your* policy. RAG retrieves the exact relevant clauses from your uploaded PDF and feeds them as context, so the LLM answers from evidence rather than guessing.

**The pipeline in plain terms:**

```
INGESTION (done once per PDF upload):
  PDF → text pages → overlapping chunks → embeddings → vector database

QUERY (done on each question):
  Question → embedding → similarity search → top 3 chunks → LLM → answer
```

**Why overlapping chunks?**
If a policy clause spans a chunk boundary, a plain split would lose context. Overlapping (`chunk_overlap=150`) ensures the boundary text appears in both adjacent chunks, so no clause is cut off mid-sentence.

**Why `all-MiniLM-L6-v2`?**
It's a small, fast sentence-transformer model (22M params) that runs on CPU without a GPU. It produces 384-dimensional embeddings well-suited for semantic search over short passages.

**Why ChromaDB EphemeralClient?**
The persistent ChromaDB client on macOS has known SQLite read-only issues on some filesystem configurations. The in-memory `EphemeralClient` sidesteps all of that. The trade-off (data lost on restart) is acceptable because the PDF is re-ingested on every upload anyway — there's no benefit to persisting between restarts in the current single-policy design.

**Cosine similarity search:** Chunks are stored as vectors. At query time, the question is also embedded and the database finds the 3 chunks whose vectors are most similar (closest in meaning), regardless of exact keyword matches.

**Grounded prompt design:**
```
"Answer ONLY using the policy document excerpts provided below.
 If the answer is not found, say: 'Not found in the uploaded policy.'"
```
This prevents the LLM from falling back to its general training knowledge and fabricating policy terms that aren't in the actual document.

---

## Concept 4: LangChain as Orchestration Layer

**What it is:** A framework that chains LLM calls, prompts, and tools together.

**Why it's used:**
- `ChatPromptTemplate` → separates prompt text from code
- `.with_structured_output()` → binds Pydantic schemas to LLM calls
- `RetrievalQA` → wires retriever + prompt + LLM into one callable
- `HuggingFaceEmbeddings` → standardized embedding interface
- `Chroma` (LangChain wrapper) → standardized vector store interface

LangChain means the LLM provider (Groq), embedding model (HuggingFace), and vector store (ChromaDB) can each be swapped with one line of code.

---

## Concept 5: Pydantic for Type Safety at the AI Boundary

**What it is:** Python data validation library that enforces types and runs validators.

**Why it's critical here:** The LLM returns text. Before that text touches business logic, it must be validated — wrong types, missing fields, or out-of-range values would cause silent bugs or wrong decisions.

```python
class ExtractedClaimParameters(BaseModel):
    age: int = Field(..., ge=0, le=120)          # 0–120
    medical_procedure: str                        # normalized to lowercase
    policy_duration_years: float = Field(..., ge=0)
    coverage_amount: float = Field(..., ge=0)
    ...
```

Validators also normalize data:
- `medical_procedure` → always lowercase (`"Knee Replacement"` → `"knee replacement"`)
- `location` → title case; `None` → `"Not specified"`

This means rule logic never needs to handle casing or null edge cases.

---

## Concept 6: FastAPI for the Backend

**What it is:** Modern async Python web framework with automatic OpenAPI docs.

**Why async matters here:** LLM API calls (Groq) are network I/O — they can take 2–5 seconds. With async, the server doesn't block while waiting for Groq to respond; it can handle other requests concurrently on a single thread.

**Automatic docs:** FastAPI generates `/docs` (Swagger) and `/redoc` from the Pydantic models automatically. Every endpoint is self-documented with request/response schemas.

**Error mapping strategy:**
```python
except ValueError as exc:
    raise HTTPException(status_code=422, detail=str(exc))  # business validation
except Exception as exc:
    raise HTTPException(status_code=500, ...)              # unexpected errors
```

Business errors (bad input) → 422. System errors → 500. This maps directly to the frontend's error handling.

---

## Concept 7: The Frontend State Machine

The claim evaluation UI uses a 4-state machine in `Dashboard.tsx`:

```
idle ──[submit]──▶ loading ──[success]──▶ result
  ▲                    │                     │
  └────────────────────┴──[error]──▶ error   │
  ◀─────────────────────────[reset]──────────┘
```

- `idle` → show empty placeholder
- `loading` → show spinner, disable form
- `result` → show `DecisionCard` with full breakdown
- `error` → show error panel with "Try Again"

This is cleaner than a set of booleans (`isLoading`, `hasError`, `hasResult`) which can reach inconsistent states.

---

## Concept 8: Vite Proxy for Development

**The problem:** React on port 3000 calling FastAPI on port 8002 → browser blocks it (CORS).

**The solution:** Vite dev server proxies all `/api/*` requests to port 8002 transparently:

```
Browser → localhost:3000/api/v1/evaluate-claim
    → Vite proxy → localhost:8002/api/v1/evaluate-claim
    ← response passes back through
```

The browser only sees requests to port 3000, so CORS doesn't trigger. In production, a reverse proxy (Nginx, Render, etc.) does the same job.

---

## Concept 9: Environment-Driven Configuration

All secrets and tunables live in `.env`, never in code:

```
GROQ_API_KEY=...        ← secret, never committed
GROQ_MODEL=...          ← can change model without code change
RAG_TOP_K=3             ← tune retrieval without redeployment
CHUNK_SIZE=800          ← tune chunking without redeployment
```

`pydantic-settings` loads these automatically via `BaseSettings`. The `@lru_cache` on `get_settings()` ensures the `.env` file is read once at startup, not on every request.

---

## How Everything Connects — End-to-End Flow

### Claim Evaluation Flow

```
1. User types: "I am 46, knee replacement, 3yr policy, 5L coverage"
2. ClaimForm.tsx → POST /api/v1/evaluate-claim {query: "..."}
3. routes.py → claim_parser.process_claim(query)
4. claim_parser → llm_pipeline.extract_claim_parameters(query)
5. llm_pipeline → Groq API (LLaMA 3.3 70B, structured output)
6. Groq returns ExtractedClaimParameters {age:46, procedure:"knee replacement"...}
7. claim_parser → decision_engine.run_decision_engine(params)
8. decision_engine runs 5 rules, all pass
9. approved_amount = 500000 × 0.90 = 450000
10. Returns ClaimDecisionResponse {decision: APPROVED, approved_amount: 450000, ...}
11. routes.py → JSON response
12. Dashboard.tsx → setClaimResult(data) → setClaimState('result')
13. DecisionCard renders APPROVED + ₹4.5L + rule breakdown table
```

### Policy Q&A Flow

```
1. User uploads "hdfc_health_policy.pdf"
2. PolicyUpload.tsx → POST /api/v1/upload-policy (multipart)
3. routes.py → pdf_ingestion.ingest_pdf(filename, bytes)
4. pdf_ingestion: clear old → save → PyPDFLoader → 42 pages
5. RecursiveCharacterTextSplitter → 180 chunks (800 chars, 150 overlap)
6. reset_collection() → wipe old ChromaDB data
7. vector_store.add_documents(chunks) → MiniLM embeds 180 chunks → ChromaDB
8. Response: {pages_loaded: 42, chunks_stored: 180}
9. setPolicyLoaded(true) → badge turns blue

10. User asks: "Is knee replacement covered?"
11. PolicyQA.tsx → POST /api/v1/ask-policy {question: "..."}
12. rag_pipeline.answer_policy_question(question)
13. Embed question → MiniLM → 384-dim vector
14. ChromaDB cosine search → top 3 chunks (most relevant policy sections)
15. Format source_context string with page numbers
16. RetrievalQA chain → prompt + chunks + question → Groq API
17. LLM generates grounded answer: "Yes, knee replacement is covered after a 2-year waiting period..."
18. Response: {answer: "...", source_context: "[Excerpt 1 — Page 12]...", chunks_used: 3}
19. PolicyQA renders answer + "Show source excerpts" toggle
```

---

## Dependency Graph (simplified)

```
routes.py
├── claim_parser.py
│   ├── llm_pipeline.py
│   │   ├── config.py  (groq_api_key)
│   │   └── models.py  (ExtractedClaimParameters)
│   ├── decision_engine.py
│   │   └── models.py  (ClaimDecisionResponse, RuleEvaluation)
│   └── models.py
├── pdf_ingestion.py
│   └── vector_store.py
│       └── (HuggingFace, chromadb)
├── rag_pipeline.py
│   ├── vector_store.py
│   └── config.py  (groq_api_key)
├── models.py
└── vector_store.py

main.py
├── config.py
├── routes.py
└── utils.py
```

---

## Why This Architecture Scales

| Concern | Current | Future extension |
|---|---|---|
| Add a new claim rule | Add one function + one line to `RULE_REGISTRY` | No change to engine |
| Change LLM provider | Swap `ChatGroq` → `ChatOpenAI` in one file | LangChain abstracts the interface |
| Persist vector store | Change `EphemeralClient` → `PersistentClient` | One line in `vector_store.py` |
| Support multiple policies | Partition ChromaDB by `collection_name` | `get_vector_store(collection_id)` |
| Add authentication | FastAPI `Depends()` on routes | No change to business logic |
| Load rules from database | Replace `RULE_REGISTRY` list with DB query | Engine loop unchanged |
| Add streaming LLM responses | FastAPI `StreamingResponse` + LangChain streaming | Frontend adds `EventSource` |
