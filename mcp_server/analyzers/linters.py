import subprocess
from mcp.server.fastmcp import FastMCP
from utils import get_safe_project_path

def register_linter_tools(mcp: FastMCP) -> None:
    @mcp.tool()
    def run_ruff(target_path: str) -> str:
        try:
            safe_path = get_safe_project_path(target_path)
            command = ["ruff", "check", safe_path]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)

    @mcp.tool()
    def run_mypy(target_path: str) -> str:
        try:
            safe_path = get_safe_project_path(target_path)
            command = ["mypy", safe_path]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)

    @mcp.tool()
    def run_radon(target_path: str) -> str:
        try:
            safe_path = get_safe_project_path(target_path)
            command = ["radon", "cc", "-s", safe_path]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)

    @mcp.tool()
    def run_pytest_cov(target_path: str) -> str:
        try:
            safe_path = get_safe_project_path(target_path)
            command = ["pytest", "--cov", safe_path]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)
