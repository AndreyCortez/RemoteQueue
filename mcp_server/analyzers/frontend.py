import subprocess
from mcp.server.fastmcp import FastMCP
from utils import get_safe_project_path

def register_frontend_tools(mcp: FastMCP) -> None:
    @mcp.tool()
    def run_eslint(target_path: str) -> str:
        try:
            safe_path = get_safe_project_path(target_path)
            command = ["npx", "eslint", safe_path]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)
