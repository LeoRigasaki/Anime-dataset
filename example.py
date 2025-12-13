"""Example usage of AnimeScheduleAgent."""
import os
import sys

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.agent import AnimeScheduleAgent


def run_examples():
    """Run example queries to demonstrate the agent."""
    
    # Check for API key
    if not os.getenv("GOOGLE_API_KEY"):
        print("❌ GOOGLE_API_KEY not found!")
        print("Set it with: export GOOGLE_API_KEY=your_key_here")
        print("Or create a .env file with: GOOGLE_API_KEY=your_key_here")
        return
    
    agent = AnimeScheduleAgent()
    
    # Example queries
    queries = [
        "When will Solo Leveling Season 2 finish airing?",
        "Is Frieren done airing? Can I binge it?",
        "What Winter 2025 anime will be done by March?",
    ]
    
    print("\n🎌 AnimeScheduleAgent - Example Queries")
    print("=" * 50)
    
    for query in queries:
        print(f"\n📝 Query: {query}")
        print("-" * 40)
        response = agent.query(query)
        print(f"🤖 Response:\n{response}")
        print()


if __name__ == "__main__":
    run_examples()
