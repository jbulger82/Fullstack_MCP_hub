import sys
import json
import datetime


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
            "name": "now",
            "description": "Return the current date/time (UTC and local) plus ISO formats.",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "add_delta",
            "description": "Add/subtract time delta (days/hours/minutes) from now; returns both UTC and local.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "days": {"type": "number", "description": "Days to add (negative to subtract)", "default": 0},
                    "hours": {"type": "number", "description": "Hours to add (negative to subtract)", "default": 0},
                    "minutes": {"type": "number", "description": "Minutes to add (negative to subtract)", "default": 0},
                },
                "required": [],
            },
        },
    ]


def fmt(dt):
    return {
        "iso": dt.isoformat(),
        "date": dt.date().isoformat(),
        "time": dt.time().isoformat(timespec="seconds"),
        "timestamp": dt.timestamp(),
    }


def tool_now():
    now_utc = datetime.datetime.now(datetime.UTC)
    now_local = datetime.datetime.now().astimezone()
    return [
        {
            "type": "text",
            "text": json.dumps(
                {
                    "utc": fmt(now_utc),
                    "local": fmt(now_local),
                },
                indent=2,
            ),
        }
    ]


def tool_add_delta(days=0, hours=0, minutes=0):
    delta = datetime.timedelta(days=days or 0, hours=hours or 0, minutes=minutes or 0)
    now_utc = datetime.datetime.now(datetime.UTC) + delta
    now_local = datetime.datetime.now().astimezone() + delta
    return [
        {
            "type": "text",
            "text": json.dumps(
                {
                    "utc": fmt(now_utc),
                    "local": fmt(now_local),
                },
                indent=2,
            ),
        }
    ]


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
                    "serverInfo": {"name": "clock", "version": "0.1.0"},
                    "capabilities": {},
                }
            elif method == "tools/list":
                resp["result"] = {"tools": tools_list()}
            elif method == "tools/call":
                name = params.get("name")
                args = params.get("arguments", {}) or {}
                if name == "now":
                    resp["result"] = {"content": tool_now()}
                elif name == "add_delta":
                    resp["result"] = {
                        "content": tool_add_delta(
                            args.get("days", 0),
                            args.get("hours", 0),
                            args.get("minutes", 0),
                        )
                    }
                else:
                    resp["error"] = {"code": -32601, "message": f"Unknown tool '{name}'"}
            else:
                resp["error"] = {"code": -32601, "message": f"Unknown method '{method}'"}
        except Exception as e:
            resp["error"] = {"code": -32000, "message": str(e)}
        send(resp)


if __name__ == "__main__":
    main()
