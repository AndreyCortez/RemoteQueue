import os
from mcp.server.fastmcp import FastMCP
from utils import docs_dir, get_safe_path

def setup_resources(mcp: FastMCP) -> None:
    @mcp.resource("docs://tree")
    def get_documentation_tree() -> str:
        file_list = []
        for root, _, files in os.walk(docs_dir):
            for file in files:
                if file.endswith(".md"):
                    relative_path = os.path.relpath(os.path.join(root, file), docs_dir)
                    file_list.append(relative_path)
        return "\n".join(file_list)

    @mcp.resource("docs://onboarding")
    def get_onboarding() -> str:
        try:
            safe_path = get_safe_path("onboarding.md")
            with open(safe_path, "r", encoding="utf-8") as file:
                return file.read()
        except Exception as error:
            return str(error)

    @mcp.resource("docs://{filename}")
    def read_document(filename: str) -> str:
        try:
            safe_path = get_safe_path(filename)
            with open(safe_path, "r", encoding="utf-8") as file:
                return file.read()
        except Exception as error:
            return str(error)
