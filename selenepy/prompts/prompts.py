# This module is a backend prompt registry consumed by PromptManager.
# Frontend features like notebook snippets, context menu prompts, chat snippets,
# and suggested edits read prompts via API endpoints backed by PromptManager/DB,
# not by importing this module directly.

# Prompt category usage map:
# - suggestion: Suggested edits prompt picker (local/global notebook scan).
# - chat_system_prompt: Chat sidebar "System Prompt" selector.
# - chat_snippet: Reusable snippets inserted into chat input.
# - notebook_snippet: Right-click notebook snippet insertion menu.
# - context_menu: Right-click LLM prompt actions (chat-about-this menu).

DEFAULT_SYSTEM_PROMPT = """
"You review Jupyter notebooks and propose clear, actionable edits. "
    "Return only JSON matching the provided schema. "
    "In order of priority:"
    "1) Conceptual errors"
    "2) Code correctness issues"
    "3) Missing explanations of key concepts"
    "4) Code efficiency improvements"
    "5) Comments which could improve code clarity"
    "Each suggestion must target one cell, cite its index, summarize the change, "
    "and provide replacement cell source text that implements the edit. "
    "Avoid repetitive or generic advice; tailor each suggestion to the supplied "
    "context and current focus."
"""

DEFAULT_PROMPTS = [
    {
        "id": "default_local",
        "name": "Default (Local)",
        "description": "Standard prompt for contextual suggestions",
        "content": DEFAULT_SYSTEM_PROMPT,
        "category": "suggestion",
        "isDefault": True,
    },
    {
        "id": "default_global",
        "name": "Default (Global)",
        "description": "Standard prompt for full notebook suggestions",
        "content": DEFAULT_SYSTEM_PROMPT,
        "category": "suggestion",
        "isDefault": True,
    },
    {
        "id": "default_explain",
        "name": "Explain Code",
        "description": "Explains what the selected code does in detail",
        "content": "You are a helpful coding assistant. Explain the following code in detail, breaking down what it does step by step.",
        "category": "context_menu",
        "isDefault": True,
    },
    {
        "id": "default_refactor",
        "name": "Refactor Code",
        "description": "Suggests refactoring the selected code for better readability and performance",
        "content": "You are a helpful coding assistant. Suggest a refactoring for the following code to improve readability, performance, and best practices. Explain the changes you made.",
        "category": "context_menu",
        "isDefault": True,
    },
    {
        "id": "default_chat_system",
        "name": "Default Chat System",
        "description": "Default system prompt for the chat assistant",
        "content": "You are a helpful coding assistant.",
        "category": "chat_system_prompt",
        "isDefault": True,
    },
]

SAMPLE_PROMPTS = [
    # Category: suggestion
    {
        "name": "Pedagogy Expert",
        "description": "Suggestions to make code more readable and educational for students.",
        "content": "Provide suggestions to make this code more readable for students. Add comments explaining 'why' something is done, not just 'what' the code does. Suggest ways to break down complex logic into simpler steps.",
        "category": "suggestion",
    },
    {
        "name": "Exercise Generator",
        "description": "Generates follow-up exercises or comprehension questions.",
        "content": "Suggest 2-3 follow-up exercises or 'Check your understanding' questions based on this cell's content to help students solidify their learning.",
        "category": "suggestion",
    },
    # Category: chat_system_prompt
    {
        "name": "Scientific Tutor",
        "description": "Patient, encouraging tutor who explains concepts using analogies.",
        "content": "You are a patient and encouraging scientific tutor. Explain complex coding or data science concepts using analogies, step-by-step breakdowns, and clear, simple language suitable for a beginner.",
        "category": "chat_system_prompt",
    },
    {
        "name": "Teaching Assistant",
        "description": "Helper who provides hints rather than direct answers.",
        "content": "You are a Teaching Assistant helping a student. Your goal is to guide them to the answer without giving it away directly. Provide helpful hints, point out relevant documentation, or ask leading questions to help them debug their own code.",
        "category": "chat_system_prompt",
    },
    # Category: chat_snippet
    {
        "name": "Explain for Beginners",
        "description": "Simplifies code explanation for novices.",
        "content": "Explain this code in simple terms for someone who has never seen Python before. Focus on the core concepts and logic.",
        "category": "chat_snippet",
    },
    {
        "name": "Create Exercise",
        "description": "Turn code into a practice exercise.",
        "content": "Create a coding exercise based on this snippet. Include a 'problem statement', 'hints', and a 'solution' (ideally hidden or separated).",
        "category": "chat_snippet",
    },
    {
        "name": "Summarize for Students",
        "description": "Creates a concise summary for lecture materials.",
        "content": "Write a 3-sentence summary of this concept or code block that would be suitable for a lecture slide or textbook sidebar.",
        "category": "chat_snippet",
    },
    # Category: notebook_snippet
    {
        "name": "Load Sample Dataset",
        "description": "Boilerplate for loading a teaching dataset (Iris).",
        "content": "import pandas as pd\n# Loading a well-known educational dataset (Iris)\ndf = pd.read_csv('https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv')\nprint(\"Dataset loaded. First 5 rows:\")\ndisplay(df.head())",
        "category": "notebook_snippet",
    },
    {
        "name": "Interactive Plot (ipywidgets)",
        "description": "Interactive visualization example for students.",
        "content": "from ipywidgets import interact\nimport matplotlib.pyplot as plt\nimport numpy as np\n\ndef plot_func(frequency=1.0):\n    x = np.linspace(0, 10, 500)\n    plt.figure(figsize=(10, 4))\n    plt.plot(x, np.sin(frequency * x), color='teal', lw=2)\n    plt.title(f'Sine Wave with Frequency: {frequency}')\n    plt.grid(True, alpha=0.3)\n    plt.show()\n\n# Creates an interactive slider for the frequency\ninteract(plot_func, frequency=(1.0, 10.0, 0.1));",
        "category": "notebook_snippet",
    },
    {
        "name": "Concept Check Template",
        "description": "Boilerplate for a student self-check.",
        "content": "### Concept Check\n# TODO: Answer the following question\n# What happens if you change the 'frequency' parameter above to a negative value?\n\n# [Enter your answer as a comment or markdown cell]",
        "category": "notebook_snippet",
    },
]
