import os

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
docs_dir = os.path.join(project_root, "docs")

def get_safe_path(filename: str) -> str:
    absolute_base = os.path.abspath(docs_dir)
    absolute_target = os.path.abspath(os.path.join(docs_dir, filename))
    if os.path.commonpath([absolute_base, absolute_target]) != absolute_base:
        raise ValueError("security_alert_path_traversal")
    if not os.path.isfile(absolute_target):
        raise FileNotFoundError("file_not_found")
    return absolute_target
