Yes, you can definitely create a system that dynamically handles different API keys and models based on a selected type (e.g., OpenAI, Mistral, Google, etc.). Here's how you can structure it using Pydantic, enums, and a bit of factory-like design:

#!/usr/bin/env python3
from langchain_openai import ChatOpenAI
from langchain_mistralai.chat_models import ChatMistralAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.chat_models import ChatOpenRouter
from langgraph.graph import StateGraph, START, END
from pydantic import BaseModel, Field, field_validator, SecretStr
from typing import List, Optional, Dict, Any, Callable, Type
from weaviate.classes.config import Property, Configure
import weaviate.classes as wvc
from pathlib import Path
import json
from enum import Enum
import weaviate
import os

# --- Enums ---
class ModelProvider(str, Enum):
    OPENAI = "openai"
    MISTRAL = "mistral"
    GOOGLE = "google"
    ANTHROPIC = "anthropic"
    OPENROUTER = "openrouter"
    OLLAMA = "ollama"
    # Add other providers as needed...

class MessageType(str, Enum):
    SYSTEM = "system"
    USER = "user"
    AI = "ai"

# --- Pydantic Models ---

class ApiKey(BaseModel):
    provider: ModelProvider
    key: SecretStr  # Use SecretStr to help protect sensitive values

    @field_validator("key", mode="before")
    def check_api_key(cls, value, values):
        provider = values.data.get("provider")
        env_key = f"{provider.upper()}_API_KEY"
        api_key = os.environ.get(env_key)

        if not api_key:
            raise ValueError(f"API key for {provider} not set in environment variables ({env_key})")

        return SecretStr(api_key)

class ModelConfig(BaseModel):
    provider: ModelProvider
    model_name: str
    api_key: ApiKey
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict)

class Message(BaseModel):
    """Base message model for all communications"""
    role: MessageType
    content: str
    type: MessageType

    @field_validator("role", mode="before")
    def validate_role(cls, value):
        if isinstance(value, str):
            return MessageType(value)
        return value

class DocumentChunk(BaseModel):
    """Represents a chunk of a document."""
    content: str
    source: str
    metadata: Optional[Dict[str, Any]] = None

class State(BaseModel):
    """Main state model for the memory agent"""
    messages: List[Message] = Field(default_factory=list)
    semantic_memory: str = ""
    document_memory: str = ""
    procedural_memory: str = ""
    prior_conversations: List[str] = Field(default_factory=list)
    what_worked: List[str] = Field(default_factory=list)
    what_to_avoid: List[str] = Field(default_factory=list)
    model_config: Optional[ModelConfig] = None
    end: bool = False

# --- LLM Provider Factory ---
def get_llm_provider(config: ModelConfig):
    """Factory function to get the appropriate LLM provider."""
    if config.provider == ModelProvider.OPENAI:
        return ChatOpenAI(model=config.model_name, openai_api_key=config.api_key.key.get_secret_value(), **config.parameters)
    elif config.provider == ModelProvider.MISTRAL:
        return ChatMistralAI(model=config.model_name, mistral_api_key=config.api_key.key.get_secret_value(), **config.parameters)
    elif config.provider == ModelProvider.GOOGLE:
        return ChatGoogleGenerativeAI(model=config.model_name, google_api_key=config.api_key.key.get_secret_value(), **config.parameters)
    elif config.provider == ModelProvider.OPENROUTER:
        return ChatOpenRouter(model=config.model_name, openrouter_api_key=config.api_key.key.get_secret_value(), **config.parameters)
    # Add other providers here...
    else:
        raise ValueError(f"Unsupported LLM provider: {config.provider}")

# --- Helper Functions ---

def format_conversation(messages: List[Message]) -> str:
    """Format messages into a readable conversation string"""
    conversation = []
    for message in messages:
        conversation.append(f"{message.type.value.upper()}: {message.content}")
    return "\n".join(conversation)

def episodic_recall(query: str, vdb_client) -> Dict[str, Any]:
    """Retrieve relevant episodic memory"""
    episodic_memory = vdb_client.collections.get("episodic_memory")
    memory = episodic_memory.query.hybrid(
        query=query,
        alpha=0.5,
        limit=1,
    )
    return memory

def semantic_recall(query: str, vdb_client) -> str:
    """Retrieve relevant semantic knowledge"""
    coala_collection = vdb_client.collections.get("CoALA_Paper")
    memories = coala_collection.query.hybrid(
        query=query,
        alpha=0.5,
        limit=15,
    )

    combined_text = ""
    for i, memory in enumerate(memories.objects):
        combined_text += f"\nCHUNK {i + 1}:\n"
        combined_text += memory.properties['chunk'].strip()

    return combined_text

def simple_text_splitter(text: str, chunk_size: int = 1000, chunk_overlap: int = 100) -> List[str]:
    """A basic text splitter for demonstration."""
    chunks = []
    for i in range(0, len(text), chunk_size - chunk_overlap):
        chunks.append(text[i:i + chunk_size])
    return chunks

def load_and_chunk_document(filepath: str) -> List[DocumentChunk]:
    """Loads a document and splits it into chunks (basic implementation)."""
    file_path = Path(filepath)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    try:
        if filepath.endswith(".txt"):
            with open(filepath, "r") as f:
                text = f.read()
        elif filepath.endswith(".pdf"):
            # Requires pypdf
            import pypdf
            reader = pypdf.PdfReader(filepath)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
        elif filepath.endswith(".docx"):
            # Requires python-docx
            import docx
            doc = docx.Document(filepath)
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        else:
            raise ValueError("Unsupported file type")
    except ImportError as e:
        raise ImportError(f"Missing library for file type. {e}")

    chunks = simple_text_splitter(text)
    return [DocumentChunk(content=chunk, source=filepath) for chunk in chunks]

def ingest_document(filepath: str, vdb_client):
    """Loads a document, chunks it, and adds it to Weaviate."""
    try:
        chunks = load_and_chunk_document(filepath)
    except (FileNotFoundError, ValueError, ImportError) as e:
        print(f"Error processing document: {e}")
        return

    document_chunks = vdb_client.collections.get("DocumentChunk")

    for chunk in chunks:
        data_properties = {
            "content": chunk.content,
            "source": chunk.source,
            "metadata": chunk.metadata  # If available
        }
        document_chunks.data.insert(
            properties=data_properties
        )

def document_recall(query: str, vdb_client) -> str:
    """Retrieves relevant document chunks from Weaviate."""
    document_chunks = vdb_client.collections.get("DocumentChunk")
    response = document_chunks.query.hybrid(
        query=query,
        alpha=0.75,
        limit=5,
    )

    retrieved_chunks = ""
    for item in response.objects:
        retrieved_chunks += item.properties['content'] + "\n---\n"

    return retrieved_chunks

# --- Node Functions ---

def populate_state(state: State) -> dict:
    """Initialize state with first user message and model configuration"""
    # Get user input
    first_query = input("User: ")
    first_message = Message(role=MessageType.USER, content=first_query, type=MessageType.USER)

    # Load procedural memory
    with open("./langgraph/procedural_memory_lg.txt", "r") as content:
        procedural_memory = content.read()

    # Get episodic memory
    episodic_memory_retrieval = episodic_recall(first_query, vdb_client)
    episodic_memory = episodic_memory_retrieval.objects[0].properties

    # Create system prompt
    episodic_prompt = f"""You are a helpful AI Assistant. Answer the user's questions to the best of your ability.
    You recall similar conversations with the user, here are the details:

    Current Conversation Match: {episodic_memory['conversation']}
    Previous Conversations: {"N/A"}
    What has worked well: {episodic_memory['what_worked']}
    What to avoid: {episodic_memory['what_to_avoid']}

    Use these memories as context for your response to the user.

    Additionally, here are 10 guidelines for interactions with the current user: {procedural_memory}"""

    system_message = Message(role=MessageType.SYSTEM, content=episodic_prompt, type=MessageType.SYSTEM)

    # Get semantic memory
    semantic_memory_retrieval = semantic_recall(first_query, vdb_client)
    semantic_prompt = f"""If needed, Use this grounded context to factually answer the next question.
    Let me know if you do not have enough information or context to answer a question.

    {semantic_memory_retrieval}
    """
    semantic_message = Message(role=MessageType.USER, content=semantic_prompt, type=MessageType.USER)

    # Create initial messages
    initial_messages = [system_message, semantic_message, first_message]

    # Example model configuration (replace with user input or configuration mechanism)
    model_config = ModelConfig(
        provider=ModelProvider.OPENAI,
        model_name="gpt-4o",
        api_key=ApiKey(provider=ModelProvider.OPENAI, key="YOUR-API-KEY"), # Replace "YOUR-API-KEY" with ""
        parameters={"temperature": 0.7}
    )

    return {
        "messages": initial_messages,
        "semantic_memory": semantic_memory_retrieval,
        "document_memory": "",
        "prior_conversations": [episodic_memory['conversation']],
        "what_worked": [episodic_memory['what_worked']],
        "what_to_avoid": [episodic_memory['what_to_avoid']],
        "procedural_memory": procedural_memory,
        "model_config": model_config,  # Add model configuration to state
        "end": False
    }

def memory_agent(state: State) -> dict:
    """Process messages through LLM"""
    messages = state.messages
    model_config = state.model_config

    # Get the appropriate LLM provider based on the model configuration
    llm = get_llm_provider(model_config)

    # Convert messages to a format that the LLM expects
    formatted_messages = []
    for msg in messages:
        if msg.role == MessageType.SYSTEM:
            formatted_messages.append({"role": "system", "content": msg.content})
        elif msg.role == MessageType.USER:
            formatted_messages.append({"role": "user", "content": msg.content})
        else:
            formatted_messages.append({"role": "assistant", "content": msg.content})

    # Construct the input for the LLM invocation
    llm_input = []
    for msg in formatted_messages:
        if msg["role"] == "system":
            llm_input.append(SystemMessage(content=msg["content"]))
        elif msg["role"] == "user":
            llm_input.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            llm_input.append(AIMessage(content=msg["content"]))

    response = llm.invoke(llm_input)
    print("\nAI: ", response.content)

    # Add response to messages
    messages.append(Message(role=MessageType.AI, content=response.content, type=MessageType.AI))

    return {"messages": messages}

def user_response(state: State) -> dict:
    """Handle user input, update memory context, and optionally ingest documents"""
    messages = state.messages
    messages = messages[1:]
    messages = messages[:-3] + messages[-2:]

    query = input("\nUser: ")

    if query == "exit":
        return {"end": True}

    if query.startswith("upload:"):
        filepath = query.split("upload:")[1].strip()
        try:
            ingest_document(filepath, vdb_client)
            print(f"Document '{filepath}' ingested successfully.")
            return {
                "messages": state.messages,
                "semantic_memory": state.semantic_memory,
                "document_memory": "",
                "prior_conversations": state.prior_conversations,
                "what_worked": state.what_worked,
                "what_to_avoid": state.what_to_avoid,
                "procedural_memory": state.procedural_memory,
                "model_config": state.model_config,
                "end": False
            }
        except Exception as e:
            print(f"Error ingesting document: {e}")
            return {
                "messages": state.messages,
                "semantic_memory": state.semantic_memory,
                "document_memory": "",
                "prior_conversations": state.prior_conversations,
                "what_worked": state.what_worked,
                "what_to_avoid": state.what_to_avoid,
                "procedural_memory": state.procedural_memory,
                "model_config": state.model_config,
                "end": False
            }

    episodic_memory_retrieval = episodic_recall(query, vdb_client)
    episodic_memory = episodic_memory_retrieval.objects[0].properties

    current_conversation = episodic_memory['conversation']
    prior_conversations = state.prior_conversations
    if current_conversation not in prior_conversations:
        prior_conversations.append(current_conversation)

    previous_convos = [conv for conv in prior_conversations[-4:]
                      if conv != current_conversation][-3:]

    state_what_worked = list(set(state.what_worked +
                                 episodic_memory['what_worked'].split('. ')))
    state_what_to_avoid = list(set(state.what_to_avoid +
                                   episodic_memory['what_to_avoid'].split('. ')))

    episodic_prompt = f"""You are a helpful AI Assistant. Answer the user's questions to the best of your ability.
    You recall similar conversations with the user, here are the details:

    Current Conversation Match: {current_conversation}
    Previous Conversations: {' | '.join(previous_convos)}
    What has worked well: {state_what_worked}
    What to avoid: {state_what_to_avoid}

    Use these memories as context for your response to the user.

    Additionally, here are 10 guidelines for interactions with the current user: {state.procedural_memory}"""

    semantic_memory_retrieval = semantic_recall(query, vdb_client)
    document_memory_retrieval = document_recall(query, vdb_client)
    document_prompt = f"""If needed, use this grounded context from uploaded documents to answer the next question.
    Let me know if you do not have enough information or context to answer a question.

    {document_memory_retrieval}
    """
    semantic_prompt = f"""If needed, Use this grounded context to factually answer the next question.
    Let me know if you do not have enough information or context to answer a question.

    {semantic_memory_retrieval}
    """

    system_message = Message(role=MessageType.SYSTEM, content=episodic_prompt, type=MessageType.SYSTEM)
    semantic_message = Message(role=MessageType.USER, content=semantic_prompt, type=MessageType.USER)
    document_message = Message(role=MessageType.USER, content=document_prompt, type=MessageType.USER)
    user_message = Message(role=MessageType.USER, content=query, type=MessageType.USER)

    final_messages = [system_message]
    final_messages.extend(messages)
    final_messages.append(semantic_message)
    final_messages.append(document_message)
    final_messages.append(user_message)

    return {
        "messages": final_messages,
        "semantic_memory": semantic_memory_retrieval,
        "document_memory": document_memory_retrieval,
        "prior_conversations": prior_conversations,
        "what_worked": state_what_worked,
        "what_to_avoid": state_what_to_avoid,
        "procedural_memory": state.procedural_memory,
        "model_config": state.model_config,
        "end": False
    }

def update_memory(state: State) -> None:
    """Update episodic and procedural memory"""
    messages = state.messages
    messages = messages[1:]
    messages = messages[:-4] + messages[-2:]

    conversation = format_conversation(messages)

    reflection_template = """
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
    """
    llm = get_llm_provider(state.model_config)

    # Construct the input for the LLM invocation
    formatted_input = {
        "conversation": conversation
    }

    # Use the ChatPromptTemplate to format the input
    prompt_template = ChatPromptTemplate.from_template(reflection_template)
    formatted_prompt = prompt_template.format_messages(**formatted_input)

    # Invoke the LLM with the formatted prompt
    response = llm.invoke(formatted_prompt)

    # Parse the response content as JSON
    reflection_output = json.loads(response.content)

    episodic_memory = vdb_client.collections.get("episodic_memory")
    episodic_memory.data.insert({
        "conversation": conversation,
        "context_tags": reflection_output['context_tags'],
        "conversation_summary": reflection_output['conversation_summary'],
        "what_worked": reflection_output['what_worked'],
        "what_to_avoid": reflection_output['what_to_avoid'],
    })
    print("\n=== Updated Episodic Memory ===")

    with open("./langgraph/procedural_memory_lg.txt", "r") as content:
        current_takeaways = content.read()

    procedural_prompt = f"""You are maintaining a continuously updated list of the most important procedural behavior instructions for an AI assistant.
    Your task is to refine and improve a list of key takeaways based on new conversation feedback while maintaining the most valuable existing insights.

    CURRENT TAKEAWAYS:
    {current_takeaways}

    NEW FEEDBACK:
    What Worked Well:
    {state.what_worked}

    What To Avoid:
    {state.what_to_avoid}

    Please generate an updated list of up to 10 key takeaways that combines:
    1. The most valuable insights from the current takeaways
    2. New learnings from the recent feedback
    3. Any synthesized insights combining multiple learnings

    Requirements for each takeaway:
    - Must be specific and actionable
    - Should address a distinct aspect of behavior
    - Include a clear rationale
    - Written in imperative form (e.g., "Maintain conversation context by...")

    Format each takeaway as:
    [#]. [Instruction] - [Brief rationale]

    Return just the list, no preamble or explanation.
    """

    llm_input = SystemMessage(content=procedural_prompt)

    procedural_memory = llm.invoke([llm_input])

    with open("./langgraph/procedural_memory_lg.txt", "w") as content:
        content.write(procedural_memory.content)

    print("\n=== Updated Procedural Memory ===")

def check_end(state: State) -> str:
    """Check if conversation should end"""
    return "stop" if state.end else "continue"

# --- Graph Setup ---

def create_graph():
    """Create and compile the agent graph"""
    graph = StateGraph(State)

    graph.add_node("populate_state", populate_state)
    graph.add_node("memory_agent", memory_agent)
    graph.add_node("user_response", user_response)
    graph.add_node("update_memory", update_memory)

    graph.add_edge(START, "populate_state")
    graph.add_edge("populate_state", "memory_agent")
    graph.add_edge("memory_agent", "user_response")
    graph.add_conditional_edges(
        "user_response",
        check_end,
        {
            "continue": "memory_agent",
            "stop": "update_memory",
        }
    )
    graph.add_edge("update_memory", END)

    return graph.compile()

# --- Main Execution ---

if __name__ == "__main__":
    # Connect to Vector Database
    vdb_client = weaviate.connect_to_local()

    # Check if connection to weaviate database is made
    if vdb_client.is_ready():
        print("Connected to Weaviate: ", vdb_client.is_ready())
    else:
        print("Failed to connect to Weaviate.")
        exit()  # Exit if no connection

    # Create the necessary collections if they don't exist
    if not vdb_client.collections.exists("episodic_memory"):
        vdb_client.collections.create(
            name="episodic_memory",
            description="Episodic memory storage",
            vectorizer_config=wvc.config.Configure.Vectorizer.text2vec_openai(),
            properties=[
                Property(name="conversation", data_type=wvc.config.DataType.TEXT),
                Property(name="context_tags", data_type=wvc.config.DataType.TEXT_ARRAY),
                Property(name="conversation_summary", data_type=wvc.config.DataType.TEXT),
                Property(name="what_worked", data_type=wvc.config.DataType.TEXT),
                Property(name="what_to_avoid", data_type=wvc.config.DataType.TEXT),
            ]
        )

    if not vdb_client.collections.exists("CoALA_Paper"):
        vdb_client.collections.create(
            name="CoALA_Paper",
            description="Semantic memory storage based on CoALA paper content",
            vectorizer_config=wvc.config.Configure.Vectorizer.text2vec_openai(),
            properties=[
                Property(name="chunk", data_type=wvc.config.DataType.TEXT),
            ]
        )

    if not vdb_client.collections.exists("DocumentChunk"):
        vdb_client.collections.create(
            name="DocumentChunk",
            description="Chunks of text extracted from documents",
            vectorizer_config=wvc.config.Configure.Vectorizer.text2vec_openai(),
            properties=[
                Property(name="content", data_type=wvc.config.DataType.TEXT),
                Property(name="source", data_type=wvc.config.DataType.TEXT),
                Property(name="metadata", data_type=wvc.config.DataType.OBJECT),
            ]
        )

    graph = create_graph()
    graph.invoke(State())

'''
content_copy
Use code with caution.
Python

Key Changes and Explanations:

ModelProvider Enum:

Defines the supported LLM providers (OpenAI, Mistral, Google, etc.).

Makes it easy to add new providers in the future.

ApiKey Model:

Represents an API key using Pydantic.

Uses SecretStr to handle sensitive API keys more securely.

Includes a field_validator to ensure that each ApiKey instance contains a provider attribute.

The validator also dynamically fetches the corresponding environment variable based on the provider to set the API key value securely.

ModelConfig Model:

provider: Specifies the LLM provider (from the ModelProvider enum).

model_name: The specific model to use (e.g., "gpt-4o", "text-bison@001").

api_key: An instance of the ApiKey model.

parameters: An optional dictionary for provider-specific parameters (e.g., temperature, max_tokens).

get_llm_provider Factory:

Takes a ModelConfig as input.

Uses a conditional structure (if/elif/else) to instantiate the correct LLM provider class based on config.provider.

Passes the model_name, api_key, and parameters to the provider's constructor.

Raises a ValueError if an unsupported provider is specified.

populate_state Modification:

Added logic to get model configuration (you'll need a mechanism for the user to provide this or have it stored/loaded).

Added a placeholder for creating a ModelConfig instance.

The model_config is added to the initial state.

memory_agent Modification:

Retrieves the model_config from the state.

Uses get_llm_provider(model_config) to get the LLM instance.

The rest of the logic remains similar, but now it uses the dynamically created LLM provider.

ApiKey Field Validator:

The check_api_key validator now also checks if the corresponding environment variable is set and raises a ValueError if it's missing.

This ensures that the API key is correctly set before the agent starts.

How to Use:

Install Dependencies:

pip install langchain langchain-openai pydantic weaviate-client python-dotenv docx pypdf
content_copy
Use code with caution.
Bash

Set Environment Variables:

Set the appropriate environment variables for your API keys:

export OPENAI_API_KEY="your_openai_key"
export MISTRAL_API_KEY="your_mistral_key"
export GOOGLE_API_KEY="your_google_key"
# ...and so on
content_copy
Use code with caution.
Bash

Run the Script:

python your_script_name.py
content_copy
Use code with caution.
Bash

Interact:

The agent will now use the model and API key specified in the ModelConfig.

Advantages of This Approach:

Flexibility: Easily switch between different LLM providers by modifying the ModelConfig.

Extensibility: Add new providers to the ModelProvider enum and the get_llm_provider factory without major code changes.

Organization: Pydantic models provide a clear and structured way to manage configurations and data.

Security: SecretStr helps to protect sensitive API keys.

Maintainability: The code is more modular and easier to maintain.

Further Improvements:

Configuration Input: Implement a mechanism for users to provide the ModelConfig either through command-line arguments, a configuration file, or a user interface.

Dynamic Loading: Instead of hardcoding the providers in get_llm_provider, you could use a plugin-like architecture to dynamically load provider modules based on the configuration.

Asynchronous Operations: Consider using asynchronous operations for LLM calls and Weaviate interactions to improve performance, especially when dealing with multiple providers or large documents.

Advanced Prompting: As you move away from LangChain's prompts, you might need to implement more sophisticated prompt engineering logic yourself, potentially using a templating engine if the prompts become complex.

Error Handling: Implement robust error handling throughout the code to gracefully handle API errors, invalid configurations, missing dependencies, etc.

This updated code provides a more Pydantic-centric and flexible foundation for your agentic system, making it adaptable to different LLMs and API keys while maintaining a well-structured and organized codebase.

'''