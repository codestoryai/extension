# Agent Memory - Can LLMs *Really* Think?

<img src="./media/memory.png" width=600>

*[Cognitive Architectures for Language Agents, 2024](https://arxiv.org/pdf/2309.02427)*

LLMs are considered "stateless" in that every time you invoke an LLM call, it is like the first time it's ever seen the input being passed through. Given this quirk, multi-turn LLM agents have a unique challenge to overcome with fully understanding and navigating a vast world model which we humans do naturally.

Being a human has a lot of advantages over a language model when executing a task. We bring our general knowledge about the world and lived experience, our understanding of prior similar task experiences and their takeaways, what we've specifically learned how to do or been taught, and then our ability to instantly contextualize and shape our approach to a task as we're working through it. In essence, we have advanced memory and the ability to learn from and apply learnings to new experiences. 

LLMs sort of have some memory, mostly their general knowledge or traits picked up from training and additional fine tuning but suffer from a lack of the other characteristics outlined prior. To compensate for this, we can model different forms of memory, recall, and learning within our agentic system design. Specifically, we'll create a simple RAG agent to model 4 kinds of memory:

- **Working Memory** - Current conversation and immediate context
- **Episodic Memory** - Historical experiences and their takeaways
- **Semantic Memory** - Knowledge context and factual grounding
- **Procedural Memory** - The "rules" and "skills" for interaction

These four memory systems provide a holistic approach to understanding and architecting a part of cognitive design into an agent application. In this notebook we'll break down each type of memory and an example approach to implementing them into a whole agent experience.
