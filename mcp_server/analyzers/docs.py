import subprocess
import os
from mcp.server.fastmcp import FastMCP
from utils import get_safe_project_path

def register_docs_tools(mcp: FastMCP) -> None:
    @mcp.tool()
    def generate_python_docs(target_path: str) -> str:
        try:
            from utils import project_root
            pdoc_path = os.path.join(project_root, ".venv", "bin", "pdoc")
            safe_path = get_safe_project_path(target_path)
            command = [pdoc_path, "--text", safe_path]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)

    @mcp.tool()
    def run_spectral(target_path: str) -> str:
        try:
            safe_path = get_safe_project_path(target_path)
            command = ["npx", "@stoplight/spectral-cli", "lint", safe_path]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)
