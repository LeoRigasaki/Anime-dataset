"""AnimeScheduleAgent - AI agent for anime completion predictions."""
import json
import os
from datetime import date
from typing import Optional
from dotenv import load_dotenv
from google import genai
from google.genai import types

from src.tools import TOOL_DEFINITIONS, TOOL_FUNCTIONS

load_dotenv()

def _get_current_season() -> tuple[str, int]:
    """Get current anime season and year."""
    today = date.today()
    month = today.month
    year = today.year
    
    if month in (1, 2, 3):
        return "WINTER", year
    elif month in (4, 5, 6):
        return "SPRING", year
    elif month in (7, 8, 9):
        return "SUMMER", year
    else:  # 10, 11, 12
        return "FALL", year


# System prompt defining the agent's behavior
_season, _year = _get_current_season()
SYSTEM_PROMPT = f"""You are AnimeScheduleAgent, an AI assistant that helps users find out when anime will finish airing.

TODAY'S DATE: {date.today().isoformat()}
CURRENT ANIME SEASON: {_season} {_year}

USER CONTEXT:
The user waits for anime to COMPLETELY finish airing before watching. They want to know:
- When specific anime will finish
- Which anime from a season they can binge now
- What's finishing soon

IMPORTANT RULES:
1. When user asks about "this week", "this month", "current season" - use TODAY'S DATE to calculate
2. For "What's finishing this week?" - use get_bingeable_anime with current season and a date 7 days from today
3. For seasonal queries without year specified - assume current season ({_season} {_year})
4. Always call tools first, don't ask clarifying questions unless truly necessary

YOUR APPROACH:
1. For specific anime: search_anime → predict_completion
2. For "what's finishing soon/this week": get_bingeable_anime with by_date parameter
3. For seasonal overview: get_season_anime

RESPONSE FORMAT:
- Lead with the answer (dates, titles)
- Be concise - user wants facts, not explanations
- Include confidence level for predictions"""


class AnimeScheduleAgent:
    """Agent that uses Gemini to answer anime schedule queries."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY required. Set in .env or pass to constructor.")
        
        self.client = genai.Client(api_key=self.api_key)
        # Model with function calling support (from Gemini docs)
        self.model = "gemini-2.5-flash"  # Stable, fast, function calling supported
        
        # Convert tool definitions to Gemini format
        self.tools = types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name=tool["name"],
                    description=tool["description"],
                    parameters=tool["parameters"]
                )
                for tool in TOOL_DEFINITIONS
            ]
        )
    
    def _execute_tool(self, name: str, args: dict) -> str:
        """Execute a tool and return JSON result."""
        if name not in TOOL_FUNCTIONS:
            return json.dumps({"error": f"Unknown tool: {name}"})
        
        try:
            result = TOOL_FUNCTIONS[name](**args)
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e)})
    
    def query(self, user_query: str) -> str:
        """
        Process a user query and return the agent's response.
        Handles multi-turn tool calling automatically.
        """
        # Initial message
        messages = [
            types.Content(role="user", parts=[types.Part(text=user_query)])
        ]
        
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            tools=[self.tools],
            temperature=0.3,  # Lower for more factual responses
        )
        
        # Agentic loop - keep going until we get a text response
        max_iterations = 10
        for _ in range(max_iterations):
            response = self.client.models.generate_content(
                model=self.model,
                contents=messages,
                config=config
            )
            
            # Check if we have a final text response
            candidate = response.candidates[0]
            parts = candidate.content.parts
            
            # Look for function calls
            function_calls = [p for p in parts if p.function_call]
            
            if not function_calls:
                # No more function calls - return text response
                text_parts = [p.text for p in parts if hasattr(p, 'text') and p.text]
                return "\n".join(text_parts) if text_parts else "No response generated."
            
            # Execute function calls and add results
            messages.append(candidate.content)  # Add assistant's function call message
            
            function_responses = []
            for fc_part in function_calls:
                fc = fc_part.function_call
                result = self._execute_tool(fc.name, dict(fc.args))
                function_responses.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=fc.name,
                            response={"result": result}
                        )
                    )
                )
            
            # Add function results as user message
            messages.append(types.Content(role="user", parts=function_responses))
    def query_with_data(self, user_query: str) -> tuple[str, list[dict]]:
        """
        Process query and return both text response and anime data.
        """
        collected_anime = []
        
        messages = [
            types.Content(role="user", parts=[types.Part(text=user_query)])
        ]
        
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            tools=[self.tools],
            temperature=0.3,
        )
        
        max_iterations = 10
        for _ in range(max_iterations):
            response = self.client.models.generate_content(
                model=self.model,
                contents=messages,
                config=config
            )
            
            candidate = response.candidates[0]
            parts = candidate.content.parts
            function_calls = [p for p in parts if p.function_call]
            
            if not function_calls:
                text_parts = [p.text for p in parts if hasattr(p, 'text') and p.text]
                return "\n".join(text_parts) if text_parts else "No response.", collected_anime
            
            messages.append(candidate.content)
            
            function_responses = []
            for fc_part in function_calls:
                fc = fc_part.function_call
                result = self._execute_tool(fc.name, dict(fc.args))
                
                # Collect anime data from tool results
                try:
                    data = json.loads(result)
                    if isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict) and item.get('anime_id'):
                                anime_entry = {
                                    'anime_id': item.get('anime_id'),
                                    'title': item.get('title', ''),
                                    'cover_image': item.get('cover_image'),
                                    'status': item.get('status'),
                                    'predicted_completion': item.get('predicted_completion'),
                                    'confidence': item.get('confidence'),
                                    'score': item.get('score'),
                                    'episodes': item.get('episodes'),
                                    'current_episode': item.get('current_episode'),
                                    'is_bingeable': item.get('is_bingeable')
                                }
                                # Remove None values to keep response clean
                                anime_entry = {k: v for k, v in anime_entry.items() if v is not None}
                                # Only add if not already in collection (avoid duplicates)
                                if not any(a.get('anime_id') == anime_entry['anime_id'] for a in collected_anime):
                                    collected_anime.append(anime_entry)
                    elif isinstance(data, dict) and data.get('anime_id'):
                        anime_entry = {
                            'anime_id': data.get('anime_id'),
                            'title': data.get('title', ''),
                            'cover_image': data.get('cover_image'),
                            'status': data.get('status'),
                            'predicted_completion': data.get('predicted_completion'),
                            'confidence': data.get('confidence'),
                            'score': data.get('score'),
                            'episodes': data.get('episodes'),
                            'current_episode': data.get('current_episode'),
                            'is_bingeable': data.get('is_bingeable')
                        }
                        # Remove None values
                        anime_entry = {k: v for k, v in anime_entry.items() if v is not None}
                        # Only add if not already in collection
                        if not any(a.get('anime_id') == anime_entry['anime_id'] for a in collected_anime):
                            collected_anime.append(anime_entry)
                except json.JSONDecodeError as e:
                    # Log JSON parsing errors but continue
                    print(f"Warning: Failed to parse tool result as JSON: {e}")
                except Exception as e:
                    # Log unexpected errors but continue
                    print(f"Warning: Error collecting anime data: {e}")
                
                function_responses.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=fc.name,
                            response={"result": result}
                        )
                    )
                )
            
            messages.append(types.Content(role="user", parts=function_responses))
        
        return "Max iterations reached.", collected_anime


def main():
    """Interactive CLI for the agent."""
    print("\n🎌 AnimeScheduleAgent")
    print("=" * 40)
    print("Ask me when anime will finish airing!")
    print("Type 'quit' to exit.\n")
    
    try:
        agent = AnimeScheduleAgent()
    except ValueError as e:
        print(f"❌ Setup error: {e}")
        print("Create a .env file with: GOOGLE_API_KEY=your_key_here")
        return
    
    while True:
        try:
            user_input = input("You: ").strip()
            if not user_input:
                continue
            if user_input.lower() in ("quit", "exit", "q"):
                print("Bye! Happy watching 🎬")
                break
            
            print("\nAgent: ", end="", flush=True)
            response = agent.query(user_input)
            print(response)
            print()
            
        except KeyboardInterrupt:
            print("\n\nBye! Happy watching 🎬")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}\n")


if __name__ == "__main__":
    main()