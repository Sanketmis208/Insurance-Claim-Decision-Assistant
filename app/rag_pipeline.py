"""
rag_pipeline.py — RAG (Retrieval-Augmented Generation) query pipeline.

Pipeline steps:
    1. Accept user question
    2. Embed question using the same HuggingFace model
    3. Perform cosine similarity search against ChromaDB (top-k chunks)
    4. Build a prompt that injects retrieved context + question
    5. Send to Groq LLaMA 3.3 70B for answer generation
    6. Return answer + source excerpts for explainability

Design notes:
    - Uses LangChain's RetrievalQA chain for clean orchestration
    - Retrieves top 3 chunks by default (configurable via TOP_K)
    - Prompt is engineered to stay grounded — LLM is instructed to say
      "not found in the policy" rather than hallucinate
    - Source context is returned alongside the answer for auditability
"""

import logging
import os
from typing import List

from langchain_groq import ChatGroq
from langchain.chains import RetrievalQA
from langchain_core.prompts import PromptTemplate
from langchain.schema import Document

from app.vector_store import get_vector_store, collection_exists_and_has_docs

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────

TOP_K        = int(os.getenv("RAG_TOP_K", "3"))
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


# ── RAG Prompt Template ────────────────────────────────────────────────────
# The prompt is carefully engineered to:
#   - Ground the LLM in retrieved policy text only
#   - Refuse to speculate if the answer isn't in context
#   - Reference specific sections when possible

RAG_PROMPT_TEMPLATE = """
You are an expert insurance policy analyst. Answer the user's question using ONLY
the policy document excerpts provided below as context.

Rules:
- Base your answer strictly on the provided context.
- If the answer is not found in the context, respond with:
  "This information was not found in the uploaded policy document."
- Quote or reference specific sections/clauses when they are available.
- Be concise, precise, and professional.
- Do not make up coverage details, waiting periods, or exclusions not mentioned in the context.

---
POLICY CONTEXT:
{context}
---

QUESTION: {question}

ANSWER:"""

rag_prompt = PromptTemplate(
    template=RAG_PROMPT_TEMPLATE,
    input_variables=["context", "question"],
)


# ── LLM Singleton ─────────────────────────────────────────────────────────

_llm: ChatGroq | None = None

def get_llm() -> ChatGroq:
    global _llm
    if _llm is None:
        _llm = ChatGroq(
            model=GROQ_MODEL,
            temperature=0.1,    # Slightly above 0 for more natural phrasing
            api_key=GROQ_API_KEY,
        )
    return _llm


# ── Core RAG Functions ─────────────────────────────────────────────────────

def retrieve_relevant_chunks(question: str, k: int = TOP_K) -> List[Document]:
    """
    Perform semantic similarity search and return top-k policy chunks.

    Args:
        question: User's natural language question.
        k:        Number of top chunks to retrieve.

    Returns:
        List of LangChain Document objects (chunk text + metadata).
    """
    vector_store = get_vector_store()
    retriever = vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": k},
    )
    docs = retriever.invoke(question)
    logger.info("Retrieved %d chunk(s) for question: %.80s", len(docs), question)
    return docs


def format_source_context(docs: List[Document]) -> str:
    """
    Format retrieved chunks into a clean source context string for the response.
    Includes page numbers from PDF metadata when available.
    """
    parts = []
    for i, doc in enumerate(docs, 1):
        page = doc.metadata.get("page", "?")
        source = doc.metadata.get("source", "Policy Document")
        excerpt = doc.page_content.strip()
        parts.append(f"[Excerpt {i} — Page {page} of {source}]\n{excerpt}")
    return "\n\n".join(parts)


async def answer_policy_question(question: str) -> dict:
    """
    Full RAG pipeline: retrieve → prompt → generate → return.

    Args:
        question: User's question about the insurance policy.

    Returns:
        Dict with:
            - answer:         LLM-generated answer grounded in policy text
            - source_context: Raw retrieved excerpts for transparency
            - chunks_used:    Number of policy chunks used

    Raises:
        ValueError: If no policy document has been uploaded yet.
        Exception:  Any LLM or retrieval error.
    """
    # ── Guard: no document uploaded ──
    if not collection_exists_and_has_docs():
        raise ValueError(
            "No policy document found. Please upload an insurance policy PDF "
            "using POST /api/v1/upload-policy before asking questions."
        )

    logger.info("RAG pipeline started. Question: %.100s", question)

    # ── Step 1: Retrieve relevant chunks ──
    docs = retrieve_relevant_chunks(question)

    if not docs:
        return {
            "answer": "No relevant sections were found in the policy document for your question.",
            "source_context": "",
            "chunks_used": 0,
        }

    # ── Step 2: Build source context string ──
    source_context = format_source_context(docs)

    # ── Step 3: Build and run QA chain ──
    vector_store = get_vector_store()
    retriever = vector_store.as_retriever(search_kwargs={"k": TOP_K})

    qa_chain = RetrievalQA.from_chain_type(
        llm=get_llm(),
        chain_type="stuff",            # "stuff" = concat all chunks into one prompt
        retriever=retriever,
        return_source_documents=True,
        chain_type_kwargs={"prompt": rag_prompt},
    )

    logger.info("Invoking QA chain with Groq LLaMA...")
    result = await qa_chain.ainvoke({"query": question})

    answer = result.get("result", "").strip()
    logger.info("RAG answer generated. Length: %d chars", len(answer))

    return {
        "answer": answer,
        "source_context": source_context,
        "chunks_used": len(docs),
    }