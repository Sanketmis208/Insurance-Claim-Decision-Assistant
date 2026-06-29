import logging
import os
from functools import lru_cache

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from app.models import ExtractedClaimParameters
from app.config import settings

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM_PROMPT = """
You are an expert insurance claim analyst. Extract structured parameters
from the natural language insurance claim query.

Rules:
- Convert "lakhs" to INR integers (1 lakh = 100000). Example: 5 lakhs = 500000
- Convert months to fractional years. Example: 18 months = 1.5
- Normalize medical procedure to lowercase
- If claimed_amount not explicitly mentioned, leave it null
- Do not hallucinate values not present in the query
"""

EXTRACTION_HUMAN_PROMPT = """
Extract insurance claim parameters from this query:

<query>
{query}
</query>

Return a structured JSON object matching the required schema exactly.
"""

extraction_prompt = ChatPromptTemplate.from_messages([
    ("system", EXTRACTION_SYSTEM_PROMPT),
    ("human", EXTRACTION_HUMAN_PROMPT),
])


@lru_cache(maxsize=1)
def _get_llm() -> ChatGroq:
    api_key = settings.groq_api_key or os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError(
            "GROQ_API_KEY is not set. Add it to your .env file or set it as an environment variable."
        )
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0,
        api_key=api_key,
    )


def build_extraction_chain():
    llm = _get_llm()
    structured_llm = llm.with_structured_output(ExtractedClaimParameters)
    return extraction_prompt | structured_llm


async def extract_claim_parameters(query: str) -> ExtractedClaimParameters:
    logger.info("Running LLM extraction chain.")
    chain = build_extraction_chain()
    try:
        result: ExtractedClaimParameters = await chain.ainvoke({"query": query})
        logger.info("Extraction complete: procedure=%s age=%d", result.medical_procedure, result.age)
        return result
    except Exception as exc:
        logger.error("LLM extraction failed: %s", exc, exc_info=True)
        raise