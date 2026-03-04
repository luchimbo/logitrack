"""
Vercel serverless entry point.
Mounts the FastAPI app so Vercel routes /api/* here.
"""
import os
import sys

# Add backend directory to Python path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from main import app  # noqa: E402 - FastAPI app
