"""
Pytest configuration and fixtures.
Handles Firebase mocking and path setup.
"""

import sys
import os
from unittest.mock import MagicMock

# Add src directory to Python path
src_path = os.path.join(os.path.dirname(__file__), '..', 'src')
if src_path not in sys.path:
    sys.path.insert(0, src_path)

# Mock Firebase modules before importing anything
sys.modules['firebase_admin'] = MagicMock()
sys.modules['firebase_admin.credentials'] = MagicMock()
sys.modules['firebase_admin.firestore'] = MagicMock()
sys.modules['firebase_admin.db'] = MagicMock()

# Mock Google modules if needed
sys.modules['google'] = MagicMock()
sys.modules['google.cloud'] = MagicMock()
