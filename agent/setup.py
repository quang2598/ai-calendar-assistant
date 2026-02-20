#!/usr/bin/env python
"""
Setup script for AI Agent Microservice
Installs dependencies and validates the environment
"""
import subprocess
import sys
import os
from pathlib import Path


def check_python_version():
    """Check if Python version is 3.8 or higher"""
    if sys.version_info < (3, 8):
        print("❌ Python 3.8 or higher is required")
        sys.exit(1)
    print(f"✓ Python version: {sys.version}")


def check_env_file():
    """Check if .env file exists and has API key"""
    env_path = Path('.env')
    if not env_path.exists():
        print("❌ .env file not found")
        print("   Create .env file with your OPENROUTER_API_KEY")
        return False
    
    with open(env_path) as f:
        content = f.read()
        if 'OPENROUTER_API_KEY' not in content or 'your_api_key' in content.lower():
            print("❌ OPENROUTER_API_KEY not properly configured in .env")
            return False
    
    print("✓ .env file exists and API key is configured")
    return True


def install_dependencies():
    """Install Python dependencies"""
    print("\nInstalling dependencies...")
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'])
        print("✓ Dependencies installed successfully")
        return True
    except subprocess.CalledProcessError:
        print("❌ Failed to install dependencies")
        return False


def create_logs_directory():
    """Create logs directory if it doesn't exist"""
    logs_dir = Path('logs')
    logs_dir.mkdir(exist_ok=True)
    print("✓ Logs directory ready")


def validate_imports():
    """Validate that all required modules can be imported"""
    print("\nValidating imports...")
    required_modules = [
        'fastapi',
        'uvicorn',
        'pydantic',
        'dotenv',
        'openai',
        'aiohttp'
    ]
    
    missing = []
    for module in required_modules:
        try:
            __import__(module)
            print(f"  ✓ {module}")
        except ImportError:
            print(f"  ❌ {module}")
            missing.append(module)
    
    if missing:
        print(f"\n❌ Missing modules: {', '.join(missing)}")
        return False
    
    print("✓ All required modules are available")
    return True


def main():
    """Run setup"""
    print("=" * 60)
    print("AI Agent Microservice - Setup")
    print("=" * 60)
    
    # Check Python version
    check_python_version()
    
    # Check .env file
    if not check_env_file():
        return False
    
    # Create logs directory
    create_logs_directory()
    
    # Install dependencies
    if not install_dependencies():
        return False
    
    # Validate imports
    if not validate_imports():
        return False
    
    print("\n" + "=" * 60)
    print("✓ Setup completed successfully!")
    print("=" * 60)
    print("\nTo start the service, run:")
    print("  python main.py")
    print("\nAPI Documentation will be available at:")
    print("  http://localhost:8000/api/docs")
    print("\n" + "=" * 60)
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
