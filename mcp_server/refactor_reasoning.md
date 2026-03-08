# MCP Server Modularization Reasoning

## Objective
The goal is to migrate the doc health script features and onboarding logic into the MCP server without allowing `server.py` to become a massive ""God Class/File"". This ensures we establish a highly robust standard that can harbor all complex behaviors AI Agents might need over time.

## Architecture & Split Strategy
We will divide the server into logical domains:
1.  **`utils.py`**: Holds path resolution safely (preventing Path Traversal) and sets global constants (e.g. `DOCS_DIR`). It's foundational.
2.  **`resources.py`**: Defines a setup function `setup_resources(mcp: FastMCP)`. This encapsulates the `@mcp.resource` decorators for reading files and trees.
3.  **`tools.py`**: The crux of the complex behavior. Here we'll wrap `search`, `read_section`, `verify_onboarding_completion`, and introduce `evaluate_documentation_health()`.
    *   *Security Note*: `evaluate_documentation_health` will utilize the exact same secure `subprocess.run` method we designed in the CI/CD script, avoiding `shell=True` completely.
4.  **`server.py`**: The entrypoint. All it does is instantiate `FastMCP("remote_queue_context")`, pass that instance sequentially through `setup_resources()` and `setup_tools()`, and then call `mcp.run()`.

## Code Style Execution
As explicitly ordered, the resulting files will:
- Employ exceptionally clean code.
- Omit every single comment since this reasoning file fulfills the structural logic phase.
- Standardize everything strictly on `snake_case` using only English variables.
