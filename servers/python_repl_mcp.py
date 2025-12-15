import sys
import json
import io
import traceback
import subprocess
import contextlib
import os
import venv
import site


STATE = {"__builtins__": __builtins__}
VENV_DIR = os.path.join(os.path.dirname(__file__), ".python_repl_venv")
VENV_PY = os.path.join(VENV_DIR, "bin", "python") if os.name != "nt" else os.path.join(VENV_DIR, "Scripts", "python.exe")


def ensure_venv():
    if not os.path.exists(VENV_DIR):
        venv.create(VENV_DIR, with_pip=True)
    # make sure site-packages from the venv are on sys.path
    venv_site = site.getsitepackages([VENV_DIR])[0] if hasattr(site, "getsitepackages") else None
    if venv_site and venv_site not in sys.path:
        sys.path.append(venv_site)


def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def read():
    line = sys.stdin.readline()
    if not line:
        return None
    return json.loads(line)


def tools_list():
    return [
        {
            "name": "exec",
            "description": "Execute Python code in a persistent session. Returns stdout/stderr and last value (if any).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to run"},
                    "vars": {"type": "object", "description": "Optional dict merged into session globals"},
                },
                "required": ["code"],
            },
        },
        {
            "name": "reset",
            "description": "Reset the Python session state.",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "pip_install",
            "description": "Install Python packages into this environment (use cautiously).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "packages": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of packages to install",
                    }
                },
                "required": ["packages"],
            },
        },
    ]


def handle_exec(code, vars=None):
    if vars and isinstance(vars, dict):
        STATE.update(vars)
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    last_value = None
    try:
        compiled = compile(code, "<exec>", "eval")
        with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(stderr_buf):
            last_value = eval(compiled, STATE)
    except SyntaxError:
        try:
            compiled = compile(code, "<exec>", "exec")
            with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(stderr_buf):
                exec(compiled, STATE)
        except Exception as e:
            return error_text(f"Execution error: {e}", stdout_buf, stderr_buf)
    except Exception as e:
        return error_text(f"Execution error: {e}", stdout_buf, stderr_buf)

    out = stdout_buf.getvalue()
    err = stderr_buf.getvalue()
    parts = []
    if out:
        parts.append(f"[stdout]\n{out}")
    if err:
        parts.append(f"[stderr]\n{err}")
    if last_value is not None:
        parts.append(f"[result]\n{repr(last_value)}")
    if not parts:
        parts.append("Completed.")
    return [{"type": "text", "text": "\n".join(parts)}]


def error_text(prefix, stdout_buf, stderr_buf):
    out = stdout_buf.getvalue()
    err = stderr_buf.getvalue()
    parts = [prefix]
    if out:
        parts.append(f"[stdout]\n{out}")
    if err:
        parts.append(f"[stderr]\n{err}")
    return [{"type": "text", "text": "\n".join(parts)}]


def handle_reset():
    global STATE
    STATE = {"__builtins__": __builtins__}
    return [{"type": "text", "text": "State reset."}]


def handle_pip(packages):
    ensure_venv()
    cmd = [VENV_PY, "-m", "pip", "install", *packages]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    parts = [f"Command: {' '.join(cmd)}", f"Return code: {proc.returncode}"]
    if proc.stdout:
        parts.append(f"[stdout]\n{proc.stdout}")
    if proc.stderr:
        parts.append(f"[stderr]\n{proc.stderr}")
    return [{"type": "text", "text": "\n".join(parts)}]


def main():
    while True:
        req = read()
        if req is None:
            break
        msg_id = req.get("id")
        method = req.get("method")
        params = req.get("params", {})

        resp = {"jsonrpc": "2.0", "id": msg_id}

        try:
            if method == "initialize":
                resp["result"] = {
                    "protocolVersion": "2025-06-18",
                    "serverInfo": {"name": "python_repl", "version": "0.1.0"},
                    "capabilities": {},
                }
            elif method == "tools/list":
                resp["result"] = {"tools": tools_list()}
            elif method == "tools/call":
                name = params.get("name")
                arguments = params.get("arguments", {})
                if name == "exec":
                    code = arguments.get("code", "")
                    vars = arguments.get("vars")
                    resp["result"] = {"content": handle_exec(code, vars)}
                elif name == "reset":
                    resp["result"] = {"content": handle_reset()}
                elif name == "pip_install":
                    pkgs = arguments.get("packages") or []
                    resp["result"] = {"content": handle_pip(pkgs)}
                else:
                    resp["error"] = {"code": -32601, "message": f"Unknown tool '{name}'"}
            else:
                resp["error"] = {"code": -32601, "message": f"Unknown method '{method}'"}
        except Exception:
            resp["error"] = {"code": -32000, "message": traceback.format_exc()}

        send(resp)


if __name__ == "__main__":
    ensure_venv()
    main()
