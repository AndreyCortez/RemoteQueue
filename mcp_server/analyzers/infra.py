import subprocess
from mcp.server.fastmcp import FastMCP
from utils import get_safe_project_path

def register_infra_tools(mcp: FastMCP) -> None:
    @mcp.tool()
    def run_hadolint(target_path: str) -> str:
        try:
            safe_path = get_safe_project_path(target_path)
            command = ["hadolint", safe_path]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)

    @mcp.tool()
    def run_trivy(target_path: str) -> str:
        try:
            safe_path = get_safe_project_path(target_path)
            command = ["trivy", "fs", safe_path]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            return result.stdout if result.stdout else result.stderr
        except Exception as error:
            return str(error)
