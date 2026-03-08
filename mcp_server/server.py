from mcp.server.fastmcp import FastMCP
from resources import setup_resources
from tools import setup_tools

mcp = FastMCP("remote_queue_context")

setup_resources(mcp)
setup_tools(mcp)

if __name__ == "__main__":
    mcp.run()
