"""Vercel entrypoint for FastAPI backend."""
import os
import sys

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the FastAPI app from api/main.py
from api.main import app

# This is the entrypoint Vercel will use
