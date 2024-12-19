from datetime import datetime
from typing import List, Optional, Set
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
import weaviate

# Base Message Model
class Message(BaseModel):
    """Base message model for all communications"""
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)

# Memory Models
class WorkingMemory(BaseModel):
    """Stores current conversation context and active state"""
    messages: List[Message] = []
    system_prompt: str = "You are a helpful AI Assistant."
    semantic_context: Optional[str] = None

class EpisodicMemory(BaseModel):
    """Stores historical experiences and reflections"""
    conversation: str
    context_tags: List[str]
    conversation_summary: str
    what_worked: str
    what_to_avoid: str

class SemanticMemory(BaseModel):
    """Stores factual knowledge and information"""
    chunk: str

class ProceduralMemory(BaseModel):
    """Stores interaction guidelines and learned behaviors"""
    guidelines: List[str]

# Memory Tools
class MemoryTools(BaseModel):
    """Tools for memory operations"""
    
    def format_conversation(self, messages: List[Message]) -> str:
        """Format messages into a readable conversation string"""
        conversation = []
        for message in messages[1:]:  # Skip system message
            conversation.append(f"{message.role.upper()}: {message.content}")
        return "\n".join(conversation)

    def episodic_recall(self, query: str, vdb_client) -> EpisodicMemory:
        """Retrieve relevant episodic memory"""
        episodic_memory = vdb_client.collections.get("episodic_memory")
        memory = episodic_memory.query.hybrid(
            query=query,
            alpha=0.5,
            limit=1,
        )
        props = memory.objects[0].properties
        return EpisodicMemory(
            conversation=props['conversation'],
            context_tags=props['context_tags'],
            conversation_summary=props['conversation_summary'],
            what_worked=props['what_worked'],
            what_to_avoid=props['what_to_avoid']
        )

    def semantic_recall(self, query: str, vdb_client) -> str:
        """Retrieve relevant semantic knowledge"""
        coala_collection = vdb_client.collections.get("CoALA_Paper")
        memories = coala_collection.query.hybrid(
            query=query,
            alpha=0.5,
            limit=15,
        )
        combined_text = ""
        for i, memory in enumerate(memories.objects):
            combined_text += f"\nCHUNK {i+1}:\n"
            combined_text += memory.properties['chunk'].strip()
        return combined_text

    def load_procedural_memory(self) -> ProceduralMemory:
        """Load procedural memory guidelines"""
        with open("./procedural_memory.txt", "r") as content:
            guidelines = content.read().split("\n")
        return ProceduralMemory(guidelines=guidelines)

# Memory Agent
class MemoryAgent(BaseModel):
    """Main agent class integrating all memory types"""
    working_memory: WorkingMemory = Field(default_factory=WorkingMemory)
    tools: MemoryTools = Field(default_factory=MemoryTools)
    llm: ChatOpenAI = Field(default_factory=lambda: ChatOpenAI(temperature=0.7, model="gpt-4"))
    vdb_client: Optional[object] = None

    def initialize(self, vdb_client):
        """Initialize the agent with vector database client"""
        self.vdb_client = vdb_client

    def update_system_prompt(self, query: str) -> str:
        """Update system prompt with memory context"""
        # Get episodic memory
        episodic = self.tools.episodic_recall(query, self.vdb_client)
        
        # Load procedural memory
        procedural = self.tools.load_procedural_memory()
        
        # Format system prompt
        prompt = f"""You are a helpful AI Assistant. Answer the user's questions to the best of your ability.
        You recall similar conversations with the user, here are the details:
        
        Current Conversation Match: {episodic.conversation}
        What has worked well: {episodic.what_worked}
        What to avoid: {episodic.what_to_avoid}
        
        Use these memories as context for your response to the user.
        
        Additionally, here are guidelines for interactions with the current user:
        {' '.join(procedural.guidelines)}"""
        
        return prompt

    def get_semantic_context(self, query: str) -> str:
        """Get relevant semantic context"""
        context = self.tools.semantic_recall(query, self.vdb_client)
        return f"""If needed, Use this grounded context to factually answer the next question.
        Let me know if you do not have enough information or context to answer a question.
        
        {context}
        """

    def process_message(self, user_input: str) -> str:
        """Process user message and generate response"""
        # Update system prompt
        system_prompt = self.update_system_prompt(user_input)
        system_message = SystemMessage(content=system_prompt)
        
        # Get semantic context
        semantic_context = self.get_semantic_context(user_input)
        semantic_message = HumanMessage(content=semantic_context)
        
        # Create user message
        user_message = HumanMessage(content=user_input)
        
        # Update working memory
        self.working_memory.messages = [
            system_message,
            *[msg for msg in self.working_memory.messages if not isinstance(msg, SystemMessage)],
            semantic_message,
            user_message
        ]
        
        # Generate response
        response = self.llm.invoke(self.working_memory.messages)
        
        # Add response to working memory
        self.working_memory.messages.append(response)
        
        return response.content

    def save_episodic_memory(self):
        """Save conversation to episodic memory"""
        conversation = self.tools.format_conversation(self.working_memory.messages)
        
        # Create reflection using LLM
        reflection_prompt = ChatPromptTemplate.from_template("""
        You are analyzing conversations to create memories that will help guide future interactions.
        Review the conversation and create a memory reflection following these rules:
        1. For any field where you don't have enough information, use "N/A"
        2. Be extremely concise - each string should be one clear, actionable sentence
        3. Focus only on information that would be useful for future conversations
        4. Context_tags should be specific enough to match similar situations but general enough to be reusable
        
        Output valid JSON in exactly this format:
        {
            "context_tags": [string],
            "conversation_summary": string,
            "what_worked": string,
            "what_to_avoid": string
        }
        
        Here is the conversation:
        {conversation}
        """)
        
        reflection = reflection_prompt | self.llm | JsonOutputParser()
        memory = reflection.invoke({"conversation": conversation})
        
        # Save to vector database
        episodic_memory = self.vdb_client.collections.get("episodic_memory")
        episodic_memory.data.insert({
            "conversation": conversation,
            "context_tags": memory['context_tags'],
            "conversation_summary": memory['conversation_summary'],
            "what_worked": memory['what_worked'],
            "what_to_avoid": memory['what_to_avoid'],
        })