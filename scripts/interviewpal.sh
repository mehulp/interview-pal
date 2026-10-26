#!/usr/bin/env bash
# Start, stop and check the InterviewPal local server.
#
#   scripts/interviewpal.sh start | stop | status | restart
#
# Options (environment variables):
#   PORT=8010        use another port (default 8010)
#   NO_BROWSER=1     do not open Chrome, just print the address
set -euo pipefail

# Find the project from this script's own location, so it works from any folder.
SCRIPT="$(readlink -f "${BASH_SOURCE[0]}")"
ROOT="$(dirname "$(dirname "$SCRIPT")")"
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/server.pid"   # two lines: the process ID, then the port
LOG_FILE="$RUN_DIR/server.log"
SERVER="$ROOT/scripts/devserver.py"

PORT="${PORT:-8010}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "PORT must be a number from 1 to 65535 (got: $PORT)." >&2
  exit 2
fi

# Is something already listening on this port on this computer?
port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# Is the process in the PID file alive, and really our server? (A reused ID must not be killed.)
# Sets SAVED_PID and SAVED_PORT when it is.
server_running() {
  SAVED_PID="" SAVED_PORT=""
  [[ -f "$PID_FILE" ]] || return 1
  SAVED_PID="$(sed -n 1p "$PID_FILE")"
  SAVED_PORT="$(sed -n 2p "$PID_FILE")"
  if [[ "$SAVED_PID" =~ ^[0-9]+$ ]] && kill -0 "$SAVED_PID" 2>/dev/null \
     && tr '\0' ' ' < "/proc/$SAVED_PID/cmdline" 2>/dev/null | grep -q "devserver.py"; then
    return 0
  fi
  rm -f "$PID_FILE"   # stale: the process is gone
  SAVED_PID="" SAVED_PORT=""
  return 1
}

open_browser() {
  local url="$1"
  if [[ "${NO_BROWSER:-}" == "1" ]]; then
    echo "Open $url in Chrome."
    return 0
  fi
  # Chrome on the Windows side. Start from a Windows folder, because cmd.exe dislikes Linux paths.
  if command -v cmd.exe >/dev/null 2>&1 \
     && (cd /mnt/c 2>/dev/null || true; cmd.exe /c start chrome "$url") >/dev/null 2>&1; then
    echo "Opened Chrome at $url"
  else
    echo "Could not open Chrome for you. Open $url yourself."
  fi
}

cmd_start() {
  if server_running; then
    echo "Already running at http://localhost:$SAVED_PORT (process $SAVED_PID)."
    return 0
  fi
  if port_in_use "$PORT"; then
    echo "Port $PORT is already used by another program." >&2
    echo "Try another port, for example: PORT=$((PORT + 1)) $0 start" >&2
    return 1
  fi

  mkdir -p "$RUN_DIR"
  nohup python3 "$SERVER" "$PORT" > "$LOG_FILE" 2>&1 &
  local pid=$!
  disown "$pid" 2>/dev/null || true
  printf '%s\n%s\n' "$pid" "$PORT" > "$PID_FILE"

  # Wait up to 5 seconds for it to answer.
  local i
  for i in $(seq 1 25); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "The server stopped right after starting. See the log: $LOG_FILE" >&2
      return 1
    fi
    port_in_use "$PORT" && break
    sleep 0.2
  done
  if ! port_in_use "$PORT"; then
    kill "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "The server did not answer in time. See the log: $LOG_FILE" >&2
    return 1
  fi

  echo "Started InterviewPal at http://localhost:$PORT (process $pid)."
  open_browser "http://localhost:$PORT"
}

cmd_stop() {
  if ! server_running; then
    echo "Not running."
    return 0
  fi
  kill "$SAVED_PID" 2>/dev/null || true
  local i
  for i in $(seq 1 25); do                       # up to 5 seconds to stop politely
    kill -0 "$SAVED_PID" 2>/dev/null || break
    sleep 0.2
  done
  if kill -0 "$SAVED_PID" 2>/dev/null; then
    kill -9 "$SAVED_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "Stopped (process $SAVED_PID)."
}

cmd_status() {
  if server_running; then
    echo "Running at http://localhost:$SAVED_PORT (process $SAVED_PID)."
  else
    echo "Not running."
    return 1
  fi
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  status)  cmd_status ;;
  restart) cmd_stop; cmd_start ;;
  *)
    echo "Usage: $(basename "$0") start | stop | status | restart" >&2
    echo "Options: PORT=8001 (another port), NO_BROWSER=1 (do not open Chrome)" >&2
    exit 2
    ;;
esac
