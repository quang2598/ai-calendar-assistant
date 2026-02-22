"""
LangChain-based LLM Client for AI Agent with Tool Calling Support
Provides agent functionality with tool integration
"""
from typing import TypedDict
from typing import Optional
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage

from config import settings
from logger_config import logger
from models import ChatMessage, MessageRole
from tools import get_all_tools, get_tools_by_name

class Context(TypedDict):
    user_role: str

class LangChainAgent:
    """
    LangChain-based AI Agent with tool calling support
    Provides agent functionality with access to tools
    """
    
    def __init__(self, tools_to_enable: Optional[list] = None):
        """
        Initialize the LangChain Agent
        
        Args:
            tools_to_enable: List of tool names to enable. If None, all tools are enabled.
        """
        logger.info("Initializing LangChain Agent")
        
        # Initialize the LLM with OpenRouter
        self.llm = ChatOpenAI(
            api_key=settings.OPENROUTER_API_KEY,
            base_url=settings.OPENROUTER_BASE_URL,
            model=settings.MODEL_NAME,
            temperature=settings.MODEL_TEMPERATURE,
            max_tokens=settings.MODEL_MAX_TOKENS,
        )
        
        # Get tools
        if tools_to_enable:
            self.tools = get_tools_by_name(tools_to_enable)
        else:
            self.tools = get_all_tools()
        
        logger.info(f"Agent initialized with {len(self.tools)} tools")
        
        self.prompt = "You are a helpful AI assistant with access to various tools. \
            You can help users with calendar management, reminders, email, weather, and more. " \
            "When the user asks for something that requires a tool, use the appropriate tool." \
            "Be helpful, clear, and concise in your responses. If you use a tool, explain what you're doing and the result."
        
        # Create the agent using OpenAI tools agent
        self.agent = create_agent(
            model=self.llm,
            tools=self.tools,
            system_prompt=self.prompt
        )

        
        logger.info("LangChain Agent fully initialized")
    
    async def chat(
        self,
        question: str,
        conversation_history: Optional[list[ChatMessage]] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> dict:
        """
        Execute an agent action based on user input
        
        Args:
            question: The user's question or input
            conversation_history: Optional list of previous messages for context
            model: Optional model override (ignored, LLM already initialized)
            temperature: Optional temperature override
            max_tokens: Optional max tokens override
        
        Returns:
            Dictionary with answer, model used, tokens used, and tool calls
        
        Raises:
            Exception: If agent execution fails
        """
        try:
            logger.info(f"Agent processing question: {question[:100]}...")
            
            # Build chat history
            chat_history = self._build_chat_history(conversation_history)
            
            # Update LLM parameters if provided
            if temperature is not None:
                self.llm.temperature = temperature
            if max_tokens is not None:
                self.llm.max_tokens = max_tokens
            

            result = self.agent.invoke({"messages": [{"role": "user", "content": question}]}, context = chat_history)
            (print(result['messages'][1].content))
            
            # Extract the response
            if result['messages'][1].content:
                answer = result['messages'][1].content
            else:
                answer = "No response generated"
            
            # Extract tool calls from intermediate steps
            tool_calls = self._extract_tool_calls(result.get("intermediate_steps", []))
            
            logger.info(f"Agent response generated. Tool calls: {len(tool_calls)}")
            
            return {
                "answer": answer,
                "model": settings.MODEL_NAME,
                "tokens_used": {
                    "prompt_tokens": 0,  # LangChain doesn't expose this easily
                    "completion_tokens": 0,
                    "total_tokens": 0,
                },
                "tool_calls": tool_calls,
            }

        except Exception as e:
            logger.error(f"Agent error: {str(e)}", exc_info=True)
            raise
    
    def _build_chat_history(self, conversation_history: Optional[list[ChatMessage]]) -> list[BaseMessage]:
        """
        Convert ChatMessage objects to LangChain BaseMessage objects
        
        Args:
            conversation_history: Optional list of ChatMessage objects
        
        Returns:
            List of LangChain BaseMessage objects
        """
        if not conversation_history:
            return []
        
        messages = []
        for msg in conversation_history:
            if msg.role == MessageRole.USER:
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == MessageRole.ASSISTANT:
                messages.append(AIMessage(content=msg.content))
        
        return messages
    
    @staticmethod
    def _extract_tool_calls(intermediate_steps: list) -> list:
        """
        Extract tool calls from intermediate steps
        
        Args:
            intermediate_steps: List of (tool, tool_input) tuples from agent execution
        
        Returns:
            List of tool call dictionaries
        """
        tool_calls = []
        
        for step in intermediate_steps:
            if isinstance(step, tuple) and len(step) == 2:
                tool, tool_input = step
                tool_calls.append({
                    "tool": str(tool),
                    "input": str(tool_input),
                })
        
        return tool_calls
    
    def get_tools_info(self) -> list[dict]:
        """
        Get information about available tools
        
        Returns:
            List of tool information dictionaries
        """
        tools_info = []
        
        for tool in self.tools:
            tools_info.append({
                "name": tool.name,
                "description": tool.description,
            })
        
        return tools_info


# Global agent instance
agent = None


def initialize_agent(tools_to_enable: Optional[list] = None) -> LangChainAgent:
    """
    Initialize the global agent instance
    
    Args:
        tools_to_enable: Optional list of tool names to enable
    
    Returns:
        The initialized LangChainAgent instance
    """
    global agent
    agent = LangChainAgent(tools_to_enable)
    return agent


def get_agent() -> LangChainAgent:
    """
    Get the global agent instance, initializing if necessary
    
    Returns:
        The LangChainAgent instance
    """
    global agent
    if agent is None:
        agent = LangChainAgent()
    return agent
