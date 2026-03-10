import os
import re
import subprocess
import fnmatch
from datetime import datetime, timezone
from mcp.server.fastmcp import FastMCP
from utils import docs_dir, get_safe_path, project_root
from analyzers.security import register_security_tools
from analyzers.linters import register_linter_tools
from analyzers.frontend import register_frontend_tools
from analyzers.docs import register_docs_tools
from analyzers.infra import register_infra_tools

max_lines = 300
max_staleness_days = 90

excluded_patterns = [
    "*/__pycache__/*",
    "*/.venv/*",
    "*/.git/*",
    "*/node_modules/*",
]

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

    @mcp.tool()
    def audit_zombie_files() -> str:
        report_lines = []
        report_lines.append("--- zombie_audit_report ---")

        scan_dirs = ["api", "mcp_server", "scripts"]
        all_project_files = []

        for scan_dir in scan_dirs:
            target_dir = os.path.join(project_root, scan_dir)
            if not os.path.isdir(target_dir):
                continue
            for root, _, files in os.walk(target_dir):
                rel_root = os.path.relpath(root, project_root)
                if any(fnmatch.fnmatch(rel_root + "/x", pat) for pat in excluded_patterns):
                    continue
                for file in files:
                    if file.endswith(".py"):
                        full_path = os.path.join(root, file)
                        all_project_files.append(full_path)

        file_contents_cache = {}
        for file_path in all_project_files:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    file_contents_cache[file_path] = f.read()
            except Exception:
                file_contents_cache[file_path] = ""

        for file_path in all_project_files:
            module_name = os.path.splitext(os.path.basename(file_path))[0]

            if module_name in ("__init__", "main", "conftest", "server"):
                continue

            is_referenced = False
            for other_path, content in file_contents_cache.items():
                if other_path == file_path:
                    continue
                if re.search(rf'\b{re.escape(module_name)}\b', content):
                    is_referenced = True
                    break

            staleness = get_staleness_days(file_path)
            status = "referenced" if is_referenced else "orphan"
            relative_path = os.path.relpath(file_path, project_root)

            if not is_referenced:
                report_lines.append(f"{relative_path} | age: {staleness}_days | status: {status}")

        if len(report_lines) == 1:
            report_lines.append("no_orphans_detected")

        return "\n".join(report_lines)

    register_security_tools(mcp)
    register_linter_tools(mcp)
    register_frontend_tools(mcp)
    register_docs_tools(mcp)
    register_infra_tools(mcp)
