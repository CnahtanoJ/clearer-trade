import sys
import os

# Add root directory to sys.path so app module can be imported in Vercel Serverless environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
