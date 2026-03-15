"""
Test script for the AI Agent Microservice API
Run the main.py server first, then execute this script
"""
import asyncio
import aiohttp
import json
from typing import Optional


class APITester:
    """Test client for the AI Agent API"""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
    
    async def health_check(self) -> dict:
        """Test the health check endpoint"""
        print("\n=== Testing Health Check ===")
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.base_url}/health") as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                return data
    
    async def send_chat_message(
        self,
        question: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> dict:
        """Send a chat message to the API"""
        print(f"\n=== Testing Chat Endpoint ===")
        print(f"Question: {question}")
        
        payload = {
            "question": question,
            "conversation_history": None,
        }
        
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/api/chat",
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                return data
    
    async def get_tools(self) -> dict:
        """Get available tools from the API"""
        print("\n=== Testing Tools Endpoint ===")
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.base_url}/api/tools") as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Available Tools: {data.get('count', 0)}")
                if "tools" in data:
                    for tool in data["tools"]:
                        print(f"  - {tool['name']}: {tool['description'][:60]}...")
                print(f"Full Response: {json.dumps(data, indent=2)}")
                return data
    
    async def test_validation(self) -> dict:
        """Test request validation"""
        print("\n=== Testing Validation (Empty Question) ===")
        payload = {
            "question": "",
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/api/chat",
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                return data
    
    async def run_all_tests(self):
        """Run all tests"""
        print("Starting API Tests...")
        print(f"Base URL: {self.base_url}")
        
        try:
            # Test health check
            await self.health_check()
            
            # Test tools endpoint
            await self.get_tools()
            
            # Test chat endpoint
            await self.send_chat_message(
                "What is the meaning of life?",
                temperature=0.7,
                max_tokens=512
            )
            
            # Test validation
            await self.test_validation()
            
            print("\n=== All Tests Completed ===")
        
        except aiohttp.ClientConnectorError:
            print(f"ERROR: Could not connect to {self.base_url}")
            print("Make sure the server is running: python main.py")
        except Exception as e:
            print(f"ERROR: {str(e)}")


async def main():
    """Main test function"""
    tester = APITester()
    await tester.run_all_tests()


if __name__ == "__main__":
    print("AI Agent Microservice - API Test Suite")
    print("=" * 50)
    asyncio.run(main())
