import subprocess
from mcp.server.fastmcp import FastMCP
from utils import get_safe_project_path

def register_security_tools(mcp: FastMCP) -> None:
    @mcp.tool()
    def run_bandit(target_path: str) -> str:
        try:
            safe_path = get_safe_project_path(target_path)
            command = ["bandit", "-r", safe_path]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)

    @mcp.tool()
    def run_safety() -> str:
        try:
            command = ["safety", "check", "--full-report"]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)

    @mcp.tool()
    def run_gitleaks(target_path: str) -> str:
        try:
            safe_path = get_safe_project_path(target_path)
            command = ["gitleaks", "detect", "--source", safe_path, "-v"]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)
