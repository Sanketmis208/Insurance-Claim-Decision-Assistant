# 🏥 Insurance Claim Decision Assistant

A **production-quality AI-powered backend** that evaluates insurance claims from
natural language queries using an LLM extraction pipeline and a configurable
rule-based decision engine.

---

## 🏗️ System Architecture

```
User Request (natural language)
        │
        ▼
┌─────────────────────────────┐
│       FastAPI Layer          │  POST /api/v1/evaluate-claim
│  • Input validation          │
│  • Error handling            │
│  • JSON serialization        │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│      Claim Orchestrator      │  claim_parser.py
│  • Wires LLM + Engine        │
└──────┬──────────────┬───────┘
       │              │
       ▼              ▼
┌──────────────┐  ┌────────────────────────┐
│ LLM Pipeline │  │   Decision Engine       │
│ llm_pipeline │  │   decision_engine.py    │
│              │  │                        │
│ Prompt Tmpl  │  │ • Policy Duration      │
│ ChatOpenAI   │  │ • Waiting Period       │
│ with_struct  │  │ • Coverage Validation  │
│ _output()    │  │ • Age Restrictions     │
│              │  │ • Pre-existing Conds   │
└──────┬───────┘  └──────────┬─────────────┘
       │                     │
       ▼                     ▼
┌──────────────────────────────────────────┐
│        Pydantic Models (models.py)        │
│  ClaimRequest → ExtractedClaimParameters │
│             → ClaimDecisionResponse       │
└──────────────────────────────────────────┘
```

---

## 📁 Folder Structure

```
insurance-claim-assistant/
│
├── app/
│   ├── __init__.py          # Package marker
│   ├── main.py              # FastAPI app factory + lifespan hooks
│   ├── routes.py            # API endpoint definitions
│   ├── models.py            # Pydantic schemas (request/response/LLM output)
│   ├── claim_parser.py      # Orchestrator — wires LLM pipeline + decision engine
│   ├── llm_pipeline.py      # LangChain NLU + structured extraction chain
│   ├── decision_engine.py   # Rule-based claim evaluation engine
│   ├── config.py            # App settings via pydantic-settings
│   └── utils.py             # Logging setup + shared helpers
│
├── .env.example             # Environment variable template
├── requirements.txt         # Python dependencies
└── README.md                # This file
```

---

## ⚡ Quick Start

### 1. Clone & Install

```bash
git clone <repo-url>
cd insurance-claim-assistant

python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and set your OPENAI_API_KEY
```

### 3. Run the Server

```bash
uvicorn app.main:app --reload --port 8000
```

### 4. Open API Docs

- Swagger UI: http://localhost:8000/docs
- ReDoc:       http://localhost:8000/redoc

---

## 🔌 API Reference

### `POST /api/v1/evaluate-claim`

**Request:**
```json
{
  "query": "I am 46 years old. I had knee replacement surgery in Mumbai. My policy started 3 years ago with a coverage of 5 lakhs. Can this claim be approved?"
}
```

**Response (APPROVED):**
```json
{
  "decision": "APPROVED",
  "approved_amount": 450000.0,
  "justification": "Claim APPROVED. All 5 policy rules passed. A 10% co-pay deductible has been applied. Approved amount: ₹4,50,000 out of ₹5,00,000.",
  "rule_evaluations": [
    {
      "rule_name": "Policy Duration Check",
      "passed": true,
      "detail": "Policy has been active for 3.0 year(s). Minimum required: 2.0 year(s). ✓ Condition met."
    },
    {
      "rule_name": "Procedure Waiting Period",
      "passed": true,
      "detail": "'Knee Replacement' has a waiting period of 2.0 year(s). Policy active for 3.0 year(s). ✓ Waiting period satisfied."
    },
    {
      "rule_name": "Coverage Amount Validation",
      "passed": true,
      "detail": "Claimed amount ₹5,00,000 is within policy coverage of ₹5,00,000. ✓"
    },
    {
      "rule_name": "Age Restriction Check",
      "passed": true,
      "detail": "Claimant age 46 is within the required range [18–80] for 'knee replacement'. ✓"
    },
    {
      "rule_name": "Pre-existing Condition Check",
      "passed": true,
      "detail": "No pre-existing condition information provided; skipping check. ✓"
    }
  ],
  "extracted_parameters": {
    "age": 46,
    "medical_procedure": "knee replacement surgery",
    "location": "Mumbai",
    "policy_duration_years": 3.0,
    "coverage_amount": 500000.0,
    "claimed_amount": null,
    "pre_existing_condition": null,
    "additional_notes": null
  }
}
```

**Response (REJECTED example):**
```json
{
  "decision": "REJECTED",
  "approved_amount": 0.0,
  "justification": "Claim REJECTED. The following rule(s) were not satisfied: Policy Duration Check, Procedure Waiting Period.",
  "rule_evaluations": [ ... ]
}
```

---

## 🧪 Test with curl

```bash
curl -X POST http://localhost:8000/api/v1/evaluate-claim \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I am 46 years old. I had knee replacement surgery in Mumbai. My policy started 3 years ago with a coverage of 5 lakhs. Can this claim be approved?"
  }'
```

---

## 📋 Policy Rules

| Rule | Description |
|------|-------------|
| **Policy Duration** | Policy must be active ≥ 2 years |
| **Waiting Period** | Knee/hip replacement: 2y · Cataract: 1y · Bariatric: 3y · Cosmetic: Never |
| **Coverage Validation** | Claimed amount ≤ policy coverage ≤ system cap (₹1Cr) |
| **Age Restriction** | General: 18–80 · Procedure-specific overrides apply |
| **Pre-existing Condition** | Requires policy active ≥ 3 years if flagged |

All rules are configurable in `decision_engine.py → PolicyConfig`.

---

## 🔮 Extension Roadmap

The codebase is designed for incremental enhancement:

### RAG Pipeline (Policy Documents)
```python
# In claim_parser.py, add between extraction and engine:
relevant_clauses = await vector_store.similarity_search(params.medical_procedure)
# Pass clauses as additional context to the decision engine
```

### Vector Database
```bash
pip install chromadb
# Store policy PDFs as embeddings; retrieve relevant clauses per claim
```

### Custom Rule Loading
```python
# Load rules from DB / YAML instead of hardcoded PolicyConfig
policy = await load_policy_from_db(policy_id=request.policy_id)
response = run_decision_engine(params, policy=policy)
```

### Async Rule Evaluation
```python
# Evaluate independent rules in parallel with asyncio.gather()
```

---

## 🛡️ Production Checklist

- [ ] Set `OPENAI_API_KEY` in environment / secrets manager
- [ ] Tighten CORS `allow_origins` in `main.py`
- [ ] Add rate limiting (e.g. `slowapi`)
- [ ] Add authentication (JWT / API key header)
- [ ] Add a persistent audit log (DB row per claim evaluation)
- [ ] Deploy behind a reverse proxy (nginx / AWS ALB)
- [ ] Set `DEBUG=false` in production `.env`
