import os
import re
import subprocess
from datetime import datetime, timezone
from mcp.server.fastmcp import FastMCP
from utils import docs_dir, get_safe_path

max_lines = 300
max_staleness_days = 90

def count_lines(file_path: str) -> int:
    with open(file_path, "r", encoding="utf-8") as file:
        return sum(1 for _ in file)

def get_staleness_days(file_path: str) -> int:
    git_command = ["git", "log", "-1", "--format=%ct", "--", file_path]
    process_result = subprocess.run(git_command, capture_output=True, text=True, check=False)
    output = process_result.stdout.strip()
    if not output:
        return 0
    last_commit_timestamp = int(output)
    current_timestamp = datetime.now(timezone.utc).timestamp()
    return int((current_timestamp - last_commit_timestamp) / 86400)

def setup_tools(mcp: FastMCP) -> None:
    @mcp.tool()
    def search_documentation(query: str) -> str:
        search_results = []
        for root, _, files in os.walk(docs_dir):
            for file in files:
                if file.endswith(".md"):
                    file_path = os.path.join(root, file)
                    relative_path = os.path.relpath(file_path, docs_dir)
                    try:
                        with open(file_path, "r", encoding="utf-8") as doc:
                            for index, line in enumerate(doc.readlines()):
                                if query.lower() in line.lower():
                                    search_results.append(f"[{relative_path}:{index + 1}] {line.strip()}")
                    except Exception:
                        continue
        return "\n".join(search_results) if search_results else "no_results"

    @mcp.tool()
    def read_section(filename: str, section_name: str) -> str:
        try:
            safe_path = get_safe_path(filename)
        except Exception as error:
            return str(error)
            
        section_content = []
        is_capturing = False
        current_level = 0
        
        with open(safe_path, "r", encoding="utf-8") as file:
            for line in file:
                header_match = re.match(r"^(#+)\s+(.*)", line)
                if header_match:
                    header_level = len(header_match.group(1))
                    header_title = header_match.group(2).strip().lower()
                    if is_capturing and header_level <= current_level:
                        break
                    if header_title == section_name.strip().lower():
                        is_capturing = True
                        current_level = header_level
                        section_content.append(line)
                        continue
                if is_capturing:
                    section_content.append(line)
        return "".join(section_content) if section_content else "section_not_found"

    @mcp.tool()
    def verify_onboarding_completion(summary: str) -> str:
        if len(summary.strip()) < 50:
            return "verification_failed_summary_too_short"
        return "onboarding_completed_successfully"

    @mcp.tool()
    def evaluate_documentation_health() -> str:
        health_report = []
        has_critical_alerts = False
        health_report.append("--- doc_health_report ---")
        
        for root, _, files in os.walk(docs_dir):
            for file in files:
                if file.endswith(".md"):
                    file_path = os.path.join(root, file)
                    try:
                        safe_path = get_safe_path(os.path.relpath(file_path, docs_dir))
                    except Exception:
                        continue
                        
                    lines = count_lines(safe_path)
                    staleness = get_staleness_days(safe_path)
                    
                    alerts = []
                    if lines > max_lines:
                        alerts.append("refactoring_needed_too_large")
                        has_critical_alerts = True
                    if staleness > max_staleness_days:
                        alerts.append("potentially_outdated")
                        
                    status = ", ".join(alerts) if alerts else "healthy"
                    relative_path = os.path.relpath(safe_path, docs_dir)
                    health_report.append(f"{relative_path} | lines: {lines} | age: {staleness}_days | status: {status}")
                    
        if has_critical_alerts:
            health_report.append("\nwarning_critical_alerts_detected")
            
        return "\n".join(health_report)
