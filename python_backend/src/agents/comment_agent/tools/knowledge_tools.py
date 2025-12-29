"""
Knowledge Search Tools
Tools for searching company knowledge base before answering comments
"""
import json
import logging
from langchain_core.tools import tool

from ....services import is_supabase_configured, db_select

logger = logging.getLogger(__name__)


def create_knowledge_tools(workspace_id: str):
    """Create tools for searching company knowledge base"""
    
    @tool
    async def search_company_knowledge(query: str, category: str = None) -> str:
        """
        Search company knowledge base for FAQs, policies, product info, pricing, shipping, etc.
        ALWAYS use this FIRST before deciding if you can answer a comment.
        If knowledge is found, use it to craft a reply. If not found, escalate to user.
        
        Args:
            query: Search query based on the comment topic/question
            category: Optional category to narrow search (faq, policy, product, pricing, shipping, returns, support, hours, contact, general)
        """
        try:
            if not is_supabase_configured():
                return json.dumps({
                    "found": False,
                    "message": "Knowledge base not configured. This comment needs human expertise.",
                })
            
            # Build filters
            filters = {
                "workspace_id": workspace_id,
                "is_active": True,
            }
            if category:
                filters["category"] = category
            
            # Query knowledge base
            result = await db_select(
                table="company_knowledge",
                columns="id, category, title, question, answer",
                filters=filters,
                limit=100
            )
            
            if not result.get("success"):
                return json.dumps({
                    "found": False,
                    "message": "Error searching knowledge base. This comment needs human expertise.",
                })
            
            data = result.get("data", [])
            
            if not data:
                return json.dumps({
                    "found": False,
                    "message": "No knowledge entries in database. This comment needs human expertise.",
                })
            
            # Simple text matching (similar to TypeScript implementation)
            query_lower = query.lower()
            query_words = [w for w in query_lower.split() if len(w) > 2]
            
            matches = []
            for entry in data:
                title_lower = (entry.get("title") or "").lower()
                question_lower = (entry.get("question") or "").lower()
                answer_lower = (entry.get("answer") or "").lower()
                all_text = f"{title_lower} {question_lower} {answer_lower}"
                
                # Calculate match score
                score = 0
                for word in query_words:
                    if word in all_text:
                        score += 1
                    if word in title_lower:
                        score += 2  # Title matches worth more
                    if word in question_lower:
                        score += 2  # Question matches worth more
                
                if score > 0:
                    matches.append({**entry, "score": score})
            
            # Sort by score and take top 3
            matches.sort(key=lambda x: x["score"], reverse=True)
            top_matches = matches[:3]
            
            if not top_matches:
                return json.dumps({
                    "found": False,
                    "message": "No matching knowledge found for this topic. This comment needs human expertise.",
                })
            
            logger.info(f"Found {len(top_matches)} knowledge matches for query: {query}")
            
            return json.dumps({
                "found": True,
                "matches": [
                    {
                        "category": m.get("category"),
                        "title": m.get("title"),
                        "question": m.get("question"),
                        "answer": m.get("answer"),
                    }
                    for m in top_matches
                ],
            })
            
        except Exception as e:
            logger.error(f"Knowledge search error: {e}", exc_info=True)
            return json.dumps({
                "found": False,
                "message": "Error searching knowledge base. This comment needs human expertise.",
            })
    
    return [search_company_knowledge]
