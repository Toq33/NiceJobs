"""
NiceJobs - FastAPI Server & REST API
"""
import os
import json
import logging
import uuid
import time
import secrets
import re
import base64
from datetime import datetime
from typing import Optional, List, Dict, Any, Set
from collections import defaultdict
import asyncio

logger = logging.getLogger("nicejobs")
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Ensure local .env is loaded before application startup
load_dotenv()

import database
import bcrypt

app = FastAPI(title="NiceJobs API", version="1.0.0")

# High-concurrency network compression: compresses JSON and static responses over 1KB
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Controlled Cross-Origin Resource Sharing
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins != ["*"] else ["*"],
    allow_credentials=True if allowed_origins != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =======================
# SECURITY HEADERS & DEFENSIVE MIDDLEWARE
# =======================
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    # Correlation ID for request tracing
    req_id = request.headers.get("X-Request-ID") or f"req_{secrets.token_hex(8)}"
    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if database.is_production():
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Liveness & Readiness Probes for Production Scalability
@app.get("/api/health")
@app.get("/healthz")
def health_check():
    """Liveness probe: verifies process is alive and responsive."""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/api/ready")
@app.get("/readiness")
def readiness_check():
    """Readiness probe: validates database connectivity and pool availability."""
    try:
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        conn.close()
        return {"status": "ready", "database": "connected", "timestamp": datetime.now().isoformat()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database service unavailable: {str(e)}")

# =======================
# CRYPTOGRAPHY & RATE LIMITING
# =======================
def hash_password(password: str) -> str:
    """Hashes a password securely using bcrypt with work factor 12."""
    if not password:
        password = "Password123!"
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, stored_hash: str) -> bool:
    """
    Constant-time password verification supporting bcrypt hashes
    and transparent backwards-compatibility for legacy plaintexts.
    """
    if not plain_password or not stored_hash:
        return False
    # If stored as bcrypt hash
    if stored_hash.startswith("$2b$") or stored_hash.startswith("$2a$"):
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), stored_hash.encode("utf-8"))
        except Exception:
            return False
    # Legacy plaintext check with constant-time comparison
    return secrets.compare_digest(plain_password, stored_hash)

# In-memory sliding window rate limiter
PUBLIC_AUTH_ATTEMPTS: Dict[str, List[float]] = {}

def check_public_rate_limit(key: str, max_attempts: int = 15, window_seconds: int = 300) -> None:
    now_ts = time.time()
    recent = [t for t in PUBLIC_AUTH_ATTEMPTS.get(key, []) if now_ts - t < window_seconds]
    PUBLIC_AUTH_ATTEMPTS[key] = recent
    if len(recent) >= max_attempts:
        retry_after = int(window_seconds - (now_ts - recent[0]))
        raise HTTPException(
            status_code=429,
            detail=f"Security Alert: Too many failed requests. Rate limit exceeded. Try again in {retry_after} seconds."
        )

def record_public_rate_failure(key: str) -> None:
    now_ts = time.time()
    PUBLIC_AUTH_ATTEMPTS.setdefault(key, []).append(now_ts)

def reset_public_rate_limit(key: str) -> None:
    PUBLIC_AUTH_ATTEMPTS.pop(key, None)


# Ensure DB initialized in local non-production SQLite mode.
# When running with PostgreSQL or in Vercel/production, schema migrations must be run explicitly.
if not database.is_production() and not database.is_postgres():
    database.init_db()
else:
    database.ensure_db_ready()

# Mount static folder
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
try:
    os.makedirs(STATIC_DIR, exist_ok=True)
except Exception:
    pass
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.api_route("/", methods=["GET", "HEAD"])
def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(
            index_file,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    return {"message": "NiceJobs API is running. index.html will be served here."}

# =======================
# REAL-TIME ENGINE (WEBSOCKET + SSE BROADCASTER)
# =======================

class RealtimeConnectionManager:
    def __init__(self):
        self.active_websockets: List[WebSocket] = []
        self.metadata: Dict[WebSocket, Dict[str, Any]] = {}
        self.sse_subscribers: Dict[asyncio.Queue, Dict[str, Any]] = {}
        self.conversation_rooms: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.presence_counts: Dict[str, int] = defaultdict(int)

    async def connect_ws(self, websocket: WebSocket, user_id: Optional[str] = None, business_id: Optional[str] = None, role: Optional[str] = None):
        await websocket.accept()
        self.active_websockets.append(websocket)
        self.metadata[websocket] = {"user_id": user_id, "business_id": business_id, "role": role}
        self._increment_presence(user_id, business_id)
        try:
            await websocket.send_json({
                "type": "connection_established",
                "user_id": user_id,
                "business_id": business_id,
                "role": role,
                "timestamp": datetime.now().isoformat()
            })
        except Exception:
            pass

    def disconnect_ws(self, websocket: WebSocket):
        if websocket in self.active_websockets:
            self.active_websockets.remove(websocket)
        meta = self.metadata.pop(websocket, {})
        self.leave_all_rooms(websocket)
        self._decrement_presence(meta.get("user_id"), meta.get("business_id"))

    def set_client_metadata(self, websocket: WebSocket, user_id: Optional[str], business_id: Optional[str], role: Optional[str]):
        if websocket in self.metadata:
            old_meta = self.metadata[websocket]
            self._decrement_presence(old_meta.get("user_id"), old_meta.get("business_id"))
            self.metadata[websocket] = {
                "user_id": user_id,
                "business_id": business_id,
                "role": role
            }
            self._increment_presence(user_id, business_id)

    def _increment_presence(self, user_id: Optional[str], business_id: Optional[str]):
        if user_id:
            key = f"user:{user_id}"
            count = self.presence_counts[key]
            self.presence_counts[key] = count + 1
            if count == 0:
                notify_realtime("presence:update", {"entity_id": user_id, "entity_type": "user", "status": "online"})
        if business_id:
            key = f"biz:{business_id}"
            count = self.presence_counts[key]
            self.presence_counts[key] = count + 1
            if count == 0:
                notify_realtime("presence:update", {"entity_id": business_id, "entity_type": "business", "status": "online"})

    def _decrement_presence(self, user_id: Optional[str], business_id: Optional[str]):
        if user_id:
            key = f"user:{user_id}"
            count = max(0, self.presence_counts[key] - 1)
            self.presence_counts[key] = count
            if count == 0:
                notify_realtime("presence:update", {"entity_id": user_id, "entity_type": "user", "status": "offline"})
        if business_id:
            key = f"biz:{business_id}"
            count = max(0, self.presence_counts[key] - 1)
            self.presence_counts[key] = count
            if count == 0:
                notify_realtime("presence:update", {"entity_id": business_id, "entity_type": "business", "status": "offline"})

    def is_user_online(self, user_id: Optional[str]) -> bool:
        if not user_id:
            return False
        return self.presence_counts.get(f"user:{user_id}", 0) > 0

    def is_business_online(self, business_id: Optional[str]) -> bool:
        if not business_id:
            return False
        return self.presence_counts.get(f"biz:{business_id}", 0) > 0

    def is_entity_online(self, entity_id: Optional[str]) -> bool:
        if not entity_id:
            return False
        return (self.presence_counts.get(f"user:{entity_id}", 0) > 0 or 
                self.presence_counts.get(f"biz:{entity_id}", 0) > 0)

    def join_room(self, websocket: WebSocket, conv_id: str):
        self.conversation_rooms[conv_id].add(websocket)

    def leave_room(self, websocket: WebSocket, conv_id: str):
        if conv_id in self.conversation_rooms:
            self.conversation_rooms[conv_id].discard(websocket)
            if not self.conversation_rooms[conv_id]:
                self.conversation_rooms.pop(conv_id, None)

    def leave_all_rooms(self, websocket: WebSocket):
        empty_rooms = []
        for conv_id, ws_set in self.conversation_rooms.items():
            ws_set.discard(websocket)
            if not ws_set:
                empty_rooms.append(conv_id)
        for c in empty_rooms:
            self.conversation_rooms.pop(c, None)

    async def broadcast_to_room(self, conv_id: str, event_type: str, data: Dict[str, Any], exclude_ws: Optional[WebSocket] = None):
        ws_set = self.conversation_rooms.get(conv_id, set())
        if not ws_set:
            return
        msg = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now().isoformat(),
            "event_id": f"evt_{int(time.time()*1000)}_{secrets.token_hex(4)}"
        }
        targets = [ws for ws in list(ws_set) if ws is not exclude_ws]
        if not targets:
            return

        async def _safe_send(ws):
            try:
                await asyncio.wait_for(ws.send_json(msg), timeout=2.0)
                return None
            except Exception:
                return ws

        dead_results = await asyncio.gather(*[_safe_send(ws) for ws in targets], return_exceptions=True)
        for res in dead_results:
            if isinstance(res, WebSocket):
                self.disconnect_ws(res)

    async def broadcast_event(self, event_type: str, data: Optional[Dict[str, Any]] = None, target_user: Optional[str] = None, target_business: Optional[str] = None):
        msg = {
            "type": event_type,
            "data": data or {},
            "target_user": target_user,
            "target_business": target_business,
            "timestamp": datetime.now().isoformat(),
            "event_id": f"evt_{int(time.time()*1000)}_{secrets.token_hex(4)}"
        }
        
        targets = []
        for ws in list(self.active_websockets):
            if target_user or target_business:
                meta = self.metadata.get(ws, {})
                u_id = meta.get("user_id")
                b_id = meta.get("business_id")
                matched = False
                if target_user and u_id == target_user:
                    matched = True
                if target_business and b_id == target_business:
                    matched = True
                if not matched:
                    continue
            targets.append(ws)

        if targets:
            async def _safe_send_ws(ws):
                try:
                    await asyncio.wait_for(ws.send_json(msg), timeout=2.0)
                    return None
                except Exception:
                    return ws

            dead_results = await asyncio.gather(*[_safe_send_ws(ws) for ws in targets], return_exceptions=True)
            for res in dead_results:
                if isinstance(res, WebSocket):
                    self.disconnect_ws(res)

        # 2. Send to SSE subscribers with matching targets
        raw_sse = f"data: {json.dumps(msg)}\n\n"
        dead_queues = []
        for q, meta in list(self.sse_subscribers.items()):
            u_id = meta.get("user_id")
            b_id = meta.get("business_id")
            if target_user or target_business:
                matched = False
                if target_user and u_id == target_user:
                    matched = True
                if target_business and b_id == target_business:
                    matched = True
                if not matched:
                    continue
            try:
                q.put_nowait(raw_sse)
            except Exception:
                dead_queues.append(q)
        for dq in dead_queues:
            self.sse_subscribers.pop(dq, None)

realtime_manager = RealtimeConnectionManager()
main_event_loop: Optional[asyncio.AbstractEventLoop] = None

@app.on_event("startup")
async def capture_realtime_loop():
    global main_event_loop
    main_event_loop = asyncio.get_running_loop()

def notify_realtime(event_type: str, data: Optional[Dict[str, Any]] = None, target_user: Optional[str] = None, target_business: Optional[str] = None):
    try:
        global main_event_loop
        if main_event_loop is None or not main_event_loop.is_running():
            try:
                main_event_loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
        
        if main_event_loop and main_event_loop.is_running():
            asyncio.run_coroutine_threadsafe(
                realtime_manager.broadcast_event(event_type, data, target_user, target_business),
                main_event_loop
            )
        else:
            try:
                loop = asyncio.get_event_loop()
                if loop and loop.is_running():
                    main_event_loop = loop
                    asyncio.run_coroutine_threadsafe(
                        realtime_manager.broadcast_event(event_type, data, target_user, target_business),
                        loop
                    )
            except Exception:
                pass
    except Exception as e:
        print(f"[REALTIME NOTIFY ERROR] {e}")

def notify_conversation_room(conv_id: str, event_type: str, data: Dict[str, Any], exclude_ws: Optional[WebSocket] = None):
    try:
        global main_event_loop
        if main_event_loop is None or not main_event_loop.is_running():
            try:
                main_event_loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
        
        if main_event_loop and main_event_loop.is_running():
            asyncio.run_coroutine_threadsafe(
                realtime_manager.broadcast_to_room(conv_id, event_type, data, exclude_ws),
                main_event_loop
            )
        else:
            try:
                loop = asyncio.get_event_loop()
                if loop and loop.is_running():
                    main_event_loop = loop
                    asyncio.run_coroutine_threadsafe(
                        realtime_manager.broadcast_to_room(conv_id, event_type, data, exclude_ws),
                        loop
                    )
            except Exception:
                pass
    except Exception as e:
        print(f"[ROOM NOTIFY ERROR] {e}")

def check_conversation_authorization(conv_id: str, user_id: Optional[str] = None, business_id: Optional[str] = None, role: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Verifies that the provided user_id or business_id is an authorized participant
    in the conversation using a single query with LEFT JOINs.
    Returns conversation row as dict if valid, else None.
    """
    if not conv_id:
        return None
    try:
        conn = database.get_db()
        cursor = conn.cursor()

        u_id = (user_id or "").strip()
        b_id = (business_id or "").strip()

        cursor.execute("""
            SELECT c.*,
                   b.admin_user_id as biz_admin_id,
                   bm.id as bm_membership_id,
                   u.role as u_role
            FROM conversations c
            LEFT JOIN businesses b ON (c.business_id = b.id AND b.admin_user_id = ?)
            LEFT JOIN business_memberships bm ON (c.business_id = bm.business_id AND bm.user_id = ?)
            LEFT JOIN users u ON u.id = ?
            WHERE c.id = ?
        """, (u_id, u_id, u_id, conv_id))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        conv_dict = {
            "id": row["id"],
            "user_id": row["user_id"],
            "business_id": row["business_id"],
            "job_id": row.get("job_id"),
            "last_message": row.get("last_message"),
            "last_message_time": row.get("last_message_time"),
            "unread_for_user": row.get("unread_for_user"),
            "unread_for_business": row.get("unread_for_business")
        }

        # 1. Global admin override
        if role == "admin" or row.get("u_role") == "admin":
            return conv_dict

        # 2. Direct participant matches
        if u_id and u_id == conv_dict.get("user_id"):
            return conv_dict
        if b_id and b_id == conv_dict.get("business_id"):
            return conv_dict
        if u_id and u_id == conv_dict.get("business_id"):
            return conv_dict

        # 3. Business administration or active membership match
        if row.get("biz_admin_id") or row.get("bm_membership_id"):
            return conv_dict

        return None
    except Exception as e:
        print(f"[AUTH ERROR] check_conversation_authorization: {e}")
        try:
            conn.close()
        except Exception:
            pass
        return None

def dispatch_realtime_notification(user_id: str, title: str, message: str, notif_type: str = "general", link: str = "#applications", business_id: Optional[str] = None, cursor = None):
    notif_id = f"notif_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    should_close = False
    conn = None
    if cursor is None:
        conn = database.get_db()
        cursor = conn.cursor()
        should_close = True
        
    try:
        cursor.execute("""
            INSERT INTO notifications (id, user_id, title, message, type, link, is_read, timestamp, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)
        """, (notif_id, user_id, title, message, notif_type, link, now))
        
        if should_close and conn:
            conn.commit()
            conn.close()
            
        notif_data = {
            "id": notif_id,
            "user_id": user_id,
            "title": title,
            "message": message,
            "type": notif_type,
            "link": link,
            "is_read": 0,
            "timestamp": now
        }
        
        notify_realtime(
            "notification_created",
            notif_data,
            target_user=user_id,
            target_business=business_id
        )
        return notif_data
    except Exception as e:
        print(f"[NOTIFICATION ERROR] {e}")
        if should_close and conn:
            try: conn.close()
            except Exception: pass
        return None

@app.websocket("/ws")
@app.websocket("/api/realtime/ws")
@app.websocket("/ws/realtime")
async def websocket_realtime_endpoint(websocket: WebSocket):
    global main_event_loop
    try:
        main_event_loop = asyncio.get_running_loop()
    except Exception:
        pass

    qp = websocket.query_params
    u_id = qp.get("user_id")
    b_id = qp.get("business_id")
    r_id = qp.get("role")

    await realtime_manager.connect_ws(websocket, user_id=u_id, business_id=b_id, role=r_id)
    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                msg = json.loads(raw_text)
                action = msg.get("action")
                meta = realtime_manager.metadata.get(websocket, {})
                u_id = meta.get("user_id")
                b_id = meta.get("business_id")
                r_id = meta.get("role")

                if action == "identify":
                    u_id = msg.get("user_id")
                    b_id = msg.get("business_id")
                    r_id = msg.get("role")
                    realtime_manager.set_client_metadata(
                        websocket,
                        user_id=u_id,
                        business_id=b_id,
                        role=r_id
                    )
                    await websocket.send_json({"type": "identified", "status": "ok"})

                elif action in ("conversation:join", "chat:join"):
                    conv_id = msg.get("conv_id") or msg.get("conversation_id")
                    if conv_id:
                        conv_meta = check_conversation_authorization(conv_id, user_id=u_id, business_id=b_id, role=r_id)
                        if conv_meta:
                            realtime_manager.join_room(websocket, conv_id)
                            # Identify counterpart in this conversation
                            is_biz = (r_id == "recruiter") or (b_id == conv_meta["business_id"])
                            counterpart_id = conv_meta["user_id"] if is_biz else conv_meta["business_id"]
                            counterpart_online = realtime_manager.is_entity_online(counterpart_id)
                            await websocket.send_json({
                                "type": "conversation:joined",
                                "conv_id": conv_id,
                                "counterpart_id": counterpart_id,
                                "counterpart_online": counterpart_online,
                                "status": "ok"
                            })
                        else:
                            await websocket.send_json({
                                "type": "conversation:error",
                                "conv_id": conv_id,
                                "error": "unauthorized"
                            })

                elif action in ("conversation:leave", "chat:leave"):
                    conv_id = msg.get("conv_id") or msg.get("conversation_id")
                    if conv_id:
                        realtime_manager.leave_room(websocket, conv_id)
                        await websocket.send_json({"type": "conversation:left", "conv_id": conv_id, "status": "ok"})

                elif action in ("typing:start", "typing:stop"):
                    conv_id = msg.get("conv_id") or msg.get("conversation_id")
                    if conv_id:
                        conv_meta = check_conversation_authorization(conv_id, user_id=u_id, business_id=b_id, role=r_id)
                        if conv_meta:
                            is_typing = (action == "typing:start")
                            sender_name = msg.get("sender_name") or ("Hotel Recruiter" if r_id == "recruiter" else "Candidate")
                            notify_conversation_room(
                                conv_id,
                                "typing:update",
                                {
                                    "conversation_id": conv_id,
                                    "sender_id": u_id or b_id,
                                    "sender_name": sender_name,
                                    "is_typing": is_typing
                                },
                                exclude_ws=websocket
                            )

                elif action == "message:read":
                    conv_id = msg.get("conv_id") or msg.get("conversation_id")
                    if conv_id:
                        conv_meta = check_conversation_authorization(conv_id, user_id=u_id, business_id=b_id, role=r_id)
                        if conv_meta:
                            now = datetime.now().strftime("%Y-%m-%d %H:%M")
                            conn = database.get_db()
                            cursor = conn.cursor()
                            is_biz = (r_id == "recruiter") or (b_id == conv_meta["business_id"])
                            if is_biz:
                                cursor.execute("UPDATE conversations SET unread_for_business = 0 WHERE id = ?", (conv_id,))
                                cursor.execute("""
                                    UPDATE messages 
                                    SET status = 'read', read_at = ? 
                                    WHERE conversation_id = ? AND sender_role != 'business' AND (status IS NULL OR status != 'read')
                                """, (now, conv_id))
                                target_u = conv_meta["user_id"]
                                target_b = None
                                reader_id = b_id or conv_meta["business_id"]
                            else:
                                cursor.execute("UPDATE conversations SET unread_for_user = 0 WHERE id = ?", (conv_id,))
                                cursor.execute("""
                                    UPDATE messages 
                                    SET status = 'read', read_at = ? 
                                    WHERE conversation_id = ? AND sender_role = 'business' AND (status IS NULL OR status != 'read')
                                """, (now, conv_id))
                                target_u = None
                                target_b = conv_meta["business_id"]
                                reader_id = u_id or conv_meta["user_id"]
                            conn.commit()
                            conn.close()

                            read_payload = {
                                "conversation_id": conv_id,
                                "reader_id": reader_id,
                                "read_at": now
                            }
                            notify_conversation_room(conv_id, "message:read", read_payload, exclude_ws=websocket)
                            notify_realtime("message:read", read_payload, target_user=target_u, target_business=target_b)

                elif action == "presence:query":
                    entity_id = msg.get("entity_id")
                    is_online = realtime_manager.is_entity_online(entity_id) if entity_id else False
                    await websocket.send_json({"type": "presence:status", "entity_id": entity_id, "is_online": is_online})

                elif action == "ping":
                    await websocket.send_json({"type": "pong", "time": time.time()})
            except Exception:
                pass
    except WebSocketDisconnect:
        realtime_manager.disconnect_ws(websocket)
    except Exception:
        realtime_manager.disconnect_ws(websocket)

@app.get("/api/realtime/stream")
@app.get("/api/realtime/events")
@app.get("/events")
async def sse_realtime_endpoint(request: Request, user_id: Optional[str] = None, business_id: Optional[str] = None):
    global main_event_loop
    try:
        main_event_loop = asyncio.get_running_loop()
    except Exception:
        pass
    queue = asyncio.Queue()
    realtime_manager.sse_subscribers[queue] = {"user_id": user_id, "business_id": business_id}

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'connection_established', 'status': 'ok', 'user_id': user_id, 'business_id': business_id})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=25.0)
                    yield data
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            realtime_manager.sse_subscribers.pop(queue, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.post("/api/realtime/test-emit")
async def realtime_test_emit_endpoint(request: Request):
    """Utility endpoint for verifying real-time delivery in test suites."""
    if database.is_production():
        auth_hdr = request.headers.get("X-Admin-Token") or request.headers.get("Authorization")
        if not auth_hdr:
            raise HTTPException(status_code=403, detail="Security Notice: Realtime test emitter is disabled in production environments.")

    body = await request.json()
    event_type = body.get("type", "test_event")
    data = body.get("data", {})
    target_user = body.get("target_user")
    target_business = body.get("target_business")
    notify_realtime(event_type, data, target_user=target_user, target_business=target_business)
    return {"status": "dispatched", "type": event_type, "target_user": target_user, "target_business": target_business}

# =======================
# EMAIL NOTIFICATION SYSTEM
# =======================

DEFAULT_SYSTEM_EMAIL = "no-reply.nicejobs@nicesoftware.com.bd"

def dispatch_system_email(to_email: str, subject: str, body_text: str, event_type: str = "general", cursor = None, html_body: Optional[str] = None):
    mail_id = f"mail_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Email configuration
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER") or DEFAULT_SYSTEM_EMAIL
    smtp_pass = os.environ.get("SMTP_PASSWORD")
    smtp_from = os.environ.get("SMTP_FROM") or smtp_user or DEFAULT_SYSTEM_EMAIL
    smtp_use_ssl = os.environ.get("SMTP_USE_SSL", "").strip().lower() in ("1", "true", "yes") or smtp_port == 465
    resend_api_key = os.environ.get("RESEND_API_KEY")

    status = "delivered_simulated"

    # Option A: Direct Resend HTTP API (if configured)
    if resend_api_key:
        try:
            import urllib.request
            req_data = {
                "from": f"NiceJobs <{smtp_from}>",
                "to": [to_email],
                "subject": subject,
                "text": body_text
            }
            if html_body:
                req_data["html"] = html_body

            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=json.dumps(req_data).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {resend_api_key.strip()}",
                    "Content-Type": "application/json"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status in (200, 201):
                    status = "delivered_resend_api"
        except Exception as e:
            logger.error(f"[RESEND API ERROR] Failed sending to {to_email}: {e}")
            status = f"resend_failed: {str(e)[:50]}"

    # Option B: Standard SMTP Protocol (mail.nicesoftware.com.bd / TLS 587 / SSL 465)
    elif smtp_host and smtp_pass:
        try:
            import smtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            if html_body:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"NiceJobs Platform <{smtp_from}>"
                msg["To"] = to_email
                msg.attach(MIMEText(body_text, "plain", "utf-8"))
                msg.attach(MIMEText(html_body, "html", "utf-8"))
            else:
                msg = MIMEText(body_text, "plain", "utf-8")
                msg["Subject"] = subject
                msg["From"] = f"NiceJobs Platform <{smtp_from}>"
                msg["To"] = to_email

            if smtp_use_ssl:
                with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=25) as server:
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=25) as server:
                    server.starttls()
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            status = "delivered_smtp"
        except Exception as e:
            logger.error(f"[MAIL SMTP ERROR] Failed sending to {to_email}: {e}")
            status = f"smtp_failed: {str(e)[:50]}"

    # Log to email_logs table for permanent audit and verification
    try:
        close_needed = False
        active_cursor = cursor
        if active_cursor is None:
            conn = database.get_db()
            active_cursor = conn.cursor()
            close_needed = True

        active_cursor.execute("""
            INSERT INTO email_logs (id, recipient, subject, event_type, body_text, status, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (mail_id, to_email, subject, event_type, body_text, status, now))

        if close_needed:
            conn.commit()
            conn.close()
    except Exception as e:
        logger.error(f"[MAIL LOG ERROR] {e}")

    logger.info(f"[EMAIL NOTIFICATION DISPATCHED] Status: {status} | Sender: {smtp_from} | Recipient: {to_email} | Subject: {subject}")
    return {"id": mail_id, "status": status, "to": to_email, "sender": smtp_from}

def generate_otp_email_content(code: str, purpose: str = "general") -> tuple:
    """
    Generates plain-text and responsive HTML email templates for 6-digit OTP verification.
    Sender: no-reply.nicejobs@nicesoftware.com.bd
    Validity: Strictly 5 minutes.
    """
    purpose_label = "Account Security Verification"
    if purpose == "candidate_signup":
        purpose_label = "Hospitality Candidate Registration"
    elif purpose in ["business_signup", "hotel_registration"]:
        purpose_label = "Hotel Establishment Registration"
    elif purpose in ["join_business", "recruiter_signup"]:
        purpose_label = "Hotel Representative Verification"
    elif purpose == "login":
        purpose_label = "Secure Account Sign In"
    elif purpose == "contact_change":
        purpose_label = "Profile Contact Information Update"

    body_text = f"""NiceJobs — Security Verification Code

Hello,

Your 6-digit security verification code is: {code}

Purpose: {purpose_label}
Sender: no-reply.nicejobs@nicesoftware.com.bd

IMPORTANT: This code is valid for 5 minutes only.
For your protection, never share this code with anyone. NiceJobs personnel will never ask for your verification code.

If you did not initiate this request, please ignore this email.

Best regards,
NiceJobs Hospitality Careers & ATS Portal
https://nicejobs.info
"""

    html_body = f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="format-detection" content="telephone=no">
  <meta name="x-apple-disable-message-reformatting">
  <title>Your NiceJobs Verification Code</title>
  <style>
    body, table, td, p, a, li, blockquote {{
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }}
    table, td {{
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }}
    @media screen and (max-width: 480px) {{
      .email-wrapper {{
        padding: 8px 4px !important;
      }}
      .email-container {{
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 8px !important;
      }}
      .card-header {{
        padding: 14px 16px !important;
      }}
      .card-body {{
        padding: 16px 14px !important;
      }}
      .otp-box {{
        padding: 12px 6px !important;
        margin: 0 0 14px 0 !important;
      }}
      .otp-digits {{
        font-size: 26px !important;
        letter-spacing: 5px !important;
      }}
      .note-box {{
        padding: 10px 12px !important;
        margin-bottom: 14px !important;
      }}
    }}
  </style>
</head>
<body style="margin: 0; padding: 0; width: 100% !important; background-color: #070d1e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <!-- Outer Center Table -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-wrapper" style="background-color: #070d1e; width: 100%; margin: 0; padding: 20px 10px;">
    <tr>
      <td align="center" valign="top">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-container" style="max-width: 430px; width: 100%; margin: 0 auto; background-color: #0a1128; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td class="card-header" style="padding: 16px 20px; background: linear-gradient(135deg, rgba(255,107,0,0.18) 0%, rgba(10,17,40,0.9) 100%); border-bottom: 1px solid rgba(255,255,255,0.08);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px; line-height: 1.2;">Nice<span style="color: #ff6b00;">Jobs</span></span>
                    <div style="font-size: 10px; color: #94a3b8; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Luxury Hospitality Careers &amp; ATS</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td class="card-body" style="padding: 22px 20px 16px 20px;">
              <h1 style="font-size: 17px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0; line-height: 1.3;">Security Verification</h1>
              <p style="font-size: 13px; line-height: 1.5; color: #94a3b8; margin: 0 0 16px 0;">
                You are performing <strong style="color: #e2e8f0;">{purpose_label}</strong>. Enter the 6-digit verification code below:
              </p>

              <!-- Responsive OTP Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="otp-box" style="width: 100%; background: rgba(255, 107, 0, 0.08); border: 2px dashed #ff6b00; border-radius: 8px; margin: 0 0 16px 0;">
                <tr>
                  <td align="center" style="padding: 14px 10px;">
                    <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: #ff7a18; font-weight: 700; margin-bottom: 4px;">6-Digit OTP Code</div>
                    <div class="otp-digits" style="font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #ffffff; font-family: 'Courier New', Courier, monospace; line-height: 1.2;">
                      {code}
                    </div>
                    <div style="font-size: 11px; color: #f87171; font-weight: 600; margin-top: 6px;">
                      ⏱ Valid for 5 minutes only
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Notice Box -->
              <div class="note-box" style="background: rgba(255, 255, 255, 0.035); border-left: 3px solid #ff6b00; border-radius: 4px; padding: 10px 12px; margin-bottom: 16px;">
                <p style="font-size: 11px; line-height: 1.45; color: #cbd5e1; margin: 0;">
                  <strong>Security Note:</strong> Never share this code. NiceJobs staff will never request this verification code.
                </p>
              </div>

              <p style="font-size: 11px; line-height: 1.4; color: #64748b; margin: 0;">
                If you did not request this code, no action is needed and your account remains secure.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 12px 18px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.06); text-align: center;">
              <p style="font-size: 10px; color: #64748b; margin: 0 0 3px 0; line-height: 1.3;">
                Dispatched from: <a href="mailto:no-reply.nicejobs@nicesoftware.com.bd" style="color: #94a3b8; text-decoration: none;">no-reply.nicejobs@nicesoftware.com.bd</a>
              </p>
              <p style="font-size: 10px; color: #475569; margin: 0; line-height: 1.3;">
                &copy; 2026 NiceJobs Hospitality Portal
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    return body_text, html_body

def check_and_consume_otp(cursor, identifiers: list, code: str, max_age_seconds: int = 300, mark_consumed: bool = True) -> tuple:
    """
    Validates a 6-digit OTP code against otp_verifications for the given identifiers.
    Enforces strict 5-minute (300 seconds) expiration.
    Returns (is_valid: bool, error_message: str).
    """
    clean_code = (code or "").strip()
    if not clean_code:
        return False, "Please enter the 6-digit OTP code."

    search_set = set()
    for ident in identifiers:
        if not ident:
            continue
        raw = str(ident).strip()
        search_set.add(raw)
        if "@" in raw:
            search_set.add(raw.lower())
        norm = normalize_phone(raw)
        if norm:
            search_set.add(norm)
            search_set.add(f"+88{norm}")
            search_set.add(f"+88 {norm}")
            digits = "".join(filter(str.isdigit, raw))
            if digits:
                search_set.add(digits)

    search_set.discard("")
    search_set.discard(None)
    if not search_set:
        return False, "No valid contact identifier provided for verification."

    placeholders = ", ".join(["?"] * len(search_set))
    params = list(search_set) + [clean_code]
    cursor.execute(f"""
        SELECT id, created_at, verified FROM otp_verifications
        WHERE identifier IN ({placeholders}) AND otp_code = ? AND (verified = 0 OR verified = 1)
        ORDER BY created_at DESC LIMIT 1
    """, params)
    row = cursor.fetchone()

    if not row:
        return False, "Invalid verification code. Please check your email or phone."

    # Enforce 5-minute (300 seconds) expiration check
    created_at_str = row["created_at"]
    if created_at_str:
        try:
            created_dt = datetime.strptime(created_at_str, "%Y-%m-%d %H:%M:%S")
            elapsed = (datetime.now() - created_dt).total_seconds()
            if elapsed > max_age_seconds:
                mins = int(elapsed // 60)
                return False, f"This verification code has expired ({mins} min old). OTP is valid for 5 minutes only. Please request a new code."
        except Exception as e:
            logger.warning(f"Error checking OTP created_at '{created_at_str}': {e}")

    if mark_consumed:
        cursor.execute("UPDATE otp_verifications SET verified = 2 WHERE id = ?", (row["id"],))

    return True, ""

# =======================
# API ENDPOINTS & DEMO DATA MANAGEMENT
# =======================

DEFAULT_AVATAR_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='100' height='100'><rect width='100' height='100' fill='%23ffffff'/><circle cx='50' cy='36' r='16' fill='%23000000'/><path d='M22 84 C22 66, 35 60, 50 60 C65 60, 78 66, 78 84 Z' fill='%23000000'/></svg>"
DEFAULT_HOTEL_LOGO_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='100' height='100'><rect width='100' height='100' rx='16' fill='%23ffffff'/><path d='M28 80 V22 H72 V80 H28 Z M38 32 H46 V40 H38 V32 Z M38 46 H46 V54 H38 V46 Z M38 60 H46 V68 H38 V60 Z M54 32 H62 V40 H54 V32 Z M54 46 H62 V54 H54 V46 Z M54 60 H62 V68 H54 V60 Z' fill='%23000000'/></svg>"

# In-memory performance cache for ultra-fast response times
_demo_hidden_cache = {"val": True, "ts": 0.0}
_API_CACHE = {}
_API_CACHE_TTL = 15.0  # Cache public list reads for 15s to make tab switching & refresh instant

def get_cached_api(key: str):
    import time
    item = _API_CACHE.get(key)
    if item and (time.time() - item["ts"] < _API_CACHE_TTL):
        return item["data"]
    return None

def set_cached_api(key: str, data):
    import time
    _API_CACHE[key] = {"data": data, "ts": time.time()}

def invalidate_api_cache(prefix: Optional[str] = None):
    if not prefix:
        _API_CACHE.clear()
    else:
        prefixes = [prefix]
        if prefix in ("jobs", "job"):
            prefixes = ["jobs", "job_base"]
        keys_to_del = [k for k in _API_CACHE if any(k.startswith(p) for p in prefixes)]
        for k in keys_to_del:
            _API_CACHE.pop(k, None)

def is_demo_hidden() -> bool:
    import time
    now = time.time()
    if now - _demo_hidden_cache["ts"] < 60.0:
        return _demo_hidden_cache["val"]
    try:
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM system_settings WHERE key = 'demo_data_hidden'")
        row = cursor.fetchone()
        conn.close()
        _demo_hidden_cache["val"] = bool(row and row["value"] == "1")
        _demo_hidden_cache["ts"] = now
        return _demo_hidden_cache["val"]
    except Exception:
        return True

@app.get("/api/jobs")
def get_jobs(
    q: Optional[str] = None,
    location: Optional[str] = None,
    department: Optional[str] = None,
    designation: Optional[str] = None,
    employment_type: Optional[str] = None,
    experience_level: Optional[str] = None,
    accommodation: Optional[bool] = None,
    duty_meals: Optional[bool] = None,
    urgent_only: Optional[bool] = None,
    business_id: Optional[str] = None,
    status: Optional[str] = "active"
):
    demo_hidden = is_demo_hidden()
    cache_key = f"jobs:{q}:{location}:{department}:{designation}:{employment_type}:{experience_level}:{accommodation}:{duty_meals}:{urgent_only}:{business_id}:{status}:{demo_hidden}"
    cached = get_cached_api(cache_key)
    if cached is not None:
        return cached

    conn = database.get_db()
    cursor = conn.cursor()

    query = """
        SELECT j.*, b.brand_name, b.property_type, b.city, b.logo_url, b.verification_status, b.star_rating
        FROM jobs j
        JOIN businesses b ON j.business_id = b.id
        WHERE 1=1
    """
    params = []

    if demo_hidden:
        query += " AND (j.is_demo = 0 OR j.is_demo IS NULL)"
        query += " AND (b.is_demo = 0 OR b.is_demo IS NULL)"

    if status and status != "all":
        query += " AND j.status = ?"
        params.append(status)
        query += " AND (b.verification_status = 'verified' OR b.verification_status IS NULL)"

    if business_id:
        chk_b = cursor.execute("SELECT verification_status FROM businesses WHERE id = ?", (business_id,)).fetchone()
        if chk_b and (chk_b["verification_status"] or "pending") != "verified":
            conn.close()
            return []
        query += " AND j.business_id = ?"
        params.append(business_id)

    if q:
        query += " AND (j.title LIKE ? OR j.description LIKE ? OR b.brand_name LIKE ?)"
        like_q = f"%{q}%"
        params.extend([like_q, like_q, like_q])

    if location:
        loc_str = location.strip()
        if 'chattogram' in loc_str.lower() or 'chittagong' in loc_str.lower():
            query += " AND (b.city LIKE '%Chittagong%' OR b.city LIKE '%Chattogram%' OR j.property_location LIKE '%Chittagong%' OR j.property_location LIKE '%Chattogram%')"
        elif 'barishal' in loc_str.lower() or 'barisal' in loc_str.lower():
            query += " AND (b.city LIKE '%Barishal%' OR b.city LIKE '%Barisal%' OR j.property_location LIKE '%Barishal%' OR j.property_location LIKE '%Barisal%')"
        else:
            query += " AND (b.city LIKE ? OR j.property_location LIKE ?)"
            like_loc = f"%{loc_str}%"
            params.extend([like_loc, like_loc])

    if department:
        query += " AND j.department = ?"
        params.append(department)

    if designation:
        query += " AND (j.title LIKE ? OR j.description LIKE ?)"
        like_desig = f"%{designation}%"
        params.extend([like_desig, like_desig])

    if employment_type:
        query += " AND j.employment_type = ?"
        params.append(employment_type)

    if experience_level:
        query += " AND j.experience_level = ?"
        params.append(experience_level)

    if accommodation is True:
        query += " AND j.accommodation_provided = 1"

    if duty_meals is True:
        query += " AND j.duty_meals_provided = 1"

    if urgent_only is True:
        query += " AND j.is_urgent = 1"

    query += " ORDER BY j.is_featured DESC, j.is_urgent DESC, j.posted_at DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()

    results = []
    for r in rows:
        d = dict(r)
        d["requirements"] = json.loads(d["requirements"]) if d.get("requirements") else []
        d["education_requirements"] = json.loads(d["education_requirements"]) if d.get("education_requirements") else []
        d["skill_requirements"] = json.loads(d["skill_requirements"]) if d.get("skill_requirements") else []
        d["screening_questions"] = json.loads(d["screening_questions"]) if d.get("screening_questions") else []
        raw_b = json.loads(d["benefits"]) if d.get("benefits") else []
        if not raw_b:
            if d.get("service_charge_included"): raw_b.append("Service Charge Distribution (100% Shared)")
            if d.get("accommodation_provided"): raw_b.append("Complimentary Staff Accommodation")
            if d.get("duty_meals_provided"): raw_b.append("Free Duty Meals (3 Meals / Shift)")
            raw_b.append("Comprehensive Health & Medical Insurance")
        d["benefits"] = raw_b
        results.append(d)

    conn.close()
    set_cached_api(cache_key, results)
    return results

@app.get("/api/jobs/{job_id}")
def get_job_detail(job_id: str, user_id: Optional[str] = "user_rahim"):
    conn = database.get_db()
    cursor = conn.cursor()

    effective_uid = user_id if user_id else ""
    cursor.execute("""
        SELECT j.*, b.brand_name, b.legal_name, b.property_type, b.city, b.address, b.website, b.email as business_email,
               b.logo_url, b.cover_image, b.verification_status, b.star_rating, b.description as business_desc,
               b.amenities, b.benefits as business_benefits,
               a.id as application_id, a.status as app_status, a.applied_at as app_applied_at, a.updated_at as app_updated_at,
               a.cover_letter as app_cover_letter, a.selected_cv as app_selected_cv, a.screening_answers as app_screening_answers,
               sj.saved_at as saved_timestamp
        FROM jobs j
        JOIN businesses b ON j.business_id = b.id
        LEFT JOIN applications a ON (j.id = a.job_id AND a.user_id = ?)
        LEFT JOIN saved_jobs sj ON (j.id = sj.job_id AND sj.user_id = ?)
        WHERE j.id = ?
    """, (effective_uid, effective_uid, job_id))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    job = dict(row)
    job["requirements"] = json.loads(job["requirements"]) if job.get("requirements") else []
    job["education_requirements"] = json.loads(job["education_requirements"]) if job.get("education_requirements") else []
    job["skill_requirements"] = json.loads(job["skill_requirements"]) if job.get("skill_requirements") else []
    job["screening_questions"] = json.loads(job["screening_questions"]) if job.get("screening_questions") else []
    job["amenities"] = json.loads(job["amenities"]) if job.get("amenities") else []
    job["business_benefits"] = json.loads(job["business_benefits"]) if job.get("business_benefits") else []
    raw_jb = json.loads(job["benefits"]) if job.get("benefits") else []
    if not raw_jb:
        if job.get("service_charge_included"): raw_jb.append("Service Charge Distribution (100% Shared)")
        if job.get("accommodation_provided"): raw_jb.append("Complimentary Staff Accommodation")
        if job.get("duty_meals_provided"): raw_jb.append("Free Duty Meals (3 Meals / Shift)")
        raw_jb.append("Comprehensive Health & Medical Insurance")
    job["benefits"] = raw_jb

    # Extract application and saved state from joined fields
    applied = bool(job.get("application_id"))
    application_data = None
    if applied:
        scr = job.get("app_screening_answers")
        if scr and isinstance(scr, str):
            try:
                scr = json.loads(scr)
            except Exception:
                scr = {}
        application_data = {
            "id": job["application_id"],
            "job_id": job_id,
            "user_id": effective_uid,
            "status": job.get("app_status"),
            "applied_at": job.get("app_applied_at"),
            "updated_at": job.get("app_updated_at"),
            "cover_letter": job.get("app_cover_letter"),
            "selected_cv": job.get("app_selected_cv"),
            "screening_answers": scr
        }

    job["is_applied"] = applied
    job["application"] = application_data
    job["is_saved"] = bool(job.get("saved_timestamp"))

    # Clean up joined temporary columns
    for temp_col in ["application_id", "app_status", "app_applied_at", "app_updated_at",
                     "app_cover_letter", "app_selected_cv", "app_screening_answers", "saved_timestamp"]:
        job.pop(temp_col, None)

    return job

class JobCreatePayload(BaseModel):
    business_id: str = "biz_radisson"
    title: str
    department: str
    property_location: str
    employment_type: str = "Full-time"
    shift: str = "Rotational"
    salary_min: Optional[int] = 0
    salary_max: Optional[int] = 0
    salary_period: str = "month"
    currency: str = "BDT"
    is_negotiable: bool = False
    service_charge_included: bool = False
    accommodation_provided: bool = False
    duty_meals_provided: bool = False
    experience_level: str = "1-3 Years"
    vacancies: int = 1
    description: str
    requirements: Optional[List[str]] = []
    education_requirements: Optional[List[Dict[str, Any]]] = []
    skill_requirements: Optional[List[str]] = []
    benefits: Optional[List[str]] = []
    screening_questions: Optional[List[Dict[str, Any]]] = []
    is_urgent: bool = False
    deadline: str

@app.post("/api/jobs")
def create_job(payload: JobCreatePayload):
    conn = database.get_db()
    cursor = conn.cursor()

    # Rule: No business accounts will run or post without our verification
    cursor.execute("SELECT verification_status, brand_name FROM businesses WHERE id = ?", (payload.business_id,))
    biz = cursor.fetchone()
    if not biz or biz["verification_status"] != "verified":
        conn.close()
        raise HTTPException(
            status_code=403,
            detail="Business verification is pending or unapproved. No business accounts will run or post vacancies without official NiceJobs Trust verification."
        )

    job_id = f"job_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
    now_date = datetime.now().strftime("%Y-%m-%d")

    # Generate synthetic requirements list if not explicitly provided
    reqs = list(payload.requirements or [])
    if not reqs:
        for edu in (payload.education_requirements or []):
            deg = edu.get("degree", "")
            fld = edu.get("field", "")
            if deg:
                reqs.append(f"Educational Requirement: {deg}" + (f" (Major/Subject: {fld})" if fld else ""))
        if payload.experience_level:
            reqs.append(f"Experience Required: {payload.experience_level} in {payload.department}")
        if payload.skill_requirements:
            reqs.append(f"Core Hotel Competencies: {', '.join(payload.skill_requirements)}")

    sal_min = 0 if payload.is_negotiable else (payload.salary_min or 0)
    sal_max = 0 if payload.is_negotiable else (payload.salary_max or 0)
    sal_period = "negotiable" if payload.is_negotiable else (payload.salary_period or "month")

    benefits_list = list(payload.benefits or [])

    cursor.execute("""
        INSERT INTO jobs (
            id, business_id, title, department, property_location, employment_type, shift,
            salary_min, salary_max, salary_period, currency, service_charge_included,
            accommodation_provided, duty_meals_provided, experience_level, vacancies,
            description, requirements, education_requirements, skill_requirements, benefits, is_negotiable,
            screening_questions, status, is_urgent, is_featured,
            deadline, posted_at, applicant_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        job_id,
        payload.business_id,
        payload.title,
        payload.department,
        payload.property_location,
        payload.employment_type,
        payload.shift,
        sal_min,
        sal_max,
        sal_period,
        payload.currency,
        1 if (payload.service_charge_included or any('service charge' in b.lower() for b in benefits_list)) else 0,
        1 if (payload.accommodation_provided or any('accommodation' in b.lower() or 'housing' in b.lower() for b in benefits_list)) else 0,
        1 if (payload.duty_meals_provided or any('meal' in b.lower() for b in benefits_list)) else 0,
        payload.experience_level,
        payload.vacancies,
        payload.description,
        json.dumps(reqs),
        json.dumps(payload.education_requirements or []),
        json.dumps(payload.skill_requirements or []),
        json.dumps(benefits_list),
        1 if payload.is_negotiable else 0,
        json.dumps(payload.screening_questions or []),
        "active",
        1 if payload.is_urgent else 0,
        1, # Give featured highlight
        payload.deadline,
        now_date,
        0
    ))
    conn.commit()
    conn.close()
    invalidate_api_cache("jobs")

    notify_realtime(
        "job_created",
        {
            "job_id": job_id,
            "title": payload.title,
            "department": payload.department,
            "business_id": payload.business_id,
            "brand_name": biz["brand_name"] if biz else "Hospitality Employer",
            "is_urgent": payload.is_urgent
        }
    )

    return {"success": True, "job_id": job_id, "message": "Hospitality vacancy published successfully."}

@app.patch("/api/jobs/{job_id}/status")
def update_job_status(job_id: str, payload: Dict[str, str]):
    status = payload.get("status")
    if status not in ["draft", "active", "paused", "closed"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE jobs SET status = ? WHERE id = ?", (status, job_id))
    conn.commit()
    conn.close()
    invalidate_api_cache("jobs")

    notify_realtime(
        "job_status_changed",
        {
            "job_id": job_id,
            "status": status
        }
    )

    return {"success": True, "job_id": job_id, "status": status}

@app.get("/api/businesses")
def get_businesses(city: Optional[str] = None, property_type: Optional[str] = None):
    demo_hidden = is_demo_hidden()
    cache_key = f"businesses:{city}:{property_type}:{demo_hidden}"
    cached = get_cached_api(cache_key)
    if cached is not None:
        return cached

    conn = database.get_db()
    cursor = conn.cursor()

    query = "SELECT * FROM businesses WHERE 1=1"
    params = []

    if demo_hidden:
        query += " AND (is_demo = 0 OR is_demo IS NULL)"

    if city:
        query += " AND city LIKE ?"
        params.append(f"%{city}%")

    if property_type:
        query += " AND property_type = ?"
        params.append(property_type)

    query += " ORDER BY star_rating DESC, follower_count DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    results = []
    for r in rows:
        d = dict(r)
        d["departments"] = json.loads(d["departments"]) if d["departments"] else []
        d["amenities"] = json.loads(d["amenities"]) if d["amenities"] else []
        d["benefits"] = json.loads(d["benefits"]) if d["benefits"] else []
        results.append(d)

    conn.close()
    set_cached_api(cache_key, results)
    return results

@app.get("/api/businesses/{business_id}")
def get_business_detail(business_id: str, user_id: Optional[str] = "user_rahim"):
    conn = database.get_db()
    cursor = conn.cursor()

    effective_uid = user_id if user_id else ""
    cursor.execute("""
        SELECT b.*,
               (fb.business_id IS NOT NULL) as is_followed
        FROM businesses b
        LEFT JOIN followed_businesses fb ON (b.id = fb.business_id AND fb.user_id = ?)
        WHERE b.id = ?
    """, (effective_uid, business_id))
    row = cursor.fetchone()
    if not row or (is_demo_hidden() and row["is_demo"] == 1):
        conn.close()
        raise HTTPException(status_code=404, detail="Hotel/Business not found")

    biz = dict(row)
    biz["departments"] = json.loads(biz["departments"]) if biz["departments"] else []
    biz["amenities"] = json.loads(biz["amenities"]) if biz["amenities"] else []
    biz["benefits"] = json.loads(biz["benefits"]) if biz["benefits"] else []
    biz["is_followed"] = bool(biz.get("is_followed"))

    # Open jobs
    cursor.execute("SELECT * FROM jobs WHERE business_id = ? AND status = 'active' ORDER BY posted_at DESC", (business_id,))
    job_rows = cursor.fetchall()
    open_jobs = []
    for jr in job_rows:
        jd = dict(jr)
        jd["requirements"] = json.loads(jd["requirements"]) if jd["requirements"] else []
        open_jobs.append(jd)
    biz["open_jobs"] = open_jobs

    # Team members
    cursor.execute("""
        SELECT u.id, u.name, u.email, u.phone, u.avatar_url, bm.org_role
        FROM business_memberships bm
        JOIN users u ON bm.user_id = u.id
        WHERE bm.business_id = ?
    """, (business_id,))
    members = [dict(m) for m in cursor.fetchall()]
    biz["team_members"] = members

    conn.close()
    return biz

class BusinessUpdatePayload(BaseModel):
    brand_name: Optional[str] = None
    legal_name: Optional[str] = None
    property_type: Optional[str] = None
    star_rating: Optional[int] = None
    city: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    description: Optional[str] = None
    amenities: Optional[List[str]] = None
    benefits: Optional[List[str]] = None

@app.put("/api/businesses/{business_id}")
@app.post("/api/businesses/{business_id}")
@app.post("/api/businesses/{business_id}/edit")
def update_business_profile(business_id: str, payload: BusinessUpdatePayload):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM businesses WHERE id = ?", (business_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Hotel/Business not found")

    updates = []
    params = []
    if payload.brand_name is not None:
        updates.append("brand_name = ?")
        params.append(payload.brand_name)
    if payload.legal_name is not None:
        updates.append("legal_name = ?")
        params.append(payload.legal_name)
    if payload.property_type is not None:
        updates.append("property_type = ?")
        params.append(payload.property_type)
    if payload.star_rating is not None:
        updates.append("star_rating = ?")
        params.append(payload.star_rating)
    if payload.city is not None:
        updates.append("city = ?")
        params.append(payload.city)
    if payload.address is not None:
        updates.append("address = ?")
        params.append(payload.address)
    if payload.website is not None:
        updates.append("website = ?")
        params.append(payload.website)
    if payload.email is not None:
        updates.append("email = ?")
        params.append(payload.email)
    if payload.logo_url is not None:
        updates.append("logo_url = ?")
        params.append(payload.logo_url)
    if payload.description is not None:
        updates.append("description = ?")
        params.append(payload.description)
    if payload.amenities is not None:
        updates.append("amenities = ?")
        params.append(json.dumps(payload.amenities))
    if payload.benefits is not None:
        updates.append("benefits = ?")
        params.append(json.dumps(payload.benefits))

    if updates:
        params.append(business_id)
        cursor.execute(f"UPDATE businesses SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    conn.close()

    notify_realtime(
        "business_updated",
        {"business_id": business_id, "brand_name": payload.brand_name},
        target_business=business_id
    )

    return {"success": True, "message": "Business profile updated successfully."}

# ==========================================================================
# Hospitality Blog / Articles System
# ==========================================================================

@app.get("/api/blogs")
def get_blogs(category: Optional[str] = None):
    cache_key = f"blogs:{category}"
    cached = get_cached_api(cache_key)
    if cached is not None:
        return cached

    conn = database.get_db()
    cursor = conn.cursor()
    if category and category.lower() != 'all':
        cursor.execute("SELECT * FROM blogs WHERE category = ? ORDER BY published_at DESC", (category,))
    else:
        cursor.execute("SELECT * FROM blogs ORDER BY published_at DESC")
    rows = cursor.fetchall()
    blogs = []
    for r in rows:
        b = dict(r)
        b["tags"] = json.loads(b["tags"]) if b["tags"] else []
        blogs.append(b)
    conn.close()
    set_cached_api(cache_key, blogs)
    return blogs

@app.get("/api/blogs/{blog_id}")
def get_blog(blog_id: str):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM blogs WHERE id = ? OR slug = ?", (blog_id, blog_id))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Blog article not found")
    b = dict(row)
    b["tags"] = json.loads(b["tags"]) if b["tags"] else []
    return b

class BlogCreatePayload(BaseModel):
    title: str
    category: Optional[str] = "Career Advice"
    content: str
    cover_image: Optional[str] = None
    excerpt: Optional[str] = None
    tags: Optional[List[str]] = None
    author_id: Optional[str] = None

@app.post("/api/blogs")
def create_blog(payload: BlogCreatePayload):
    author_id = (payload.author_id or "").strip()
    if not author_id:
        raise HTTPException(status_code=401, detail="Author identification is required to publish articles.")

    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, designation, avatar_url, role, can_post_blog FROM users WHERE id = ?", (author_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User account not found.")

    is_admin = (user["role"] == "admin")
    can_post = bool(user["can_post_blog"]) or is_admin
    if not can_post:
        conn.close()
        raise HTTPException(status_code=403, detail="You do not have permission to publish blog articles.")

    title = payload.title.strip()
    if not title:
        conn.close()
        raise HTTPException(status_code=400, detail="Article title is required.")

    content = payload.content.strip()
    if not content:
        conn.close()
        raise HTTPException(status_code=400, detail="Article content is required.")

    category = (payload.category or "").strip() or "Career Advice"

    # Generate unique slug
    base_slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
    if not base_slug:
        base_slug = "article"
    slug = base_slug
    cursor.execute("SELECT 1 FROM blogs WHERE slug = ?", (slug,))
    if cursor.fetchone():
        slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

    # Excerpt
    excerpt = (payload.excerpt or "").strip()
    if not excerpt:
        clean_text = re.sub(r'<[^>]+>', ' ', content)
        clean_text = re.sub(r'!\[.*?\]\(.*?\)', ' ', clean_text)
        clean_text = re.sub(r'#+\s*', '', clean_text)
        words = clean_text.split()
        excerpt = " ".join(words[:32]) + ("..." if len(words) > 32 else "")

    cover_img = (payload.cover_image or "").strip()
    if not cover_img:
        cover_img = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&auto=format&fit=crop&q=80"

    word_count = len(content.split())
    read_minutes = max(1, round(word_count / 180))
    read_time = f"{read_minutes} min read"

    tags = payload.tags or [category]
    tags_json = json.dumps(tags)
    published_at = datetime.utcnow().strftime("%Y-%m-%d")

    author_name = user["name"]
    author_title = user["designation"] or ("Hospitality Leader" if is_admin else "Hospitality Specialist")
    author_avatar = user["avatar_url"] or "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80"
    blog_id = f"blog_{uuid.uuid4().hex[:10]}"

    cursor.execute("""
        INSERT INTO blogs (id, title, slug, category, excerpt, content, author_name, author_title, author_avatar, cover_image, read_time, published_at, tags, author_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        blog_id, title, slug, category, excerpt, content,
        author_name, author_title, author_avatar, cover_img,
        read_time, published_at, tags_json, user["id"]
    ))
    conn.commit()
    conn.close()

    invalidate_api_cache("blogs")

    new_blog = {
        "id": blog_id,
        "title": title,
        "slug": slug,
        "category": category,
        "excerpt": excerpt,
        "content": content,
        "author_name": author_name,
        "author_title": author_title,
        "author_avatar": author_avatar,
        "cover_image": cover_img,
        "read_time": read_time,
        "published_at": published_at,
        "tags": tags,
        "author_id": user["id"]
    }
    return {"success": True, "blog": new_blog}

@app.delete("/api/blogs/{blog_id}")
def delete_blog(blog_id: str, user_id: Optional[str] = None):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM blogs WHERE id = ? OR slug = ?", (blog_id, blog_id))
    b = cursor.fetchone()
    if not b:
        conn.close()
        raise HTTPException(status_code=404, detail="Blog article not found")

    if user_id:
        cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
        u = cursor.fetchone()
        if not u or (u["role"] != "admin" and b["author_id"] != user_id):
            conn.close()
            raise HTTPException(status_code=403, detail="Unauthorized to delete this blog article")

    cursor.execute("DELETE FROM blogs WHERE id = ?", (b["id"],))
    conn.commit()
    conn.close()
    invalidate_api_cache("blogs")
    return {"success": True, "message": "Article removed successfully"}

@app.post("/api/businesses/{business_id}/follow")
def toggle_follow(business_id: str, user_id: str = "user_rahim"):
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT 1 FROM followed_businesses WHERE user_id = ? AND business_id = ?", (user_id, business_id))
    exists = cursor.fetchone()

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    if exists:
        cursor.execute("DELETE FROM followed_businesses WHERE user_id = ? AND business_id = ?", (user_id, business_id))
        cursor.execute("UPDATE businesses SET follower_count = CASE WHEN follower_count > 0 THEN follower_count - 1 ELSE 0 END WHERE id = ?", (business_id,))
        is_followed = False
    else:
        cursor.execute("INSERT INTO followed_businesses (user_id, business_id, followed_at) VALUES (?, ?, ?)", (user_id, business_id, now))
        cursor.execute("UPDATE businesses SET follower_count = follower_count + 1 WHERE id = ?", (business_id,))
        is_followed = True

    conn.commit()
    conn.close()

    notify_realtime(
        "business_follow_updated",
        {"business_id": business_id, "user_id": user_id, "is_followed": is_followed}
    )

    return {"is_followed": is_followed}

# =======================
# AUTHENTICATION & OTP
# =======================

def normalize_phone(phone: Optional[str]) -> str:
    if not phone:
        return ""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("880"):
        digits = "0" + digits[3:]
    return digits

class SendOtpPayload(BaseModel):
    identifier: Optional[str] = None # Email or cell phone
    phone: Optional[str] = None
    email: Optional[str] = None
    purpose: str = "general" # 'candidate_signup', 'business_signup', 'contact_change'

@app.post("/api/auth/send-otp")
def send_otp(payload: SendOtpPayload):
    rate_key = (payload.identifier or payload.email or payload.phone or "unknown").strip().lower()
    check_public_rate_limit(f"otp_{rate_key}", max_attempts=5, window_seconds=120)

    import random
    code = f"{random.randint(100000, 999999)}"
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = database.get_db()
    cursor = conn.cursor()

    targets = set()
    target_email = ""
    if payload.email and "@" in payload.email:
        target_email = payload.email.strip().lower()
    elif payload.identifier and "@" in payload.identifier:
        target_email = payload.identifier.strip().lower()

    # If identifier was a phone number, check if account has a registered email
    if not target_email and (payload.phone or payload.identifier):
        lookup_term = (payload.phone or payload.identifier).strip()
        norm_term = normalize_phone(lookup_term)
        cursor.execute("SELECT email FROM users WHERE phone = ? OR phone = ? LIMIT 1", (lookup_term, norm_term))
        user_row = cursor.fetchone()
        if user_row and user_row["email"]:
            target_email = user_row["email"].strip().lower()

    if not target_email:
        conn.close()
        raise HTTPException(status_code=400, detail="Please provide a valid email address to receive your 6-digit verification code.")

    targets.add(target_email)

    # Also register phone aliases if provided so registration can match either identifier
    if payload.phone:
        p_raw = payload.phone.strip()
        targets.add(p_raw)
        norm_p = normalize_phone(p_raw)
        if norm_p:
            targets.add(norm_p)
            targets.add(f"+88{norm_p}")
            targets.add(f"+88 {norm_p}")

    for t in targets:
        otp_id = f"otp_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
        cursor.execute("INSERT INTO otp_verifications (id, identifier, otp_code, purpose, created_at, verified) VALUES (?, ?, ?, ?, ?, ?)", (otp_id, t, code, payload.purpose, now, 0))

    # Send OTP strictly to candidate's/business user's email address
    plain_text, html_body = generate_otp_email_content(code, payload.purpose)
    subject = f"{code} is your NiceJobs verification code"

    dispatch_system_email(
        to_email=target_email,
        subject=subject,
        body_text=plain_text,
        event_type="otp_verification",
        cursor=cursor,
        html_body=html_body
    )

    conn.commit()
    conn.close()

    res_data = {
        "success": True,
        "message": f"6-digit verification code sent to {target_email}. Code is valid for 5 minutes.",
        "expires_in_seconds": 300,
        "sender": "no-reply.nicejobs@nicesoftware.com.bd"
    }
    return res_data

class VerifyOtpPayload(BaseModel):
    identifier: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    otp_code: str
    purpose: Optional[str] = None

@app.post("/api/auth/verify-otp")
def verify_otp(payload: VerifyOtpPayload):
    conn = database.get_db()
    cursor = conn.cursor()
    ident_list = [payload.identifier, payload.email, payload.phone]
    is_valid, err_msg = check_and_consume_otp(cursor, ident_list, payload.otp_code, max_age_seconds=300, mark_consumed=False)
    if not is_valid:
        conn.close()
        raise HTTPException(status_code=400, detail=err_msg)

    # Mark verified = 1 (stage passed)
    raw_p = (payload.phone or "").strip()
    norm_p = normalize_phone(raw_p) if raw_p else ""
    with_prefix = f"+88{norm_p}" if norm_p else ""
    email = (payload.email or "").strip().lower()
    ident = (payload.identifier or "").strip()
    cursor.execute("""
        UPDATE otp_verifications SET verified = 1 
        WHERE (identifier = ? OR identifier = ? OR identifier = ? OR identifier = ? OR identifier = ?) 
          AND otp_code = ? AND verified = 0
    """, (ident, email, raw_p, norm_p, with_prefix, payload.otp_code.strip()))
    conn.commit()
    conn.close()
    return {"success": True, "verified": True}

class CheckBusinessPayload(BaseModel):
    email: str

@app.post("/api/auth/check-business")
def check_business(payload: CheckBusinessPayload):
    conn = database.get_db()
    cursor = conn.cursor()
    target_email = payload.email.strip().lower()

    cursor.execute("""
        SELECT b.*, u.name as admin_name
        FROM businesses b
        LEFT JOIN users u ON b.admin_user_id = u.id
        WHERE LOWER(b.email) = ?
        LIMIT 1
    """, (target_email,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return {
            "exists": False,
            "message": "This business is not yet in our directory, please create an account"
        }

    b_dict = dict(row)
    return {
        "exists": True,
        "business": {
            "id": b_dict["id"],
            "brand_name": b_dict["brand_name"],
            "legal_name": b_dict["legal_name"],
            "property_type": b_dict["property_type"],
            "email": b_dict["email"],
            "city": b_dict["city"],
            "verification_status": b_dict.get("verification_status") or "pending",
            "admin_user_id": b_dict.get("admin_user_id"),
            "admin_name": b_dict.get("admin_name") or "Business Administrator",
            "has_admin": bool(b_dict.get("admin_user_id"))
        }
    }

class CheckCandidateAvailabilityPayload(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    phone_secondary: Optional[str] = None

@app.post("/api/auth/check-candidate-availability")
def check_candidate_availability(payload: CheckCandidateAvailabilityPayload):
    rate_key = (payload.email or payload.phone or "anon").strip().lower()
    check_public_rate_limit(f"chk_cand_{rate_key}", max_attempts=30, window_seconds=60)

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        # 1. Check email uniqueness across all users and businesses
        if payload.email and payload.email.strip():
            em = payload.email.strip().lower()
            cursor.execute("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1", (em,))
            if cursor.fetchone():
                return {
                    "available": False,
                    "field": "email",
                    "message": "This email address is already registered to an existing account. Please log in or use a different email."
                }
            cursor.execute("SELECT id FROM businesses WHERE LOWER(email) = ? LIMIT 1", (em,))
            if cursor.fetchone():
                return {
                    "available": False,
                    "field": "email",
                    "message": "This email address is already registered to an existing business account. Please log in or use a different email."
                }

        # 2. Check primary phone uniqueness across all users and businesses
        if payload.phone and payload.phone.strip():
            raw_p = payload.phone.strip()
            norm_p = normalize_phone(raw_p)
            with_prefix = f"+88{norm_p}" if norm_p else ""
            clean_digits = "".join(filter(str.isdigit, raw_p))

            cursor.execute("""
                SELECT id FROM users 
                WHERE phone = ? OR phone = ? OR phone = ? OR phone = ?
                LIMIT 1
            """, (raw_p, norm_p, with_prefix, clean_digits))
            if cursor.fetchone():
                return {
                    "available": False,
                    "field": "phone",
                    "message": "This mobile phone number is already registered to an existing account. Please log in or use a different number."
                }

            cursor.execute("""
                SELECT id FROM businesses 
                WHERE telephone = ? OR telephone = ? OR official_telephone = ? OR official_telephone = ?
                LIMIT 1
            """, (raw_p, norm_p, raw_p, norm_p))
            if cursor.fetchone():
                return {
                    "available": False,
                    "field": "phone",
                    "message": "This phone number is already registered to an existing business account. Please use a different number."
                }

        # 3. Check secondary phone if provided
        if payload.phone_secondary and payload.phone_secondary.strip():
            sec_p = payload.phone_secondary.strip()
            sec_norm = normalize_phone(sec_p)
            sec_prefix = f"+88{sec_norm}" if sec_norm else ""
            sec_digits = "".join(filter(str.isdigit, sec_p))

            cursor.execute("""
                SELECT id FROM users 
                WHERE phone = ? OR phone = ? OR phone = ? OR phone = ?
                LIMIT 1
            """, (sec_p, sec_norm, sec_prefix, sec_digits))
            if cursor.fetchone():
                return {
                    "available": False,
                    "field": "phone_secondary",
                    "message": "This secondary mobile number is already registered to an existing account. Please use a different number."
                }

        return {"available": True, "message": "Available"}
    finally:
        conn.close()

class CheckBusinessAvailabilityPayload(BaseModel):
    official_email: Optional[str] = None
    official_telephone: Optional[str] = None
    representative_email: Optional[str] = None

@app.post("/api/auth/check-business-availability")
def check_business_availability(payload: CheckBusinessAvailabilityPayload):
    rate_key = (payload.official_email or payload.official_telephone or "anon").strip().lower()
    check_public_rate_limit(f"chk_biz_{rate_key}", max_attempts=30, window_seconds=60)

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        # 1. Check official email
        if payload.official_email and payload.official_email.strip():
            em = payload.official_email.strip().lower()
            cursor.execute("SELECT id FROM businesses WHERE LOWER(email) = ?", (em,))
            if cursor.fetchone():
                return {
                    "available": False,
                    "field": "official_email",
                    "message": "This official business email is already registered to an existing business account. Please log in or use a different official email."
                }
            cursor.execute("SELECT id FROM users WHERE LOWER(email) = ?", (em,))
            if cursor.fetchone():
                return {
                    "available": False,
                    "field": "official_email",
                    "message": "This email is already registered to an existing account. Please log in or use a different official email."
                }

        # 2. Check official telephone
        if payload.official_telephone and payload.official_telephone.strip():
            tel = payload.official_telephone.strip()
            norm_tel = normalize_phone(tel)
            if norm_tel and len(norm_tel) >= 5:
                # Check businesses
                cursor.execute("SELECT id, brand_name, telephone, official_telephone FROM businesses")
                for b_row in cursor.fetchall():
                    for f_tel in [b_row["telephone"], b_row["official_telephone"]]:
                        if f_tel and f_tel.strip():
                            if f_tel.strip() == tel or normalize_phone(f_tel.strip()) == norm_tel:
                                return {
                                    "available": False,
                                    "field": "official_telephone",
                                    "message": "This official business telephone is already registered to an existing account. Please use a different telephone number."
                                }
                # Check users (all roles)
                cursor.execute("SELECT id, phone FROM users WHERE phone IS NOT NULL AND phone != ''")
                for u_row in cursor.fetchall():
                    u_phone = u_row["phone"]
                    if u_phone and u_phone.strip():
                        if u_phone.strip() == tel or normalize_phone(u_phone.strip()) == norm_tel:
                            return {
                                "available": False,
                                "field": "official_telephone",
                                "message": "This official business telephone is already registered to an existing account. Please use a different telephone number."
                            }

        # 3. Check representative email
        if payload.representative_email and payload.representative_email.strip():
            rep_em = payload.representative_email.strip().lower()
            cursor.execute("SELECT id FROM users WHERE LOWER(email) = ?", (rep_em,))
            if cursor.fetchone():
                return {
                    "available": False,
                    "field": "representative_email",
                    "message": "An account with this email address is already open. Please log in or use a different work email."
                }
            cursor.execute("SELECT id FROM businesses WHERE LOWER(email) = ?", (rep_em,))
            if cursor.fetchone():
                return {
                    "available": False,
                    "field": "representative_email",
                    "message": "This email is registered as an official business email. Please use your personal work email."
                }

        return {
            "available": True,
            "message": "Available"
        }
    finally:
        conn.close()

class CandidateRegisterPayload(BaseModel):
    name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    name_bangla: Optional[str] = None
    email: str
    phone: str
    phone_secondary: Optional[str] = None
    password: str = "Password123!"
    otp_code: str
    # Part 1 fields
    dob: Optional[str] = None
    nid_passport: Optional[str] = None
    avatar_url: Optional[str] = None
    # Part 2 fields
    bio: Optional[str] = None
    summary: Optional[str] = None
    cv_name: Optional[str] = None
    cv_url: Optional[str] = None
    cv_data: Optional[str] = None
    education: Optional[Any] = None # List of {institution, degree, gpa}
    skills: Optional[List[str]] = None
    languages: Optional[Any] = None # List of {name, level}
    experience: Optional[Any] = None # List of {company, role, period, skills_acquired}
    current_position: Optional[str] = None
    department: Optional[str] = "Front Office"
    location: Optional[str] = "Dhaka, Bangladesh"
    experience_years: Optional[int] = 2
    expected_salary: Optional[str] = "BDT 40,000 - 60,000"
    work_type: Optional[str] = "Full-time"
    notice_period: Optional[str] = "1 Month"
    visibility: Optional[str] = "eligible_employers"
    open_to_work: Optional[bool] = True
    job_preferences: Optional[Any] = None

@app.post("/api/auth/register-candidate")
@app.post("/api/auth/candidate-signup")
def register_candidate(payload: CandidateRegisterPayload):
    conn = database.get_db()
    cursor = conn.cursor()

    is_valid_otp, otp_err = check_and_consume_otp(cursor, [payload.email, payload.phone], payload.otp_code, max_age_seconds=300, mark_consumed=True)
    if not is_valid_otp:
        conn.close()
        raise HTTPException(status_code=400, detail=otp_err)

    # Check uniqueness among candidate accounts (business user emails can open a candidate account)
    cand_email = payload.email.strip().lower()
    cand_phone = payload.phone.strip()
    norm_cand_phone = normalize_phone(cand_phone)
    cursor.execute("SELECT id FROM users WHERE LOWER(email) = ? AND role = 'jobseeker'", (cand_email,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="A candidate account with this email address already exists. Please log in.")

    cursor.execute("SELECT id, phone FROM users WHERE role = 'jobseeker'")
    for u_row in cursor.fetchall():
        u_p = (u_row["phone"] or "").strip()
        if u_p and (u_p == cand_phone or (norm_cand_phone and normalize_phone(u_p) == norm_cand_phone)):
            conn.close()
            raise HTTPException(status_code=400, detail="A candidate account with this phone number already exists. Please log in.")

    user_id = f"user_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    avatar = payload.avatar_url or DEFAULT_AVATAR_SVG
    dob_val = payload.dob or ""
    nid_val = payload.nid_passport or ""

    fn = (payload.first_name or "").strip()
    mn = (payload.middle_name or "").strip()
    ln = (payload.last_name or "").strip()
    nb = (payload.name_bangla or "").strip()

    name_parts = [p for p in [fn, mn, ln] if p]
    computed_name = " ".join(name_parts).strip()
    full_name = computed_name if computed_name else (payload.name or "Candidate").strip()
    secure_password_hash = hash_password(payload.password)

    cursor.execute("""
        INSERT INTO users (id, name, first_name, middle_name, last_name, name_bangla, email, phone, password, role, avatar_url, created_at, dob, nid_passport, status, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    """, (user_id, full_name, fn, mn, ln, nb, payload.email, payload.phone, secure_password_hash, "jobseeker", avatar, now, dob_val, nid_val, "active"))

    cv_filename = payload.cv_name or f"{full_name.replace(' ', '_')}_Hospitality_Resume.pdf"
    cv_data_content = (payload.cv_data or payload.cv_url or "").strip()
    initial_cvs = json.dumps([
        {
            "id": f"cv_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}",
            "name": cv_filename,
            "title": f"Primary {payload.department or 'Hospitality'} Career CV",
            "uploaded_at": now.split(' ')[0],
            "size": "240 KB",
            "is_default": True,
            "file_data": cv_data_content
        }
    ]) if cv_data_content else json.dumps([])

    skills_data = payload.skills if isinstance(payload.skills, list) else []
    
    # Process languages
    if isinstance(payload.languages, list):
        langs_data = payload.languages
    else:
        langs_data = []

    # Process education
    if isinstance(payload.education, list):
        edu_list = payload.education
    elif isinstance(payload.education, str) and payload.education:
        edu_list = [{"institution": "Hospitality Institute", "degree": payload.education, "year": "2026"}]
    else:
        edu_list = []

    # Process experience
    if isinstance(payload.experience, list):
        exp_list = payload.experience
    else:
        exp_list = []

    bio_text = payload.bio or payload.summary or ""
    headline_text = f"{payload.current_position} • {payload.department}" if payload.current_position and payload.department else (payload.current_position or payload.department or "Hospitality Specialist")

    prefs_data = {
        "target_roles": [payload.current_position or "Hospitality Associate"] if payload.current_position else [],
        "locations": [payload.location] if payload.location else ["Dhaka"],
        "expected_salary": payload.expected_salary or "Negotiable",
        "work_type": payload.work_type or "Full-time",
        "notice_period": payload.notice_period or "1 Month",
        "first_name": fn,
        "middle_name": mn,
        "last_name": ln,
        "name_bangla": nb
    }
    if isinstance(payload.job_preferences, dict):
        prefs_data.update(payload.job_preferences)
    if payload.phone_secondary:
        prefs_data["phone_secondary"] = payload.phone_secondary

    cursor.execute("""
        INSERT INTO employee_profiles (
            user_id, headline, location, summary, current_position, experience_years,
            open_to_work, visibility, skills, languages, certifications, experience,
            education, preferences, cv_name, cv_updated_at, profile_completion, cv_list,
            dob, nid_passport, cv_url, first_name, middle_name, last_name, name_bangla
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        headline_text,
        payload.location or "Dhaka, Bangladesh",
        bio_text,
        payload.current_position or "Hospitality Specialist",
        payload.experience_years or 0,
        1 if payload.open_to_work else 0,
        payload.visibility or "eligible_employers",
        json.dumps(skills_data),
        json.dumps(langs_data),
        json.dumps([]),
        json.dumps(exp_list),
        json.dumps(edu_list),
        json.dumps(prefs_data),
        cv_filename,
        "Just now",
        85 if payload.cv_name else 70,
        initial_cvs,
        dob_val,
        nid_val,
        cv_data_content or payload.cv_url or "",
        fn,
        mn,
        ln,
        nb
    ))

    conn.commit()
    conn.close()
    return {
        "success": True,
        "user_id": user_id,
        "name": full_name,
        "first_name": fn,
        "middle_name": mn,
        "last_name": ln,
        "name_bangla": nb,
        "email": payload.email,
        "phone": payload.phone,
        "role": "jobseeker",
        "message": "Candidate account verified and activated successfully!"
    }

class BusinessRegisterPayload(BaseModel):
    # Route A: New Business Account (Parts 1-5)
    brand_name: str
    legal_name: str
    property_type: str = "Luxury Hotel"
    plot_number: Optional[str] = ""
    road_number: Optional[str] = ""
    thana_upazila: Optional[str] = ""
    district: Optional[str] = ""
    address: Optional[str] = ""
    website: Optional[str] = ""
    email: Optional[str] = None # Official business email
    official_email: Optional[str] = None
    official_telephone: Optional[str] = ""
    telephone: Optional[str] = ""
    features: Optional[List[str]] = None
    logo_url: Optional[str] = None
    # Representative Info (Part 3)
    representative_name: str
    phone: str
    representative_email: Optional[str] = None
    dob: Optional[str] = ""
    avatar_url: Optional[str] = None
    designation: Optional[str] = "Director of Human Resources"
    # Credentials & Role (Part 4 & 5)
    password: Optional[str] = "Password123!"
    role_choice: Optional[str] = "admin" # 'admin' or 'moderator'
    otp_code: str

@app.post("/api/auth/register-business")
@app.post("/api/auth/business-signup")
def register_business(payload: BusinessRegisterPayload):
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        # 1. Check official business email uniqueness
        official_email_clean = (payload.email or payload.official_email or "").strip().lower()
        if not official_email_clean:
            raise HTTPException(status_code=400, detail="Official business email is required.")
        cursor.execute("SELECT id FROM businesses WHERE LOWER(email) = ?", (official_email_clean,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="This official business email is already registered to an existing account. Please log in or use a different official email."
            )
        cursor.execute("SELECT id FROM users WHERE LOWER(email) = ? AND role = 'recruiter'", (official_email_clean,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="This official business email is already registered to an existing business account. Please log in or use a different official email."
            )

        # 2. Check official telephone uniqueness
        official_tel = (payload.official_telephone or payload.telephone or "").strip()
        if official_tel:
            norm_tel = normalize_phone(official_tel)
            if norm_tel and len(norm_tel) >= 5:
                # Check in businesses
                cursor.execute("SELECT id, brand_name, telephone, official_telephone FROM businesses")
                for b_row in cursor.fetchall():
                    for f_tel in [b_row["telephone"], b_row["official_telephone"]]:
                        if f_tel and f_tel.strip():
                            if f_tel.strip() == official_tel or normalize_phone(f_tel.strip()) == norm_tel:
                                raise HTTPException(
                                    status_code=400,
                                    detail="This official business telephone is already registered to an existing account. Please use a different telephone number."
                                )
                # Check in business users
                cursor.execute("SELECT id, phone FROM users WHERE phone IS NOT NULL AND phone != '' AND role = 'recruiter'")
                for u_row in cursor.fetchall():
                    u_phone = u_row["phone"]
                    if u_phone and u_phone.strip():
                        if u_phone.strip() == official_tel or normalize_phone(u_phone.strip()) == norm_tel:
                            raise HTTPException(
                                status_code=400,
                                detail="This official business telephone is already registered to an existing account. Please use a different telephone number."
                            )

        # 3. Check representative email (person on behalf of business) uniqueness
        rep_email = (payload.representative_email or payload.email).strip().lower()
        cursor.execute("SELECT id FROM users WHERE LOWER(email) = ? AND role = 'recruiter'", (rep_email,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="A business user account with this email address is already open. Please log in or use a different work email."
            )
        cursor.execute("SELECT id FROM businesses WHERE LOWER(email) = ?", (rep_email,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="This email is registered as an official business email. Please use your personal work email."
            )

        is_valid_otp, otp_err = check_and_consume_otp(cursor, [payload.email, payload.phone, payload.official_email, payload.telephone], payload.otp_code, max_age_seconds=300, mark_consumed=True)
        if not is_valid_otp:
            conn.close()
            raise HTTPException(status_code=400, detail=otp_err)

        biz_id = f"biz_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
        mem_id = f"mem_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
        verif_id = f"verif_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
        user_id = f"user_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
        now = datetime.now().strftime("%Y-%m-%d %H:%M")

        feature_list = payload.features if isinstance(payload.features, list) else []
        dept_list = ["Front Office", "Food & Beverage", "Culinary", "Housekeeping", "Sales & Banquets", "Engineering"]
        benefits_list = ["Competitive Service Charge", "Duty Meals Included", "Staff Accommodation", "Health Insurance"]

        composite_addr = payload.address or f"Plot {payload.plot_number}, Road {payload.road_number}, {payload.thana_upazila}, {payload.district}"
        city_val = payload.district or payload.thana_upazila or "Dhaka"

        designation_val = payload.designation or "Authorized Representative"
        avatar = payload.avatar_url or DEFAULT_AVATAR_SVG
        secure_pwd_hash = hash_password(payload.password or "Password123!")

        # Insert representative user as Business Administrator
        cursor.execute("""
            INSERT INTO users (id, name, email, phone, password, role, avatar_url, created_at, dob, designation, status, is_business_admin, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """, (user_id, payload.representative_name, rep_email, payload.phone, secure_pwd_hash, "recruiter", avatar, now, payload.dob or "", designation_val, "active", 1))

        # Insert business
        cursor.execute("""
            INSERT INTO businesses (
                id, legal_name, brand_name, property_type, star_rating, city, address, country,
                website, email, logo_url, cover_image, description, verification_status,
                verification_notes, departments, amenities, benefits, follower_count,
                parent_group, property_size, plot_number, road_number, thana_upazila, district,
                features, admin_user_id, telephone, official_telephone, is_demo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """, (
            biz_id,
            payload.legal_name,
            payload.brand_name,
            payload.property_type,
            5,
            city_val,
            composite_addr,
            "Bangladesh",
            payload.website or "",
            official_email_clean,
            payload.logo_url or DEFAULT_HOTEL_LOGO_SVG,
            "/static/images/hero_lobby.jpg",
            f"{payload.property_type} property: {payload.brand_name}. Providing world-class hospitality services.",
            "pending",
            f"Awaiting Trust Desk verification for official business listing.",
            json.dumps(dept_list),
            json.dumps(feature_list),
            json.dumps(benefits_list),
            0,
            "",
            "150+ Luxury Rooms",
            payload.plot_number or "",
            payload.road_number or "",
            payload.thana_upazila or "",
            payload.district or "",
            json.dumps(feature_list),
            user_id,
            official_tel,
            official_tel
        ))

        # Check business membership
        cursor.execute("SELECT id FROM business_memberships WHERE business_id = ? AND user_id = ?", (biz_id, user_id))
        existing_mem = cursor.fetchone()
        if existing_mem:
            cursor.execute("""
                UPDATE business_memberships
                SET membership_role = 'admin', approval_status = 'approved', org_role = ?
                WHERE id = ?
            """, (designation_val, existing_mem["id"]))
        else:
            cursor.execute("""
                INSERT INTO business_memberships (id, business_id, user_id, org_role, created_at, membership_role, approval_status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (mem_id, biz_id, user_id, designation_val, now, "admin", "approved"))

        # Verification ticket
        cursor.execute("SELECT id FROM business_verifications WHERE business_id = ?", (biz_id,))
        existing_verif = cursor.fetchone()
        if not existing_verif:
            cursor.execute("""
                INSERT INTO business_verifications (
                    id, business_id, legal_doc_type, doc_number, submitted_by, submitted_at,
                    status, reviewed_at, reviewed_by, review_comments, issuing_authority
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                verif_id,
                biz_id,
                "Trade License",
                f"TRAD/REG/{int(datetime.now().timestamp())}",
                payload.representative_name,
                now,
                "pending",
                None,
                None,
                "Initial business registration verification ticket.",
                "City Licensing Authority"
            ))

        conn.commit()

        return {
            "success": True,
            "business_id": biz_id,
            "user_id": user_id,
            "verification_status": "pending",
            "whatsapp_contact": "+880 1819-876543",
            "email_contact": "trust@nicejobs.bd",
            "message": "We are notified and please wait for verification. If you have any query, our WhatsApp is +880 1819-876543 and Email is trust@nicejobs.bd"
        }
    finally:
        conn.close()


class RegisterBusinessUserPayload(BaseModel):
    # Route B: Add New User to Existing Business
    business_email: str
    name: str
    phone: str
    email: str # User email on behalf
    dob: Optional[str] = ""
    avatar_url: Optional[str] = None
    designation: str = "Assistant HR Manager"
    password: str = "Password123!"
    otp_code: str

@app.post("/api/auth/register-business-user")
def register_business_user(payload: RegisterBusinessUserPayload):
    conn = database.get_db()
    cursor = conn.cursor()

    # 1. Verify business exists by official business mail
    cursor.execute("SELECT * FROM businesses WHERE LOWER(email) = ?", (payload.business_email.strip().lower(),))
    biz = cursor.fetchone()
    if not biz:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail="This business is not yet in our directory, please create an account."
        )

    # 2. Verify OTP (5-minute TTL)
    is_valid_otp, otp_err = check_and_consume_otp(cursor, [payload.email, payload.phone], payload.otp_code, max_age_seconds=300, mark_consumed=True)
    if not is_valid_otp:
        conn.close()
        raise HTTPException(status_code=400, detail=otp_err)

    # 3. Check uniqueness of user email on behalf
    user_email_clean = payload.email.strip().lower()
    cursor.execute("SELECT id FROM users WHERE LOWER(email) = ? AND role = 'recruiter'", (user_email_clean,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="A business user account with this email address is already open. Please log in or use a different work email.")
    cursor.execute("SELECT id FROM businesses WHERE LOWER(email) = ?", (user_email_clean,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="This email is registered as an official business email. Please use your personal work email.")

    user_id = f"user_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
    mem_id = f"mem_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    secure_pwd_hash = hash_password(payload.password)

    # Insert user (Pending admin approval)
    cursor.execute("""
        INSERT INTO users (id, name, email, phone, password, role, avatar_url, created_at, dob, designation, status, is_business_admin, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    """, (user_id, payload.name, payload.email.strip().lower(), payload.phone, secure_pwd_hash, "recruiter", payload.avatar_url or DEFAULT_AVATAR_SVG, now, payload.dob or "", payload.designation or "Team Member", "pending_approval", 0))

    # Insert membership with 'pending_admin_approval'
    cursor.execute("""
        INSERT INTO business_memberships (id, business_id, user_id, org_role, created_at, membership_role, approval_status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (mem_id, biz["id"], user_id, payload.designation, now, "moderator", "pending_admin_approval"))

    # If business has an admin, send notification to admin
    if biz["admin_user_id"]:
        dispatch_realtime_notification(
            user_id=biz["admin_user_id"],
            title="Moderator Join Request",
            message=f"A moderator ({payload.name}, {payload.designation}) is trying to join as a moderator for {biz['brand_name']}. Do you approve or not?",
            notif_type="moderator_approval",
            link="#recruiter-dashboard",
            business_id=biz["id"],
            cursor=cursor
        )

    conn.commit()
    conn.close()

    return {
        "success": True,
        "user_id": user_id,
        "business_id": biz["id"],
        "approval_status": "pending_admin_approval",
        "message": f"Your moderator request has been submitted! The administrator for {biz['brand_name']} has been notified. You can use your account once the admin approves your request."
    }

class LoginPayload(BaseModel):
    identifier: Optional[str] = None # Candidate Email or Phone
    phone: Optional[str] = None
    email: Optional[str] = None
    user_email: Optional[str] = None
    business_email: Optional[str] = None
    password: Optional[str] = None
    otp_code: Optional[str] = None
    role: Optional[str] = None # 'jobseeker', 'recruiter', 'admin'

@app.post("/api/auth/login")
def login(payload: LoginPayload):
    conn = database.get_db()
    cursor = conn.cursor()

    # ---------------------------------------------------------
    # Route 1: Business Login (Part 1 Business Mail, Part 2 Person Mail + Password)
    # ---------------------------------------------------------
    if payload.role == "recruiter" or payload.business_email:
        biz_email = (payload.business_email or "").strip().lower()
        if not biz_email:
            conn.close()
            raise HTTPException(status_code=400, detail="Please provide the official business email address.")

        # Part 1: Verify if business is listed
        cursor.execute("SELECT * FROM businesses WHERE LOWER(email) = ?", (biz_email,))
        biz = cursor.fetchone()
        if not biz:
            conn.close()
            raise HTTPException(
                status_code=404,
                detail="This business doesn't have an account in our directory. Please register your hotel or establishment."
            )

        # Check business verification status immediately
        biz_verif = biz["verification_status"] or "pending"
        if biz_verif != "verified":
            conn.close()
            raise HTTPException(
                status_code=403,
                detail=f"Business account for '{biz['brand_name']}' is pending verification. You cannot log in or view workspace until your establishment is verified by administration."
            )

        # Part 2: Verify person on behalf of the business
        person_email = (payload.user_email or payload.email or payload.identifier or "").strip().lower()
        if not person_email:
            conn.close()
            raise HTTPException(status_code=400, detail="Please enter your personal work email on behalf of this business.")

        cursor.execute("SELECT * FROM users WHERE LOWER(email) = ? AND role = 'recruiter'", (person_email,))
        user = cursor.fetchone()
        if not user:
            # Check if this user only has a candidate account
            cursor.execute("SELECT * FROM users WHERE LOWER(email) = ? AND role = 'jobseeker'", (person_email,))
            cand_user = cursor.fetchone()
            conn.close()
            if cand_user:
                raise HTTPException(
                    status_code=403,
                    detail="This email is registered as a candidate account, not a business user. To access this business workspace, please register as a business representative or join this establishment."
                )
            raise HTTPException(
                status_code=404,
                detail="This user is not listed in this business account. Please join as a new user for this business."
            )

        # Check membership link
        cursor.execute("""
            SELECT * FROM business_memberships
            WHERE business_id = ? AND user_id = ?
            LIMIT 1
        """, (biz["id"], user["id"]))
        membership = cursor.fetchone()
        if not membership:
            conn.close()
            raise HTTPException(
                status_code=404,
                detail="This user is not listed in this business account. Please join as a new user for this business."
            )

        rate_key = f"biz_login_{user['id']}"
        check_public_rate_limit(rate_key, max_attempts=8, window_seconds=300)

        # Check password / OTP
        if payload.otp_code:
            u_email = (user["email"] or "").strip().lower()
            u_phone = (user["phone"] or "").strip()
            u_phone_norm = normalize_phone(u_phone) if u_phone else ""
            u_phone_prefix = f"+88{u_phone_norm}" if u_phone_norm else ""
            raw_ident = (payload.identifier or "").strip()
            raw_ident_norm = normalize_phone(raw_ident) if raw_ident else ""
            raw_ident_prefix = f"+88{raw_ident_norm}" if raw_ident_norm else ""

            id_set = {u_email, u_phone, u_phone_norm, u_phone_prefix, raw_ident, raw_ident_norm, raw_ident_prefix}
            id_set.discard("")
            id_set.discard(None)

            is_valid_otp, otp_err = check_and_consume_otp(cursor, list(id_set), payload.otp_code, max_age_seconds=300, mark_consumed=True)
            if not is_valid_otp:
                record_public_rate_failure(rate_key)
                conn.close()
                raise HTTPException(status_code=401, detail=otp_err)
        elif payload.password:
            stored_pwd = user["password"] or ""
            if not verify_password(payload.password, stored_pwd):
                record_public_rate_failure(rate_key)
                conn.close()
                raise HTTPException(status_code=401, detail="Incorrect password. Please try again.")
            # Transparently upgrade legacy plaintext to bcrypt
            if not stored_pwd.startswith("$2b$") and not stored_pwd.startswith("$2a$"):
                try:
                    cursor.execute("UPDATE users SET password = ? WHERE id = ?", (hash_password(payload.password), user["id"]))
                except Exception:
                    pass

        reset_public_rate_limit(rate_key)

        # Check approval status
        mem_status = membership["approval_status"] or "approved"
        if mem_status == "pending_admin_approval":
            conn.close()
            raise HTTPException(
                status_code=403,
                detail="Your account is waiting for Business Admin approval. You cannot access the workspace until approved."
            )
        elif mem_status == "rejected":
            conn.close()
            raise HTTPException(
                status_code=403,
                detail="Your moderator access request was declined by the business administrator."
            )

        if user["status"] == "suspended":
            conn.close()
            raise HTTPException(status_code=403, detail="Your account has been suspended by NiceJobs Trust & Safety.")

        # Default admin for the person who is signing in on behalf of the business
        cursor.execute("UPDATE users SET is_business_admin = 1 WHERE id = ?", (user["id"],))
        cursor.execute(
            "UPDATE business_memberships SET membership_role = 'admin', approval_status = 'approved' WHERE business_id = ? AND user_id = ?",
            (biz["id"], user["id"])
        )
        conn.commit()

        biz_info = dict(biz)
        biz_info["org_role"] = membership["org_role"]
        biz_info["membership_role"] = "admin"
        biz_info["is_business_admin"] = True

        conn.close()
        return {
            "success": True,
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "phone": user["phone"],
                "role": "recruiter",
                "business_id": biz["id"],
                "avatar": user["avatar_url"],
                "designation": user["designation"] or membership["org_role"],
                "is_business_admin": True,
                "can_post_blog": bool(user["can_post_blog"] or user["role"] == "admin")
            },
            "business": biz_info,
            "profile": None,
            "message": f"Welcome back, {user['name']}! Accessing {biz['brand_name']} workspace as Business Administrator."
        }

    # ---------------------------------------------------------
    # Route 2: Candidate / General Login (Email & Password)
    # ---------------------------------------------------------
    email_input = (payload.email or payload.identifier or "").strip().lower()
    phone_input = (payload.phone or "").strip()
    norm_phone = normalize_phone(phone_input or email_input)

    target_role = (payload.role or "").strip().lower()

    cursor.execute("SELECT * FROM users")
    all_users = cursor.fetchall()

    candidate_user = None
    recruiter_user = None
    admin_user = None

    for u in all_users:
        u_email = (u["email"] or "").lower()
        u_norm_p = normalize_phone(u["phone"])
        matches = False
        if email_input and u_email == email_input:
            matches = True
        elif norm_phone and u_norm_p == norm_phone:
            matches = True

        if matches:
            if u["role"] == "jobseeker":
                candidate_user = u
            elif u["role"] == "recruiter":
                recruiter_user = u
            elif u["role"] == "admin":
                admin_user = u

    # Role resolution & strict enforcement:
    # A business user cannot log in as a candidate with their business user credentials.
    # They will need a new candidate account to log in as a candidate.
    user = None
    if target_role == "jobseeker" or not target_role:
        if candidate_user:
            user = candidate_user
        elif recruiter_user:
            conn.close()
            raise HTTPException(
                status_code=403,
                detail="This email is registered as a business account, not a candidate account. A business user cannot log in as a candidate with their business user credentials. Please create a new candidate account to log in as a candidate."
            )
        elif admin_user and target_role != "jobseeker":
            user = admin_user
        else:
            conn.close()
            raise HTTPException(
                status_code=401,
                detail=f"No candidate account found matching '{email_input or phone_input}'. Please check your credentials or create a new candidate account."
            )
    elif target_role == "recruiter":
        if recruiter_user:
            user = recruiter_user
        elif candidate_user:
            conn.close()
            raise HTTPException(
                status_code=403,
                detail="This email is registered as a candidate account, not a business account. Please use candidate login or register a business account."
            )
        else:
            conn.close()
            raise HTTPException(
                status_code=401,
                detail=f"No business account found matching '{email_input or phone_input}'."
            )
    elif target_role == "admin":
        if admin_user:
            user = admin_user
        else:
            conn.close()
            raise HTTPException(status_code=401, detail="No administrator account found.")
    else:
        user = candidate_user or recruiter_user or admin_user
        if not user:
            conn.close()
            raise HTTPException(
                status_code=401,
                detail=f"No account found matching '{email_input or phone_input}'."
            )

    if user["status"] == "suspended":
        conn.close()
        raise HTTPException(status_code=403, detail="Your account has been suspended by NiceJobs Trust & Safety. Contact support@nicejobs.bd.")

    rate_key = f"user_login_{user['id']}"
    check_public_rate_limit(rate_key, max_attempts=8, window_seconds=300)

    # OTP or Password
    if payload.otp_code:
        u_email = (user["email"] or "").strip().lower()
        u_phone = (user["phone"] or "").strip()
        u_phone_norm = normalize_phone(u_phone) if u_phone else ""
        u_phone_prefix = f"+88{u_phone_norm}" if u_phone_norm else ""
        raw_ident = (payload.identifier or "").strip()
        raw_ident_norm = normalize_phone(raw_ident) if raw_ident else ""
        raw_ident_prefix = f"+88{raw_ident_norm}" if raw_ident_norm else ""

        id_set = {u_email, u_phone, u_phone_norm, u_phone_prefix, raw_ident, raw_ident_norm, raw_ident_prefix}
        id_set.discard("")
        id_set.discard(None)

        is_valid_otp, otp_err = check_and_consume_otp(cursor, list(id_set), payload.otp_code, max_age_seconds=300, mark_consumed=True)
        if not is_valid_otp:
            record_public_rate_failure(rate_key)
            conn.close()
            raise HTTPException(status_code=401, detail=otp_err)
    elif payload.password:
        stored_pwd = user["password"] or ""
        if not verify_password(payload.password, stored_pwd):
            record_public_rate_failure(rate_key)
            conn.close()
            raise HTTPException(status_code=401, detail="Incorrect password. Please try again.")
        # Transparently upgrade legacy plaintext to bcrypt
        if not stored_pwd.startswith("$2b$") and not stored_pwd.startswith("$2a$"):
            try:
                cursor.execute("UPDATE users SET password = ? WHERE id = ?", (hash_password(payload.password), user["id"]))
            except Exception:
                pass

    reset_public_rate_limit(rate_key)

    business_info = None
    if user["role"] == "recruiter":
        cursor.execute("""
            SELECT b.*, bm.org_role, bm.membership_role, bm.approval_status
            FROM business_memberships bm
            JOIN businesses b ON bm.business_id = b.id
            WHERE bm.user_id = ?
            LIMIT 1
        """, (user["id"],))
        b_row = cursor.fetchone()
        if b_row:
            if (b_row["verification_status"] or "pending") != "verified":
                conn.close()
                raise HTTPException(
                    status_code=403,
                    detail=f"Business account for '{b_row['brand_name']}' is pending verification. You cannot log in or view workspace until your establishment is verified by administration."
                )
            if b_row["approval_status"] == "pending_admin_approval":
                conn.close()
                raise HTTPException(
                    status_code=403,
                    detail="Your account is waiting for Business Admin approval. You cannot access the workspace until approved."
                )
            business_info = dict(b_row)

    profile_info = None
    if user["role"] == "jobseeker":
        cursor.execute("SELECT * FROM employee_profiles WHERE user_id = ?", (user["id"],))
        p_row = cursor.fetchone()
        if p_row:
            profile_info = dict(p_row)
            for f in ["skills", "languages", "certifications", "experience", "education", "preferences", "cv_list"]:
                if profile_info.get(f):
                    try:
                        profile_info[f] = json.loads(profile_info[f])
                    except Exception:
                        pass

    conn.close()
    return {
        "success": True,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "phone": user["phone"],
            "role": user["role"],
            "avatar": user["avatar_url"],
            "designation": user["designation"],
            "can_post_blog": bool(user["can_post_blog"] or user["role"] == "admin")
        },
        "business": business_info,
        "profile": profile_info,
        "message": f"Welcome back, {user['name']}!"
    }

# =======================
# EMPLOYEE PROFILE & CVS
# =======================

@app.get("/api/profile")
def get_profile(user_id: str = "user_rahim"):
    conn = database.get_db()
    cursor = conn.cursor()

    if is_demo_hidden() and user_id in ["user_rahim", "user_fatima"]:
        conn.close()
        raise HTTPException(status_code=404, detail="Demo profile is hidden because demo data has been removed.")

    cursor.execute("""
        SELECT p.*,
               u.name, u.email, u.phone, u.avatar_url, u.designation, u.role as user_role, u.can_post_blog,
               COALESCE(NULLIF(p.first_name, ''), u.first_name, '') as first_name,
               COALESCE(NULLIF(p.middle_name, ''), u.middle_name, '') as middle_name,
               COALESCE(NULLIF(p.last_name, ''), u.last_name, '') as last_name,
               COALESCE(NULLIF(p.name_bangla, ''), u.name_bangla, '') as name_bangla
        FROM users u
        LEFT JOIN employee_profiles p ON u.id = p.user_id
        WHERE u.id = ?
    """, (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    profile = dict(row)
    for field in ["skills", "languages", "certifications", "experience", "education", "cv_list"]:
        profile[field] = json.loads(profile[field]) if profile.get(field) else []
    profile["preferences"] = json.loads(profile["preferences"]) if profile.get("preferences") else {}
    profile["can_post_blog"] = bool(row["can_post_blog"] or row.get("user_role") == "admin")

    conn.close()
    return profile

class ProfileUpdatePayload(BaseModel):
    user_id: str = "user_rahim"
    name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    name_bangla: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    designation: Optional[str] = None
    otp_code: Optional[str] = None
    headline: Optional[str] = None
    location: Optional[str] = None
    summary: Optional[str] = None
    current_position: Optional[str] = None
    experience_years: Optional[int] = None
    open_to_work: Optional[bool] = None
    visibility: Optional[str] = None
    skills: Optional[List[str]] = None
    languages: Optional[List[Dict[str, Any]]] = None
    certifications: Optional[List[Dict[str, Any]]] = None
    experience: Optional[List[Dict[str, Any]]] = None
    education: Optional[List[Dict[str, Any]]] = None
    preferences: Optional[Dict[str, Any]] = None
    cv_list: Optional[List[Dict[str, Any]]] = None
    cv_name: Optional[str] = None
    cv_url: Optional[str] = None

@app.put("/api/profile")
@app.post("/api/profile")
@app.post("/api/profile/edit")
@app.put("/api/profile/edit")
def update_profile(payload: ProfileUpdatePayload, user_id: Optional[str] = None):
    effective_user_id = user_id or payload.user_id or "user_rahim"
    conn = database.get_db()
    cursor = conn.cursor()

    # Rule: only when email and phone number is edited it requires OTP
    cursor.execute("SELECT email, phone, name FROM users WHERE id = ?", (effective_user_id,))
    user_row = cursor.fetchone()
    if not user_row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    email_changed = payload.email and payload.email.strip().lower() != user_row["email"].strip().lower()
    phone_changed = payload.phone and payload.phone.strip() != user_row["phone"].strip()

    if email_changed or phone_changed:
        target = payload.phone.strip() if phone_changed else payload.email.strip().lower()
        if not payload.otp_code:
            conn.close()
            return JSONResponse(
                status_code=400,
                content={
                    "requires_otp": True,
                    "target": target,
                    "detail": f"Updating phone number or email address requires security OTP verification. Please verify the code sent to {target}."
                }
            )
        # Verify OTP (5-minute TTL)
        is_valid_otp, otp_err = check_and_consume_otp(cursor, [target], payload.otp_code, max_age_seconds=300, mark_consumed=True)
        if not is_valid_otp:
            conn.close()
            raise HTTPException(status_code=400, detail=otp_err)

        if email_changed:
            cursor.execute("UPDATE users SET email = ? WHERE id = ?", (payload.email.strip().lower(), effective_user_id))
        if phone_changed:
            cursor.execute("UPDATE users SET phone = ? WHERE id = ?", (payload.phone.strip(), effective_user_id))

    if payload.avatar_url is not None:
        cursor.execute("UPDATE users SET avatar_url = ? WHERE id = ?", (payload.avatar_url, effective_user_id))

    if payload.first_name is not None or payload.middle_name is not None or payload.last_name is not None:
        fn = payload.first_name if payload.first_name is not None else ""
        mn = payload.middle_name if payload.middle_name is not None else ""
        ln = payload.last_name if payload.last_name is not None else ""
        parts = [p for p in [fn, mn, ln] if p.strip()]
        comp_name = " ".join(parts).strip() if parts else (payload.name or user_row["name"])
        cursor.execute("UPDATE users SET name = ?, first_name = ?, middle_name = ?, last_name = ? WHERE id = ?", (comp_name, fn, mn, ln, effective_user_id))
        cursor.execute("UPDATE employee_profiles SET first_name = ?, middle_name = ?, last_name = ? WHERE user_id = ?", (fn, mn, ln, effective_user_id))
    elif payload.name:
        cursor.execute("UPDATE users SET name = ? WHERE id = ?", (payload.name, effective_user_id))

    if payload.name_bangla is not None:
        cursor.execute("UPDATE users SET name_bangla = ? WHERE id = ?", (payload.name_bangla, effective_user_id))
        cursor.execute("UPDATE employee_profiles SET name_bangla = ? WHERE user_id = ?", (payload.name_bangla, effective_user_id))

    if payload.designation is not None:
        cursor.execute("UPDATE users SET designation = ? WHERE id = ?", (payload.designation, effective_user_id))
        cursor.execute("UPDATE business_memberships SET org_role = ? WHERE user_id = ?", (payload.designation, effective_user_id))

    updates = []
    params = []
    if payload.headline is not None:
        updates.append("headline = ?")
        params.append(payload.headline)
    if payload.location is not None:
        updates.append("location = ?")
        params.append(payload.location)
    if payload.summary is not None:
        updates.append("summary = ?")
        params.append(payload.summary)
    if payload.current_position is not None:
        updates.append("current_position = ?")
        params.append(payload.current_position)
    if payload.experience_years is not None:
        updates.append("experience_years = ?")
        params.append(payload.experience_years)
    if payload.open_to_work is not None:
        updates.append("open_to_work = ?")
        params.append(1 if payload.open_to_work else 0)
    if payload.visibility is not None:
        updates.append("visibility = ?")
        params.append(payload.visibility)
    if payload.skills is not None:
        updates.append("skills = ?")
        params.append(json.dumps(payload.skills))
    if payload.languages is not None:
        updates.append("languages = ?")
        params.append(json.dumps(payload.languages))
    if payload.certifications is not None:
        updates.append("certifications = ?")
        params.append(json.dumps(payload.certifications))
    if payload.experience is not None:
        updates.append("experience = ?")
        params.append(json.dumps(payload.experience))
    if payload.education is not None:
        updates.append("education = ?")
        params.append(json.dumps(payload.education))
    if payload.preferences is not None:
        updates.append("preferences = ?")
        params.append(json.dumps(payload.preferences))
    if payload.cv_list is not None:
        updates.append("cv_list = ?")
        params.append(json.dumps(payload.cv_list))
    if payload.cv_name is not None:
        updates.append("cv_name = ?")
        params.append(payload.cv_name)
    if payload.cv_url is not None:
        updates.append("cv_url = ?")
        params.append(payload.cv_url)

    if updates:
        params.append(effective_user_id)
        cursor.execute(f"UPDATE employee_profiles SET {', '.join(updates)} WHERE user_id = ?", params)

    conn.commit()
    conn.close()

    notify_realtime(
        "profile_updated",
        {"user_id": effective_user_id},
        target_user=effective_user_id
    )

    return {"success": True, "message": "Career profile updated successfully."}

class CvCreatePayload(BaseModel):
    user_id: Optional[str] = None
    title: str
    name: str
    size: str = "220 KB"
    is_default: bool = False
    file_data: Optional[str] = None

@app.get("/api/profile/cvs")
def get_profile_cvs(user_id: str = "user_rahim"):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT cv_list FROM employee_profiles WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    cv_list = json.loads(row["cv_list"]) if row and row["cv_list"] else []
    conn.close()
    return {"success": True, "cvs": cv_list, "cv_list": cv_list}

@app.post("/api/profile/cvs")
def add_profile_cv(payload: CvCreatePayload, user_id: Optional[str] = None):
    effective_user_id = user_id or payload.user_id
    if not effective_user_id:
        raise HTTPException(status_code=400, detail="Missing user_id for CV upload")

    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE id = ?", (effective_user_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="User account not found. Please log in.")

    cursor.execute("SELECT cv_list FROM employee_profiles WHERE user_id = ?", (effective_user_id,))
    row = cursor.fetchone()
    cv_list = json.loads(row["cv_list"]) if row and row["cv_list"] else []

    new_cv = {
        "id": f"cv_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}",
        "title": payload.title or payload.name,
        "name": payload.name,
        "uploaded_at": datetime.now().strftime("%Y-%m-%d"),
        "size": payload.size or "250 KB",
        "is_default": payload.is_default or len(cv_list) == 0,
        "file_data": payload.file_data
    }
    if new_cv["is_default"]:
        for c in cv_list:
            c["is_default"] = False
    cv_list.append(new_cv)

    if row is not None:
        cursor.execute("""
            UPDATE employee_profiles 
            SET cv_list = ?, 
                cv_name = ?, 
                cv_url = CASE WHEN ? != '' THEN ? ELSE cv_url END 
            WHERE user_id = ?
        """, (json.dumps(cv_list), payload.name, payload.file_data or "", payload.file_data or "", effective_user_id))
    else:
        cursor.execute("INSERT INTO employee_profiles (user_id, cv_list, cv_name, cv_url) VALUES (?, ?, ?, ?)", 
                       (effective_user_id, json.dumps(cv_list), payload.name, payload.file_data or ""))

    conn.commit()
    conn.close()
    notify_realtime("cv_updated", {"user_id": effective_user_id}, target_user=effective_user_id)
    return {"success": True, "cv": new_cv, "cv_list": cv_list}

@app.delete("/api/profile/cvs/{cv_id}")
def delete_profile_cv(cv_id: str, user_id: Optional[str] = None):
    effective_user_id = user_id or "user_rahim"
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT cv_list FROM employee_profiles WHERE user_id = ?", (effective_user_id,))
    row = cursor.fetchone()
    cv_list = json.loads(row["cv_list"]) if row and row["cv_list"] else []
    cv_list = [c for c in cv_list if c["id"] != cv_id]
    cursor.execute("UPDATE employee_profiles SET cv_list = ? WHERE user_id = ?", (json.dumps(cv_list), effective_user_id))
    conn.commit()
    conn.close()
    notify_realtime("cv_updated", {"user_id": effective_user_id}, target_user=effective_user_id)
    return {"success": True, "cv_list": cv_list}

@app.patch("/api/profile/cvs/{cv_id}/default")
def set_default_cv(cv_id: str, user_id: Optional[str] = None):
    effective_user_id = user_id or "user_rahim"
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT cv_list FROM employee_profiles WHERE user_id = ?", (effective_user_id,))
    row = cursor.fetchone()
    cv_list = json.loads(row["cv_list"]) if row and row["cv_list"] else []
    for c in cv_list:
        c["is_default"] = (c["id"] == cv_id)
    def_cv = next((c for c in cv_list if c["id"] == cv_id), None)
    if def_cv:
        def_file = def_cv.get("file_data") or ""
        cursor.execute("""
            UPDATE employee_profiles 
            SET cv_list = ?, 
                cv_name = ?, 
                cv_url = CASE WHEN ? != '' THEN ? ELSE cv_url END 
            WHERE user_id = ?
        """, (json.dumps(cv_list), def_cv.get("name", ""), def_file, def_file, effective_user_id))
    else:
        cursor.execute("UPDATE employee_profiles SET cv_list = ? WHERE user_id = ?", (json.dumps(cv_list), effective_user_id))
    conn.commit()
    conn.close()
    notify_realtime("cv_updated", {"user_id": effective_user_id}, target_user=effective_user_id)
    return {"success": True, "cv_list": cv_list}

@app.get("/api/applications/{app_id}/cv")
def get_application_cv(app_id: str, viewer_role: Optional[str] = "guest", viewer_id: Optional[str] = None, business_id: Optional[str] = None):
    conn = database.get_db()
    cursor = conn.cursor()
    effective_vid = viewer_id if viewer_id else ""
    cursor.execute("""
        SELECT a.id, a.user_id, a.selected_cv, a.selected_cv_url, a.cover_letter, a.applied_at, a.status,
               j.title as job_title, j.business_id,
               b.brand_name, b.verification_status,
               u.name as candidate_name, u.email as candidate_email, u.phone as candidate_phone,
               ep.headline, ep.summary, ep.skills, ep.experience, ep.education, ep.certifications, ep.languages,
               ep.cv_url, ep.cv_list,
               (bm.id IS NOT NULL) as is_bm_member
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN businesses b ON j.business_id = b.id
        JOIN users u ON a.user_id = u.id
        LEFT JOIN employee_profiles ep ON u.id = ep.user_id
        LEFT JOIN business_memberships bm ON (j.business_id = bm.business_id AND bm.user_id = ?)
        WHERE a.id = ?
    """, (effective_vid, app_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Application record not found")

    data = dict(row)

    # Resolve attached CV file data
    cv_url = data.get("selected_cv_url") or ""
    if not cv_url:
        cv_list = json.loads(data["cv_list"]) if data.get("cv_list") else []
        match_cv = next((c for c in cv_list if c.get("name") == data.get("selected_cv") or c.get("title") == data.get("selected_cv")), None)
        if match_cv and match_cv.get("file_data"):
            cv_url = match_cv["file_data"]
        elif data.get("cv_url"):
            cv_url = data["cv_url"]
        elif cv_list and cv_list[0].get("file_data"):
            cv_url = cv_list[0]["file_data"]

    data["selected_cv_url"] = cv_url
    data["cv_url"] = cv_url

    # Permission check: Candidate cv will ONLY be visible to the jobs/businesses that he has applied for
    is_admin = viewer_role == "admin"
    is_applicant = viewer_id and viewer_id == data["user_id"]
    is_business_member = bool(data.get("is_bm_member")) or (business_id and business_id == data["business_id"])

    if not (is_admin or is_applicant or is_business_member):
        conn.close()
        raise HTTPException(
            status_code=403,
            detail="Candidate CV is strictly confidential and only viewable by authorized recruiters for vacancies the candidate has applied to."
        )

    for field in ["skills", "experience", "education", "certifications", "languages"]:
        data[field] = json.loads(data[field]) if data.get(field) else []

    conn.close()
    return data

def extract_binary_from_data_url(data_str: str, filename: str = "document.pdf") -> tuple:
    lower_fn = (filename or "").lower()
    default_mime = "application/pdf"
    if lower_fn.endswith(".docx"):
        default_mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif lower_fn.endswith(".doc"):
        default_mime = "application/msword"
    elif lower_fn.endswith(".png"):
        default_mime = "image/png"
    elif lower_fn.endswith(".jpg") or lower_fn.endswith(".jpeg"):
        default_mime = "image/jpeg"

    if not data_str:
        return b"", default_mime

    if ";base64," in data_str:
        header, b64 = data_str.split(";base64,", 1)
        mime = header.replace("data:", "").strip() or default_mime
        clean_b64 = re.sub(r"[\s\r\n]+", "", b64)
        try:
            raw_bytes = base64.b64decode(clean_b64)
            return raw_bytes, mime
        except Exception:
            return b"", default_mime
    elif data_str.startswith("data:"):
        header, payload = data_str.split(",", 1)
        mime = header.replace("data:", "").strip() or default_mime
        return payload.encode("utf-8"), mime
    else:
        try:
            clean_b64 = re.sub(r"[\s\r\n]+", "", data_str)
            raw_bytes = base64.b64decode(clean_b64)
            return raw_bytes, default_mime
        except Exception:
            return data_str.encode("utf-8"), default_mime

@app.get("/api/profile/cv-file")
def get_profile_cv_file(user_id: str, cv_id: Optional[str] = None, cv_name: Optional[str] = None, download: Optional[int] = 0):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT cv_url, cv_list, cv_name FROM employee_profiles WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Candidate profile not found")

    cv_list = json.loads(row["cv_list"]) if row["cv_list"] else []
    filename = cv_name or row["cv_name"] or "Candidate_CV.pdf"
    raw_data = ""

    if cv_id:
        match_cv = next((c for c in cv_list if c.get("id") == cv_id), None)
        if match_cv:
            raw_data = match_cv.get("file_data") or ""
            filename = match_cv.get("name") or filename

    if not raw_data and cv_name:
        match_cv = next((c for c in cv_list if c.get("name") == cv_name or c.get("title") == cv_name), None)
        if match_cv:
            raw_data = match_cv.get("file_data") or ""
            filename = match_cv.get("name") or filename

    if not raw_data:
        if row["cv_url"]:
            raw_data = row["cv_url"]
        elif cv_list and cv_list[0].get("file_data"):
            raw_data = cv_list[0]["file_data"]
            filename = cv_list[0].get("name") or filename

    if not raw_data:
        raise HTTPException(status_code=404, detail="No CV document was uploaded for this candidate.")

    binary_bytes, media_type = extract_binary_from_data_url(raw_data, filename)
    if not binary_bytes:
        raise HTTPException(status_code=404, detail="CV document data is empty.")

    disposition = "attachment" if download else "inline"
    safe_filename = filename.replace('"', '').replace('\n', '').replace('\r', '')
    return Response(
        content=binary_bytes,
        media_type=media_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{safe_filename}"',
            "Cache-Control": "public, max-age=3600"
        }
    )

@app.get("/api/applications/{app_id}/cv-file")
def get_application_cv_file(app_id: str, download: Optional[int] = 0, viewer_role: Optional[str] = None, viewer_id: Optional[str] = None, business_id: Optional[str] = None):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.id, a.user_id, a.selected_cv, a.selected_cv_url,
               j.business_id,
               ep.cv_url, ep.cv_list, ep.cv_name,
               (bm.id IS NOT NULL) as is_bm_member
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN users u ON a.user_id = u.id
        LEFT JOIN employee_profiles ep ON u.id = ep.user_id
        LEFT JOIN business_memberships bm ON (j.business_id = bm.business_id AND bm.user_id = ?)
        WHERE a.id = ?
    """, (viewer_id or "", app_id))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Application record not found")

    data = dict(row)
    filename = data.get("selected_cv") or data.get("cv_name") or "Candidate_CV.pdf"
    raw_data = data.get("selected_cv_url") or ""

    if not raw_data:
        cv_list = json.loads(data["cv_list"]) if data.get("cv_list") else []
        match_cv = next((c for c in cv_list if c.get("name") == filename or c.get("title") == filename), None)
        if match_cv and match_cv.get("file_data"):
            raw_data = match_cv["file_data"]
            filename = match_cv.get("name") or filename
        elif data.get("cv_url"):
            raw_data = data["cv_url"]
        elif cv_list and cv_list[0].get("file_data"):
            raw_data = cv_list[0]["file_data"]
            filename = cv_list[0].get("name") or filename

    if not raw_data:
        raise HTTPException(status_code=404, detail="No CV document was uploaded for this application.")

    binary_bytes, media_type = extract_binary_from_data_url(raw_data, filename)
    if not binary_bytes:
        raise HTTPException(status_code=404, detail="Application CV document data is empty.")

    disposition = "attachment" if download else "inline"
    safe_filename = filename.replace('"', '').replace('\n', '').replace('\r', '')
    return Response(
        content=binary_bytes,
        media_type=media_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{safe_filename}"',
            "Cache-Control": "public, max-age=3600"
        }
    )

# =======================
# APPLICATIONS & ATS
# =======================

@app.get("/api/applications/{app_id}")
def get_application_by_id(app_id: str):
    conn = database.get_db()
    cursor = conn.cursor()
    query = """
        SELECT a.*, 
               j.title as job_title, j.department, j.property_location, j.salary_min, j.salary_max, j.currency,
               b.id as business_id, b.brand_name, b.logo_url, b.property_type,
               u.name as candidate_name, u.email as candidate_email, u.phone as candidate_phone, u.avatar_url as candidate_avatar,
               ep.headline as candidate_headline, ep.experience_years as candidate_exp_years, ep.skills as candidate_skills,
               ep.education as candidate_education, ep.experience as candidate_experience, ep.location as candidate_location,
               ep.open_to_work as candidate_open_to_work, ep.summary as candidate_summary
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN businesses b ON j.business_id = b.id
        JOIN users u ON a.user_id = u.id
        LEFT JOIN employee_profiles ep ON u.id = ep.user_id
        WHERE a.id = ?
    """
    row = cursor.execute(query, (app_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")
    
    app_dict = dict(row)
    for col in ["candidate_skills", "candidate_education", "candidate_experience", "screening_answers"]:
        if app_dict.get(col) and isinstance(app_dict[col], str):
            try:
                app_dict[col] = json.loads(app_dict[col])
            except Exception:
                pass
    return app_dict

@app.get("/api/applications")
def get_applications(
    user_id: Optional[str] = None,
    business_id: Optional[str] = None,
    job_id: Optional[str] = None,
    status: Optional[str] = None
):
    conn = database.get_db()
    cursor = conn.cursor()

    query = """
        SELECT a.*, 
               j.title as job_title, j.department, j.property_location, j.salary_min, j.salary_max, j.currency,
               b.id as business_id, b.brand_name, b.logo_url, b.property_type,
               u.name as candidate_name, u.email as candidate_email, u.phone as candidate_phone, u.avatar_url as candidate_avatar,
               ep.headline as candidate_headline, ep.experience_years as candidate_exp_years, ep.skills as candidate_skills,
               ep.education as candidate_education, ep.experience as candidate_experience, ep.location as candidate_location,
               ep.open_to_work as candidate_open_to_work, ep.summary as candidate_summary,
               ae.id as event_id, ae.status as event_status, ae.actor_name as event_actor_name, ae.note as event_note, ae.timestamp as event_timestamp
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN businesses b ON j.business_id = b.id
        JOIN users u ON a.user_id = u.id
        LEFT JOIN employee_profiles ep ON u.id = ep.user_id
        LEFT JOIN application_events ae ON a.id = ae.application_id
        WHERE 1=1
    """
    params = []

    if is_demo_hidden():
        query += " AND (a.is_demo = 0 OR a.is_demo IS NULL)"

    if user_id:
        query += " AND a.user_id = ?"
        params.append(user_id)

    if business_id:
        chk_b = cursor.execute("SELECT verification_status FROM businesses WHERE id = ?", (business_id,)).fetchone()
        if chk_b and (chk_b["verification_status"] or "pending") != "verified":
            conn.close()
            return []
        query += " AND j.business_id = ?"
        params.append(business_id)

    if job_id:
        query += " AND a.job_id = ?"
        params.append(job_id)

    if status and status != "all":
        query += " AND a.status = ?"
        params.append(status)

    query += " ORDER BY a.updated_at DESC, ae.id ASC"

    cursor.execute(query, params)
    rows = cursor.fetchall()

    results = []
    app_map = {}
    for r in rows:
        app_id = r["id"]
        if app_id not in app_map:
            d = dict(r)
            # Remove joined event fields from the top-level application dict
            for ev_k in ["event_id", "event_status", "event_actor_name", "event_note", "event_timestamp"]:
                d.pop(ev_k, None)

            d["screening_answers"] = json.loads(d["screening_answers"]) if d["screening_answers"] else {}
            d["candidate_skills"] = json.loads(d["candidate_skills"]) if d.get("candidate_skills") else []
            d["candidate_education"] = json.loads(d["candidate_education"]) if d.get("candidate_education") else []
            d["candidate_experience"] = json.loads(d["candidate_experience"]) if d.get("candidate_experience") else []
            d["timeline"] = []
            app_map[app_id] = d
            results.append(d)

        if r.get("event_id"):
            app_map[app_id]["timeline"].append({
                "id": r["event_id"],
                "application_id": app_id,
                "status": r["event_status"],
                "actor_name": r["event_actor_name"],
                "note": r["event_note"],
                "timestamp": r["event_timestamp"]
            })

    conn.close()
    return results

class ApplicationSubmitPayload(BaseModel):
    job_id: str
    user_id: str = "user_rahim"
    cover_letter: Optional[str] = ""
    selected_cv: str = "Rahim_Ahmed_Executive_Hospitality_CV.pdf"
    selected_cv_url: Optional[str] = None
    screening_answers: Optional[Dict[str, Any]] = None

@app.post("/api/applications")
def submit_application(payload: ApplicationSubmitPayload):
    conn = database.get_db()
    cursor = conn.cursor()

    # Check if already applied
    cursor.execute("SELECT id FROM applications WHERE job_id = ? AND user_id = ?", (payload.job_id, payload.user_id))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="You have already submitted an application for this vacancy.")

    app_id = f"app_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Resolve CV file data to save directly in the application record
    selected_cv_url = (payload.selected_cv_url or "").strip()
    if not selected_cv_url:
        cursor.execute("SELECT cv_url, cv_list FROM employee_profiles WHERE user_id = ?", (payload.user_id,))
        cand_prof = cursor.fetchone()
        if cand_prof:
            cand_cvs = json.loads(cand_prof["cv_list"]) if cand_prof["cv_list"] else []
            match_cv = next((c for c in cand_cvs if c.get("name") == payload.selected_cv or c.get("title") == payload.selected_cv), None)
            if match_cv and match_cv.get("file_data"):
                selected_cv_url = match_cv["file_data"]
            elif cand_prof["cv_url"]:
                selected_cv_url = cand_prof["cv_url"]
            elif cand_cvs and cand_cvs[0].get("file_data"):
                selected_cv_url = cand_cvs[0]["file_data"]

    cursor.execute("""
        INSERT INTO applications (
            id, job_id, user_id, status, applied_at, updated_at,
            cover_letter, selected_cv, selected_cv_url, screening_answers, recruiter_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        app_id,
        payload.job_id,
        payload.user_id,
        "submitted",
        now,
        now,
        payload.cover_letter,
        payload.selected_cv,
        selected_cv_url,
        json.dumps(payload.screening_answers or {}),
        ""
    ))

    # Add first event in timeline
    cursor.execute("""
        INSERT INTO application_events (application_id, status, actor_name, note, timestamp)
        VALUES (?, ?, ?, ?, ?)
    """, (app_id, "submitted", "Candidate", "Application submitted via NiceJobs online portal.", now))

    # Increment job applicant count
    cursor.execute("UPDATE jobs SET applicant_count = applicant_count + 1 WHERE id = ?", (payload.job_id,))

    # Trigger notification and send business email
    cursor.execute("""
        SELECT j.title, j.business_id, b.brand_name, b.email AS business_email, 
               u.name AS candidate_name, u.email AS candidate_email, u.phone AS candidate_phone
        FROM jobs j
        JOIN businesses b ON j.business_id = b.id
        JOIN users u ON u.id = ?
        WHERE j.id = ?
    """, (payload.user_id, payload.job_id))
    job_info = cursor.fetchone()

    if job_info:
        # In-app notification to candidate
        dispatch_realtime_notification(
            user_id=payload.user_id,
            title="Application Received!",
            message=f"Your application for {job_info['title']} has been delivered to the {job_info['brand_name']} hiring team.",
            notif_type="application",
            link="#applications",
            cursor=cursor
        )

        # Notify business admin/recruiter if exists
        cursor.execute("SELECT admin_user_id FROM businesses WHERE id = ?", (job_info["business_id"],))
        biz_owner = cursor.fetchone()
        if biz_owner and biz_owner["admin_user_id"]:
            dispatch_realtime_notification(
                user_id=biz_owner["admin_user_id"],
                title="New Applicant Received",
                message=f"{job_info['candidate_name']} applied for {job_info['title']}",
                notif_type="application",
                link="#ats",
                business_id=job_info["business_id"],
                cursor=cursor
            )

        # Email notification sent to the business official address
        biz_email = job_info["business_email"] or "hr@radissonbd.com"
        subject = f"New Candidate Application: {job_info['candidate_name']} applied for {job_info['title']}"
        body_text = f"""Dear {job_info['brand_name']} Recruitment Team,

A new candidate has submitted an application for an open position at your establishment via the NiceJobs portal:

Position: {job_info['title']}
Candidate Name: {job_info['candidate_name']}
Candidate Email: {job_info['candidate_email']}
Candidate Phone: {job_info['candidate_phone']}
Selected CV: {payload.selected_cv or 'Tailored Hospitality CV'}
Application ID: {app_id}

Candidate Cover Letter:
{payload.cover_letter or 'No additional cover note provided.'}

To review this candidate's profile, qualifications, screening responses, and schedule an interview, please visit your NiceJobs ATS Dashboard:
https://nicejobs.bd/#ats

Best regards,
NiceJobs Hospitality Talent Operations Desk"""

        dispatch_system_email(
            to_email=biz_email,
            subject=subject,
            body_text=body_text,
            event_type="business_application_received",
            cursor=cursor
        )

    conn.commit()
    conn.close()

    if job_info:
        notify_realtime(
            "application_created",
            {
                "application_id": app_id,
                "job_id": payload.job_id,
                "job_title": job_info["title"],
                "business_id": job_info["business_id"],
                "candidate_name": job_info["candidate_name"],
                "candidate_email": job_info["candidate_email"],
                "user_id": payload.user_id,
                "status": "submitted",
                "created_at": now
            },
            target_business=job_info["business_id"]
        )
        notify_realtime(
            "application_submitted",
            {
                "application_id": app_id,
                "job_id": payload.job_id,
                "job_title": job_info["title"],
                "brand_name": job_info["brand_name"],
                "status": "submitted",
                "created_at": now
            },
            target_user=payload.user_id
        )

    return {"success": True, "application_id": app_id, "message": "Application submitted successfully!"}

class ApplicationStatusUpdatePayload(BaseModel):
    status: str
    recruiter_notes: Optional[str] = None
    interview_time: Optional[str] = None
    actor_name: Optional[str] = "Hotel Recruiter"

@app.post("/api/applications/{app_id}/status")
@app.patch("/api/applications/{app_id}/status")
def update_application_status(app_id: str, payload: ApplicationStatusUpdatePayload):
    conn = database.get_db()
    cursor = conn.cursor()

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Update app
    updates = ["status = ?", "updated_at = ?"]
    params = [payload.status, now]

    if payload.recruiter_notes is not None:
        updates.append("recruiter_notes = ?")
        params.append(payload.recruiter_notes)

    if payload.interview_time is not None:
        updates.append("interview_time = ?")
        params.append(payload.interview_time)

    params.append(app_id)
    cursor.execute(f"UPDATE applications SET {', '.join(updates)} WHERE id = ?", params)

    # Insert timeline event
    status_labels = {
        "under_review": "Under Review - Recruiter reviewing qualifications",
        "shortlisted": "Candidate Shortlisted for Department Interview",
        "interview_scheduled": f"Interview Scheduled: {payload.interview_time or 'Details shared'}",
        "offer": "Formal Employment Offer Extended",
        "hired": "Candidate Hired into Organization",
        "rejected": "Application Closed with Polite Regret Notification",
        "withdrawn": "Candidate Withdrew Application"
    }
    event_note = status_labels.get(payload.status, f"Status updated to {payload.status}")

    cursor.execute("""
        INSERT INTO application_events (application_id, status, actor_name, note, timestamp)
        VALUES (?, ?, ?, ?, ?)
    """, (app_id, payload.status, payload.actor_name, event_note, now))

    # Send in-app notification and email to employee
    cursor.execute("""
        SELECT a.user_id, j.title, j.business_id, b.brand_name, u.email AS candidate_email, u.name AS candidate_name
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN businesses b ON j.business_id = b.id
        JOIN users u ON a.user_id = u.id
        WHERE a.id = ?
    """, (app_id,))
    app_meta = cursor.fetchone()

    if app_meta:
        status_title = payload.status.replace('_', ' ').title()
        msg = f"{app_meta['brand_name']} updated your application for {app_meta['title']} to '{status_title}'."
        if payload.interview_time:
            msg += f" Interview Scheduled: {payload.interview_time}."
        if payload.recruiter_notes:
            msg += f" Note: {payload.recruiter_notes}"

        # In-App Notification with Real-Time Push to Candidate
        dispatch_realtime_notification(
            user_id=app_meta["user_id"],
            title=f"Application Status: {status_title}",
            message=msg,
            notif_type="application",
            link="#applications",
            cursor=cursor
        )

        # Email Notification to Candidate
        cand_subject = f"Application Update: {app_meta['title']} at {app_meta['brand_name']}"
        cand_body = f"""Dear {app_meta['candidate_name']},

{app_meta['brand_name']} has updated the status of your application for the {app_meta['title']} position on NiceJobs.

- New Status: {status_title}
{f'- Scheduled Interview: {payload.interview_time}' if payload.interview_time else ''}
{f'- Recruiter Message: {payload.recruiter_notes}' if payload.recruiter_notes else ''}

To view full status timeline, interview details, or prepare for next steps, visit your applications dashboard:
https://nicejobs.bd/#applications

Best regards,
NiceJobs Career Support Desk"""

        dispatch_system_email(
            to_email=app_meta["candidate_email"],
            subject=cand_subject,
            body_text=cand_body,
            event_type="candidate_status_update",
            cursor=cursor
        )

    conn.commit()
    conn.close()

    if app_meta:
        notify_realtime(
            "application_status_updated",
            {
                "application_id": app_id,
                "status": payload.status,
                "job_title": app_meta["title"],
                "brand_name": app_meta["brand_name"],
                "candidate_name": app_meta["candidate_name"],
                "interview_time": payload.interview_time,
                "recruiter_notes": payload.recruiter_notes,
                "updated_at": now
            },
            target_user=app_meta["user_id"]
        )
        if app_meta.get("business_id"):
            notify_realtime(
                "ats_updated",
                {
                    "application_id": app_id,
                    "status": payload.status,
                    "candidate_name": app_meta["candidate_name"],
                    "job_title": app_meta["title"],
                    "interview_time": payload.interview_time,
                    "updated_at": now
                },
                target_business=app_meta["business_id"]
            )

    return {"success": True, "status": payload.status, "updated_at": now}

@app.post("/api/conversations/{conv_id}/mark-read")
def mark_conversation_read(conv_id: str, role: Optional[str] = "jobseeker", user_id: Optional[str] = None, business_id: Optional[str] = None):
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id, business_id FROM conversations WHERE id = ?", (conv_id,))
    conv_meta = cursor.fetchone()
    if not conv_meta:
        conn.close()
        raise HTTPException(status_code=404, detail="Conversation not found")

    is_recruiter = role in ("recruiter", "business")
    if is_recruiter:
        cursor.execute("UPDATE conversations SET unread_for_business = 0 WHERE id = ?", (conv_id,))
        cursor.execute("""
            UPDATE messages 
            SET status = 'read', read_at = ? 
            WHERE conversation_id = ? AND sender_role != 'business' AND (status IS NULL OR status != 'read')
        """, (now, conv_id))
        target_u = conv_meta["user_id"]
        target_b = None
        reader_id = business_id or conv_meta["business_id"]
    else:
        cursor.execute("UPDATE conversations SET unread_for_user = 0 WHERE id = ?", (conv_id,))
        cursor.execute("""
            UPDATE messages 
            SET status = 'read', read_at = ? 
            WHERE conversation_id = ? AND sender_role = 'business' AND (status IS NULL OR status != 'read')
        """, (now, conv_id))
        target_u = None
        target_b = conv_meta["business_id"]
        reader_id = user_id or conv_meta["user_id"]

    conn.commit()
    conn.close()

    read_payload = {
        "conversation_id": conv_id,
        "reader_id": reader_id,
        "read_at": now
    }
    notify_conversation_room(conv_id, "message:read", read_payload)
    notify_realtime("message:read", read_payload, target_user=target_u, target_business=target_b)

    return {"success": True, "read_at": now}

@app.get("/api/email-logs")
def get_email_logs():
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 50")
    rows = cursor.fetchall()
    results = [dict(r) for r in rows]
    conn.close()
    return results

# =======================
# MESSAGING & INBOX
# =======================

@app.get("/api/conversations")
def get_conversations(user_id: Optional[str] = None, business_id: Optional[str] = None):
    conn = database.get_db()
    cursor = conn.cursor()

    query = """
        SELECT c.*, 
               b.brand_name, b.logo_url, b.property_type,
               u.name as candidate_name, u.avatar_url as candidate_avatar,
               j.title as job_title, j.department,
               a.id as application_id, a.selected_cv, a.status as application_status
        FROM conversations c
        JOIN businesses b ON c.business_id = b.id
        JOIN users u ON c.user_id = u.id
        LEFT JOIN jobs j ON c.job_id = j.id
        LEFT JOIN applications a ON (a.job_id = c.job_id AND a.user_id = c.user_id)
        WHERE 1=1
    """
    params = []

    if is_demo_hidden():
        query += " AND (c.is_demo = 0 OR c.is_demo IS NULL)"

    if user_id:
        query += " AND c.user_id = ?"
        params.append(user_id)

    if business_id:
        query += " AND c.business_id = ?"
        params.append(business_id)

    query += " ORDER BY c.last_message_time DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    results = [dict(r) for r in rows]

    conn.close()
    return results

@app.get("/api/conversations/{conv_id}/messages")
def get_messages(
    conv_id: str,
    user_id: Optional[str] = None,
    business_id: Optional[str] = None,
    role: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    if user_id or business_id:
        conv_meta = check_conversation_authorization(conv_id, user_id=user_id, business_id=business_id, role=role)
        if not conv_meta:
            raise HTTPException(status_code=403, detail="Unauthorized to access this conversation")

    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM messages 
        WHERE conversation_id = ? 
        ORDER BY timestamp ASC 
        LIMIT ? OFFSET ?
    """, (conv_id, limit, offset))
    rows = cursor.fetchall()
    messages = [dict(r) for r in rows]

    conn.close()
    return messages

@app.get("/api/conversations/{conv_id}/presence")
def get_conversation_presence(conv_id: str, current_role: Optional[str] = "jobseeker", current_user_id: Optional[str] = None):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id, business_id FROM conversations WHERE id = ?", (conv_id,))
    conv = cursor.fetchone()
    conn.close()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    is_recruiter = current_role in ("recruiter", "business")
    counterpart_id = conv["user_id"] if is_recruiter else conv["business_id"]
    is_online = realtime_manager.is_entity_online(counterpart_id)
    return {
        "conversation_id": conv_id,
        "counterpart_id": counterpart_id,
        "is_online": is_online
    }

class ConversationInitPayload(BaseModel):
    business_id: str
    user_id: str
    job_id: Optional[str] = None
    initial_message: Optional[str] = None

@app.post("/api/conversations/init")
@app.post("/api/conversations/get-or-create")
def get_or_create_conversation(payload: ConversationInitPayload):
    conn = database.get_db()
    cursor = conn.cursor()

    # Normalize business_id and user_id
    biz_id = payload.business_id.strip()
    u_id = payload.user_id.strip()
    j_id = payload.job_id.strip() if payload.job_id else None

    # Check if a conversation between this candidate and business already exists
    if j_id:
        cursor.execute(
            "SELECT id FROM conversations WHERE business_id = ? AND user_id = ? AND job_id = ?",
            (biz_id, u_id, j_id)
        )
    else:
        cursor.execute(
            "SELECT id FROM conversations WHERE business_id = ? AND user_id = ?",
            (biz_id, u_id)
        )
    existing = cursor.fetchone()

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    if existing:
        conv_id = existing["id"]
    else:
        # If no job_id was specified, pick the most recent application or job for context
        if not j_id:
            cursor.execute(
                "SELECT job_id FROM applications WHERE user_id = ? ORDER BY applied_at DESC LIMIT 1",
                (u_id,)
            )
            app_row = cursor.fetchone()
            if app_row:
                j_id = app_row["job_id"]
            else:
                cursor.execute(
                    "SELECT id FROM jobs WHERE business_id = ? LIMIT 1",
                    (biz_id,)
                )
                j_row = cursor.fetchone()
                if j_row:
                    j_id = j_row["id"]

        conv_id = f"conv_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
        initial_snippet = payload.initial_message or "Conversation opened"
        cursor.execute("""
            INSERT INTO conversations (id, user_id, business_id, job_id, last_message, last_message_time, unread_for_user, unread_for_business, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)
        """, (
            conv_id,
            u_id,
            biz_id,
            j_id,
            initial_snippet,
            now
        ))
        conn.commit()

        if payload.initial_message:
            msg_id = f"msg_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
            cursor.execute("""
                INSERT INTO messages (id, conversation_id, sender_id, sender_role, sender_name, content, is_action_prompt, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?)
            """, (
                msg_id,
                conv_id,
                biz_id,
                "business",
                "Hotel Recruiter",
                payload.initial_message,
                now
            ))
            conn.commit()

    # Query full conversation details with joined fields
    cursor.execute("""
        SELECT c.*, 
               b.brand_name, b.logo_url, b.property_type,
               u.name as candidate_name, u.avatar_url as candidate_avatar,
               j.title as job_title, j.department,
               a.id as application_id, a.selected_cv, a.status as application_status
        FROM conversations c
        JOIN businesses b ON c.business_id = b.id
        JOIN users u ON c.user_id = u.id
        LEFT JOIN jobs j ON c.job_id = j.id
        LEFT JOIN applications a ON (a.job_id = c.job_id AND a.user_id = c.user_id)
        WHERE c.id = ?
    """, (conv_id,))
    row = cursor.fetchone()
    conv_data = dict(row) if row else {"id": conv_id, "user_id": u_id, "business_id": biz_id, "job_id": j_id}
    conn.close()

    if not existing:
        notify_realtime("conversation_created", conv_data, target_user=u_id)
        notify_realtime("conversation_created", conv_data, target_business=biz_id)

    return conv_data

def get_media_storage_path():
    """Returns (directory_path, url_prefix) with fallback to /tmp on read-only serverless filesystems."""
    static_media = os.path.join(STATIC_DIR, "uploads", "messages")
    try:
        os.makedirs(static_media, exist_ok=True)
        probe = os.path.join(static_media, ".probe")
        with open(probe, "w") as f:
            f.write("1")
        os.remove(probe)
        return static_media, "/static/uploads/messages"
    except Exception:
        tmp_media = "/tmp/uploads/messages"
        os.makedirs(tmp_media, exist_ok=True)
        return tmp_media, "/api/uploads/messages"

ALLOWED_MEDIA_EXTENSIONS = {
    # Images
    ".jpg", ".jpeg", ".png", ".webp", ".gif",
    # Audio
    ".webm", ".mp3", ".wav", ".ogg", ".m4a", ".aac",
    # Documents
    ".pdf", ".doc", ".docx", ".txt", ".xlsx", ".csv"
}
MAX_CHAT_UPLOAD_BYTES = 15 * 1024 * 1024 # 15 MB limit

@app.get("/api/uploads/messages/{filename}")
def serve_uploaded_media(filename: str):
    safe_name = os.path.basename(filename)
    for p in [
        os.path.join(STATIC_DIR, "uploads", "messages", safe_name),
        os.path.join("/tmp/uploads/messages", safe_name)
    ]:
        if os.path.exists(p):
            return FileResponse(p, headers={"X-Content-Type-Options": "nosniff"})
    raise HTTPException(status_code=404, detail="Media attachment not found")

@app.post("/api/messages/upload")
async def upload_chat_media(file: UploadFile = File(...)):
    media_dir, url_prefix = get_media_storage_path()

    orig_name = os.path.basename(file.filename or "attachment")
    ext = os.path.splitext(orig_name)[1].lower()

    if ext not in ALLOWED_MEDIA_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Security Alert: File type '{ext}' is not permitted. Only images, audio, and standard documents (PDF, Word, Excel, Text) are allowed."
        )

    f_type = "document"
    if ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        f_type = "image"
    elif ext in [".webm", ".mp3", ".wav", ".ogg", ".m4a", ".aac"]:
        f_type = "audio"
    elif ext in [".pdf", ".doc", ".docx", ".txt", ".xlsx", ".csv"]:
        f_type = "document"

    safe_name = f"{f_type}_{int(datetime.now().timestamp())}_{secrets.token_hex(6)}{ext}"
    dest_path = os.path.join(media_dir, safe_name)

    content_bytes = await file.read()
    if len(content_bytes) > MAX_CHAT_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Payload Too Large: Uploaded file exceeds the 15 MB size limit."
        )

    with open(dest_path, "wb") as f:
        f.write(content_bytes)

    file_size = len(content_bytes)
    file_url = f"{url_prefix}/{safe_name}"

    return {
        "success": True,
        "file_url": file_url,
        "file_name": orig_name,
        "file_type": f_type,
        "file_size": file_size
    }

class MessageSendPayload(BaseModel):
    conversation_id: str
    sender_id: str
    sender_role: str # 'user' or 'business'
    sender_name: str
    content: str
    is_action_prompt: bool = False
    temp_id: Optional[str] = None
    business_id: Optional[str] = None

@app.post("/api/messages")
def send_message(payload: MessageSendPayload):
    # 1. Authorization & participant validation
    biz_identifier = payload.business_id or payload.sender_id
    conv_meta = check_conversation_authorization(
        payload.conversation_id,
        user_id=payload.sender_id,
        business_id=biz_identifier,
        role=payload.sender_role
    )
    if not conv_meta:
        raise HTTPException(status_code=403, detail="Not authorized to send messages in this conversation")

    # 2. Content validation & sanitization
    clean_content = (payload.content or "").strip()
    if not clean_content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty")
    if len(clean_content) > 10000:
        raise HTTPException(status_code=400, detail="Message exceeds maximum allowed length (10,000 characters)")

    # 3. Determine recipient and delivery presence
    is_recruiter = payload.sender_role in ('business', 'recruiter')
    if is_recruiter:
        recipient_id = conv_meta["user_id"]
        target_user = recipient_id
        target_biz = None
    else:
        recipient_id = conv_meta["business_id"]
        target_user = None
        target_biz = recipient_id

    is_online = realtime_manager.is_entity_online(recipient_id)
    initial_status = "delivered" if is_online else "sent"

    msg_id = f"msg_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    delivered_at = now if is_online else None

    # 4. Save to persistent database
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO messages (id, conversation_id, sender_id, sender_role, sender_name, content, is_action_prompt, timestamp, status, delivered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        msg_id,
        payload.conversation_id,
        payload.sender_id,
        payload.sender_role,
        payload.sender_name,
        clean_content,
        1 if payload.is_action_prompt else 0,
        now,
        initial_status,
        delivered_at
    ))

    # Update conversation last message with friendly snippet
    snippet = clean_content
    if snippet.startswith('[IMAGE]'):
        snippet = "Photo attachment"
    elif snippet.startswith('[VOICE'):
        snippet = "Voice message"
    elif snippet.startswith('[DOC]'):
        snippet = "Document attachment"
    elif len(snippet) > 80:
        snippet = snippet[:77] + "..."

    # Increment unread counter for recipient
    if is_recruiter:
        cursor.execute("""
            UPDATE conversations 
            SET last_message = ?, last_message_time = ?, unread_for_user = COALESCE(unread_for_user, 0) + 1
            WHERE id = ?
        """, (snippet, now, payload.conversation_id))
    else:
        cursor.execute("""
            UPDATE conversations 
            SET last_message = ?, last_message_time = ?, unread_for_business = COALESCE(unread_for_business, 0) + 1
            WHERE id = ?
        """, (snippet, now, payload.conversation_id))

    conn.commit()
    conn.close()

    # 5. Emit real-time message to conversation room and targeted recipient
    msg_event = {
        "conversation_id": payload.conversation_id,
        "message_id": msg_id,
        "temp_id": payload.temp_id,
        "sender_id": payload.sender_id,
        "sender_name": payload.sender_name,
        "sender_role": payload.sender_role,
        "content": clean_content,
        "timestamp": now,
        "status": initial_status,
        "delivered_at": delivered_at
    }
    notify_conversation_room(payload.conversation_id, "chat_message", msg_event)
    notify_realtime("chat_message", msg_event, target_user=target_user, target_business=target_biz)

    # 6. Return delivery acknowledgement
    return {
        "success": True,
        "message_id": msg_id,
        "temp_id": payload.temp_id,
        "status": initial_status,
        "timestamp": now
    }

@app.post("/api/conversations/{conv_id}/messages")
def send_conversation_message(conv_id: str, payload: Dict[str, Any]):
    content = payload.get("content") or payload.get("text") or ""
    msg_payload = MessageSendPayload(
        conversation_id=conv_id,
        sender_id=payload.get("sender_id", ""),
        sender_role=payload.get("sender_role", "user"),
        sender_name=payload.get("sender_name", "Anonymous"),
        content=content,
        is_action_prompt=bool(payload.get("is_action_prompt", False))
    )
    return send_message(msg_payload)

# =======================
# SAVED JOBS & NOTIFICATIONS
# =======================

@app.get("/api/saved-jobs")
def get_saved_jobs(user_id: str = "user_rahim"):
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT j.*, b.brand_name, b.property_type, b.city, b.logo_url, b.star_rating, sj.saved_at
        FROM saved_jobs sj
        JOIN jobs j ON sj.job_id = j.id
        JOIN businesses b ON j.business_id = b.id
        WHERE sj.user_id = ?
        ORDER BY sj.saved_at DESC
    """, (user_id,))
    rows = cursor.fetchall()
    results = [dict(r) for r in rows]

    conn.close()
    return results

@app.post("/api/saved-jobs/{job_id}")
def toggle_save_job(job_id: str, request: Request, user_id: Optional[str] = None):
    effective_user_id = user_id or (request.headers.get("X-User-Id") if request else None) or "user_rahim"
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT 1 FROM saved_jobs WHERE user_id = ? AND job_id = ?", (effective_user_id, job_id))
    exists = cursor.fetchone()

    if exists:
        cursor.execute("DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?", (effective_user_id, job_id))
        is_saved = False
    else:
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        cursor.execute("INSERT INTO saved_jobs (user_id, job_id, saved_at) VALUES (?, ?, ?)", (effective_user_id, job_id, now))
        is_saved = True

    conn.commit()
    conn.close()

    notify_realtime(
        "saved_jobs_updated",
        {"job_id": job_id, "is_saved": is_saved, "user_id": effective_user_id},
        target_user=effective_user_id
    )

    return {"is_saved": is_saved}

@app.get("/api/notifications")
def get_notifications(user_id: str = "user_rahim"):
    conn = database.get_db()
    cursor = conn.cursor()

    query = "SELECT * FROM notifications WHERE user_id = ?"
    params = [user_id]
    if is_demo_hidden():
        query += " AND (is_demo = 0 OR is_demo IS NULL)"
    query += " ORDER BY timestamp DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    results = [dict(r) for r in rows]

    conn.close()
    return results

class ReadAllPayload(BaseModel):
    user_id: Optional[str] = None

@app.post("/api/notifications/read-all")
def mark_all_notifications_read(request: Request, user_id: Optional[str] = None, payload: Optional[ReadAllPayload] = None):
    header_uid = request.headers.get("X-User-Id") if request else None
    effective_user_id = user_id or (payload.user_id if payload else None) or header_uid or "user_rahim"
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (effective_user_id,))
    conn.commit()
    conn.close()

    notify_realtime(
        "notifications_read",
        {"user_id": effective_user_id},
        target_user=effective_user_id
    )

    return {"success": True}

# =======================
# ADMIN & TRUST
# =======================

@app.get("/api/admin/verifications")
def get_admin_verifications():
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT bv.*, b.brand_name, b.legal_name, b.property_type, b.city, b.website, b.email
        FROM business_verifications bv
        JOIN businesses b ON bv.business_id = b.id
        ORDER BY bv.submitted_at DESC
    """)
    rows = cursor.fetchall()
    results = [dict(r) for r in rows]
    conn.close()
    return results

class VerificationReviewPayload(BaseModel):
    action: str # 'approved' or 'rejected'
    reviewer: str = "Tariqul Islam (Trust & Safety)"
    comments: str

@app.post("/api/admin/verifications/{verif_id}/review")
def review_verification(verif_id: str, payload: VerificationReviewPayload):
    conn = database.get_db()
    cursor = conn.cursor()

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    cursor.execute("""
        UPDATE business_verifications
        SET status = ?, reviewed_at = ?, reviewed_by = ?, review_comments = ?
        WHERE id = ?
    """, (payload.action, now, payload.reviewer, payload.comments, verif_id))

    # Update business verification status
    cursor.execute("SELECT business_id FROM business_verifications WHERE id = ?", (verif_id,))
    row = cursor.fetchone()
    if row:
        biz_id = row["business_id"]
        status_val = "verified" if payload.action == "approved" else "rejected"
        cursor.execute("UPDATE businesses SET verification_status = ? WHERE id = ?", (status_val, biz_id))

    conn.commit()
    conn.close()

    if row:
        notify_realtime(
            "business_verified",
            {"business_id": biz_id, "verification_status": status_val},
            target_business=biz_id
        )

    return {"success": True, "status": payload.action}

@app.post("/api/admin/verify-business/{business_id}")
def verify_business_direct(business_id: str, payload: Optional[Dict[str, Any]] = None):
    conn = database.get_db()
    cursor = conn.cursor()
    new_status = (payload or {}).get("status", "verified")
    cursor.execute("UPDATE businesses SET verification_status = ? WHERE id = ?", (new_status, business_id))
    cursor.execute("UPDATE business_verifications SET status = ? WHERE business_id = ?", ("approved" if new_status == "verified" else "rejected", business_id))
    conn.commit()
    conn.close()

    notify_realtime(
        "business_verified",
        {"business_id": business_id, "verification_status": new_status},
        target_business=business_id
    )

    return {"success": True, "business_id": business_id, "verification_status": new_status}

# =======================
# BUSINESS MEMBER MANAGEMENT
# =======================

@app.get("/api/business/members")
def get_business_members(business_id: Optional[str] = None, user_id: Optional[str] = None):
    conn = database.get_db()
    cursor = conn.cursor()
    if not business_id and user_id:
        cursor.execute("SELECT business_id FROM business_memberships WHERE user_id = ? LIMIT 1", (user_id,))
        m_row = cursor.fetchone()
        if m_row:
            business_id = m_row["business_id"]

    if not business_id:
        cursor.execute("SELECT id FROM businesses LIMIT 1")
        b_first = cursor.fetchone()
        business_id = b_first["id"] if b_first else "biz_radisson"

    cursor.execute("""
        SELECT bm.*, u.name, u.email, u.phone, u.avatar_url, u.designation as user_designation,
               u.status as user_status, u.is_business_admin, b.brand_name
        FROM business_memberships bm
        JOIN users u ON bm.user_id = u.id
        JOIN businesses b ON bm.business_id = b.id
        WHERE bm.business_id = ?
        ORDER BY (bm.membership_role = 'admin') DESC, bm.created_at ASC
    """, (business_id,))
    rows = cursor.fetchall()
    results = [dict(r) for r in rows]
    conn.close()
    return results

@app.post("/api/business/members/{membership_id}/approve")
def approve_business_member(membership_id: str, reviewer_id: Optional[str] = None):
    conn = database.get_db()
    cursor = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    cursor.execute("SELECT * FROM business_memberships WHERE id = ?", (membership_id,))
    mem = cursor.fetchone()
    if not mem:
        conn.close()
        raise HTTPException(status_code=404, detail="Membership request not found")

    cursor.execute("""
        UPDATE business_memberships
        SET approval_status = 'approved', approved_at = ?, approved_by = ?
        WHERE id = ?
    """, (now, reviewer_id or "Business Admin", membership_id))

    cursor.execute("UPDATE users SET status = 'active' WHERE id = ?", (mem["user_id"],))

    dispatch_realtime_notification(
        user_id=mem["user_id"],
        title="Moderator Account Approved!",
        message="Your access request as business moderator has been approved by the Admin. You can now access your recruitment portal.",
        notif_type="account_approved",
        link="#recruiter-dashboard",
        business_id=mem["business_id"],
        cursor=cursor
    )

    conn.commit()
    conn.close()
    return {"success": True, "message": "Moderator account approved successfully."}

@app.post("/api/business/members/{membership_id}/reject")
def reject_business_member(membership_id: str, reviewer_id: Optional[str] = None):
    conn = database.get_db()
    cursor = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    cursor.execute("SELECT * FROM business_memberships WHERE id = ?", (membership_id,))
    mem = cursor.fetchone()
    if not mem:
        conn.close()
        raise HTTPException(status_code=404, detail="Membership request not found")

    cursor.execute("""
        UPDATE business_memberships
        SET approval_status = 'rejected', approved_at = ?, approved_by = ?
        WHERE id = ?
    """, (now, reviewer_id or "Business Admin", membership_id))

    cursor.execute("UPDATE users SET status = 'rejected' WHERE id = ?", (mem["user_id"],))

    dispatch_realtime_notification(
        user_id=mem["user_id"],
        title="Moderator Access Not Approved",
        message="Your access request as business moderator was not approved at this time.",
        notif_type="account_rejected",
        link="#home",
        business_id=mem["business_id"],
        cursor=cursor
    )

    conn.commit()
    conn.close()
    return {"success": True, "message": "Moderator request rejected."}

@app.post("/api/business/members/{membership_id}/promote-admin")
def promote_to_business_admin(membership_id: str):
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM business_memberships WHERE id = ?", (membership_id,))
    target_mem = cursor.fetchone()
    if not target_mem:
        conn.close()
        raise HTTPException(status_code=404, detail="Membership not found")

    biz_id = target_mem["business_id"]
    new_admin_user_id = target_mem["user_id"]

    cursor.execute("""
        UPDATE business_memberships
        SET membership_role = 'moderator'
        WHERE business_id = ? AND membership_role = 'admin'
    """, (biz_id,))

    cursor.execute("""
        UPDATE users
        SET is_business_admin = 0
        WHERE id IN (SELECT user_id FROM business_memberships WHERE business_id = ?)
    """, (biz_id,))

    cursor.execute("""
        UPDATE business_memberships
        SET membership_role = 'admin', approval_status = 'approved'
        WHERE id = ?
    """, (membership_id,))

    cursor.execute("""
        UPDATE users
        SET is_business_admin = 1, status = 'active'
        WHERE id = ?
    """, (new_admin_user_id,))

    cursor.execute("""
        UPDATE businesses
        SET admin_user_id = ?
        WHERE id = ?
    """, (new_admin_user_id, biz_id))

    conn.commit()
    conn.close()
    return {"success": True, "message": "Member successfully designated as Business Admin."}

# =======================
# BACKEND ADMIN CONTROL PANEL & SECURE AUTHENTICATION
# =======================

class AdminLoginPayload(BaseModel):
    email: str
    password: str
    security_pin: Optional[str] = None

# Brute force protection memory store: ip:email -> list of failed timestamps
ADMIN_LOGIN_ATTEMPTS: Dict[str, List[float]] = {}
ADMIN_LOCKOUT_MAX = 5
ADMIN_LOCKOUT_WINDOW = 300 # 5 minutes
ADMIN_LOCKOUT_PENALTY = 60 # 60 seconds

@app.post("/api/admin/login")
def admin_login(payload: AdminLoginPayload, request: Request):
    client_ip = request.client.host if request.client else "127.0.0.1"
    now_ts = time.time()
    rate_key = f"{client_ip}:{payload.email.strip().lower()}"

    # Filter attempts within lockout window
    recent_attempts = [t for t in ADMIN_LOGIN_ATTEMPTS.get(rate_key, []) if now_ts - t < ADMIN_LOCKOUT_WINDOW]
    ADMIN_LOGIN_ATTEMPTS[rate_key] = recent_attempts

    # Check if locked out
    if len(recent_attempts) >= ADMIN_LOCKOUT_MAX:
        time_since_last = now_ts - recent_attempts[-1]
        if time_since_last < ADMIN_LOCKOUT_PENALTY:
            remaining = int(ADMIN_LOCKOUT_PENALTY - time_since_last)
            raise HTTPException(
                status_code=429,
                detail=f"Security Lockout Active: Too many failed administrator login attempts. Please wait {max(remaining, 5)} seconds before retrying."
            )

    admin_email = payload.email.strip().lower()
    admin_password = payload.password.strip()

    if not admin_email or not admin_password:
        raise HTTPException(status_code=400, detail="Administrator email and root password are both required.")

    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (admin_email,))
    user = cursor.fetchone()

    if not user and admin_email in ["admin@nicejobs.info", "admin@nicejobs.bd"]:
        cursor.execute("SELECT * FROM users WHERE role = 'admin' LIMIT 1")
        user = cursor.fetchone()

    # Generic timing-safe error for non-existent users or non-admin roles
    if not user or user["role"] != "admin":
        ADMIN_LOGIN_ATTEMPTS.setdefault(rate_key, []).append(now_ts)
        conn.close()
        remaining = ADMIN_LOCKOUT_MAX - len(ADMIN_LOGIN_ATTEMPTS[rate_key])
        warning = f" ({remaining} attempt(s) left before lockout)" if remaining > 0 else ""
        raise HTTPException(
            status_code=401,
            detail=f"Access Denied: Invalid administrative credentials or unauthorized account.{warning}"
        )

    if user["status"] == "suspended":
        conn.close()
        raise HTTPException(status_code=403, detail="Security Alert: Administrative identity is suspended.")

    # Validate password using cryptographic verification
    stored_password = user["password"] or ""
    if not verify_password(admin_password, stored_password):
        ADMIN_LOGIN_ATTEMPTS.setdefault(rate_key, []).append(now_ts)
        conn.close()
        remaining = ADMIN_LOCKOUT_MAX - len(ADMIN_LOGIN_ATTEMPTS[rate_key])
        warning = f" ({remaining} attempt(s) left before lockout)" if remaining > 0 else ""
        raise HTTPException(
            status_code=401,
            detail=f"Access Denied: Incorrect administrative password.{warning}"
        )
    # Transparently upgrade admin plaintext password to bcrypt
    if not stored_password.startswith("$2b$") and not stored_password.startswith("$2a$"):
        try:
            cursor.execute("UPDATE users SET password = ? WHERE id = ?", (hash_password(admin_password), user["id"]))
            conn.commit()
        except Exception:
            pass

    # Optional 2FA PIN check
    if payload.security_pin and payload.security_pin.strip():
        pin = payload.security_pin.strip()
        expected_pin = os.environ.get("ADMIN_2FA_PIN", "994821")
        pin_valid = secrets.compare_digest(pin, expected_pin)
        if not pin_valid and not database.is_production():
            pin_valid = pin in ["258330", "123456"]
        if not pin_valid:
            ADMIN_LOGIN_ATTEMPTS.setdefault(rate_key, []).append(now_ts)
            conn.close()
            raise HTTPException(status_code=401, detail="Access Denied: Invalid 2FA Master Security Token.")

    # Successful login: reset failed attempts
    ADMIN_LOGIN_ATTEMPTS.pop(rate_key, None)

    # Generate cryptographically secure token
    token = f"adm_sec_{secrets.token_hex(24)}"
    audit_id = f"aud_{int(now_ts)}_{secrets.token_hex(4)}"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Record security audit log
    cursor.execute("""
        INSERT INTO moderation_reports (id, item_type, item_id, reporter_name, reason, status, created_at)
        VALUES (?, 'admin_audit', ?, 'Platform Security Guardian', ?, 'resolved', ?)
        ON CONFLICT (id) DO UPDATE SET
            item_type = excluded.item_type,
            item_id = excluded.item_id,
            reporter_name = excluded.reporter_name,
            reason = excluded.reason,
            status = excluded.status,
            created_at = excluded.created_at
    """, (audit_id, user["id"], f"Successful root administrator authentication from {client_ip} via TLS", now_str))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "phone": user["phone"],
            "role": "admin",
            "title": "Platform Administrator (Trust & Safety)",
            "avatar": user["avatar_url"]
        },
        "clearance": "LEVEL_4_ROOT",
        "audit_id": audit_id,
        "message": f"Security clearance granted. Welcome back, Administrator {user['name']}."
    }

@app.get("/api/admin/overview")
def get_admin_overview():
    cached = get_cached_api("admin_overview")
    if cached is not None:
        return cached

    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            (SELECT count(*) FROM users WHERE role = 'jobseeker') as total_candidates,
            (SELECT count(*) FROM users WHERE role = 'recruiter') as total_business_users,
            (SELECT count(*) FROM businesses) as total_businesses,
            (SELECT count(*) FROM businesses WHERE verification_status = 'verified') as verified_businesses,
            (SELECT count(*) FROM businesses WHERE verification_status = 'pending') as pending_verifications,
            (SELECT count(*) FROM business_memberships WHERE approval_status = 'pending_admin_approval') as pending_moderators,
            (SELECT count(*) FROM jobs) as total_jobs,
            (SELECT count(*) FROM jobs WHERE status = 'active') as active_jobs,
            (SELECT count(*) FROM users WHERE status = 'suspended') as suspended_users
    """)
    row = cursor.fetchone()
    conn.close()

    res = {
        "total_candidates": row["total_candidates"] if row else 0,
        "total_business_users": row["total_business_users"] if row else 0,
        "total_businesses": row["total_businesses"] if row else 0,
        "verified_businesses": row["verified_businesses"] if row else 0,
        "pending_verifications": row["pending_verifications"] if row else 0,
        "pending_moderators": row["pending_moderators"] if row else 0,
        "total_jobs": row["total_jobs"] if row else 0,
        "active_jobs": row["active_jobs"] if row else 0,
        "suspended_users": row["suspended_users"] if row else 0
    }
    set_cached_api("admin_overview", res)
    return res

@app.get("/api/admin/users")
def get_admin_users(role: Optional[str] = "all", status: Optional[str] = "all", q: Optional[str] = None):
    conn = database.get_db()
    cursor = conn.cursor()

    query = """
        SELECT u.*, 
               p.current_position, p.headline, p.experience_years, p.location as candidate_location,
               b.brand_name as business_name, bm.membership_role, bm.approval_status as membership_status,
               bm.org_role
        FROM users u
        LEFT JOIN employee_profiles p ON u.id = p.user_id
        LEFT JOIN business_memberships bm ON u.id = bm.user_id
        LEFT JOIN businesses b ON bm.business_id = b.id
        WHERE 1=1
    """
    params = []
    if role and role != "all":
        query += " AND u.role = ?"
        params.append(role)
    if status and status != "all":
        query += " AND u.status = ?"
        params.append(status)
    if q:
        query += " AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR b.brand_name LIKE ?)"
        like_q = f"%{q}%"
        params.extend([like_q, like_q, like_q, like_q])

    query += " ORDER BY u.created_at DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    results = [dict(r) for r in rows]
    conn.close()
    return results

class UserStatusPayload(BaseModel):
    status: str # 'active', 'suspended', 'pending_approval'

@app.post("/api/admin/users/{user_id}/status")
def update_user_status(user_id: str, payload: UserStatusPayload):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET status = ? WHERE id = ?", (payload.status, user_id))
    if payload.status == "active":
        cursor.execute("UPDATE business_memberships SET approval_status = 'approved' WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"success": True, "user_id": user_id, "status": payload.status}

class BlogPermissionPayload(BaseModel):
    can_post_blog: bool

@app.post("/api/admin/users/{user_id}/blog-permission")
@app.patch("/api/admin/users/{user_id}/blog-permission")
def update_user_blog_permission(user_id: str, payload: BlogPermissionPayload):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    cursor.execute("UPDATE users SET can_post_blog = ? WHERE id = ?", (1 if payload.can_post_blog else 0, user_id))
    conn.commit()
    conn.close()
    return {"success": True, "user_id": user_id, "can_post_blog": payload.can_post_blog}

@app.delete("/api/admin/users/{user_id}")
def delete_user(user_id: str):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    cursor.execute("DELETE FROM employee_profiles WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM business_memberships WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM applications WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "User deleted successfully."}

@app.get("/api/admin/jobs-list")
def get_admin_jobs_list(status: Optional[str] = "all", q: Optional[str] = None):
    conn = database.get_db()
    cursor = conn.cursor()

    query = """
        SELECT j.*, b.brand_name, b.city, b.verification_status,
               (SELECT count(*) FROM applications WHERE job_id = j.id) as live_applicants_count
        FROM jobs j
        JOIN businesses b ON j.business_id = b.id
        WHERE 1=1
    """
    params = []
    if is_demo_hidden():
        query += " AND (j.is_demo = 0 OR j.is_demo IS NULL)"
    if status and status != "all":
        query += " AND j.status = ?"
        params.append(status)
    if q:
        query += " AND (j.title LIKE ? OR b.brand_name LIKE ? OR j.department LIKE ?)"
        like_q = f"%{q}%"
        params.extend([like_q, like_q, like_q])

    query += " ORDER BY j.posted_at DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    results = [dict(r) for r in rows]
    conn.close()
    return results

class JobStatusPayload(BaseModel):
    status: str # 'active', 'paused', 'closed'

@app.post("/api/admin/jobs/{job_id}/status")
def update_job_status(job_id: str, payload: JobStatusPayload):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE jobs SET status = ? WHERE id = ?", (payload.status, job_id))
    conn.commit()
    conn.close()
    invalidate_api_cache("jobs")
    notify_realtime("job_status_changed", {"job_id": job_id, "status": payload.status})
    return {"success": True, "job_id": job_id, "status": payload.status}

class JobFeaturePayload(BaseModel):
    is_featured: Optional[bool] = None
    is_urgent: Optional[bool] = None

@app.post("/api/admin/jobs/{job_id}/feature")
def toggle_job_feature(job_id: str, payload: JobFeaturePayload):
    conn = database.get_db()
    cursor = conn.cursor()
    if payload.is_featured is not None:
        cursor.execute("UPDATE jobs SET is_featured = ? WHERE id = ?", (1 if payload.is_featured else 0, job_id))
    if payload.is_urgent is not None:
        cursor.execute("UPDATE jobs SET is_urgent = ? WHERE id = ?", (1 if payload.is_urgent else 0, job_id))
    conn.commit()
    conn.close()
    invalidate_api_cache("jobs")
    notify_realtime("job_updated", {"job_id": job_id, "is_featured": payload.is_featured, "is_urgent": payload.is_urgent})
    return {"success": True, "job_id": job_id}

@app.delete("/api/admin/jobs/{job_id}")
def delete_job(job_id: str):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    cursor.execute("DELETE FROM applications WHERE job_id = ?", (job_id,))
    cursor.execute("DELETE FROM saved_jobs WHERE job_id = ?", (job_id,))
    conn.commit()
    conn.close()
    invalidate_api_cache("jobs")
    notify_realtime("job_deleted", {"job_id": job_id})
    return {"success": True, "message": "Job post deleted successfully."}

@app.get("/api/admin/businesses-list")
def get_admin_businesses_list():
    conn = database.get_db()
    cursor = conn.cursor()
    where_clause = "WHERE (b.is_demo = 0 OR b.is_demo IS NULL)" if is_demo_hidden() else ""
    cursor.execute(f"""
        SELECT b.*, u.name as admin_name, u.email as admin_email,
               (SELECT count(*) FROM business_memberships WHERE business_id = b.id) as member_count,
               (SELECT count(*) FROM jobs WHERE business_id = b.id) as job_count
        FROM businesses b
        LEFT JOIN users u ON b.admin_user_id = u.id
        {where_clause}
        ORDER BY b.brand_name ASC
    """)
    rows = cursor.fetchall()
    results = []
    for r in rows:
        d = dict(r)
        if d.get("features"):
            try:
                d["features"] = json.loads(d["features"])
            except Exception:
                pass
        results.append(d)
    conn.close()
    return results

@app.get("/api/admin/moderator-requests")
def get_admin_moderator_requests():
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT bm.*, u.name, u.email, u.phone, u.avatar_url, u.designation, u.status as user_status,
               b.brand_name, b.email as business_email
        FROM business_memberships bm
        JOIN users u ON bm.user_id = u.id
        JOIN businesses b ON bm.business_id = b.id
        WHERE bm.approval_status = 'pending_admin_approval'
        ORDER BY bm.created_at DESC
    """)
    rows = cursor.fetchall()
    results = [dict(r) for r in rows]
    conn.close()
    return results

@app.delete("/api/admin/businesses/{business_id}")
def delete_business(business_id: str):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM businesses WHERE id = ?", (business_id,))
    cursor.execute("DELETE FROM business_memberships WHERE business_id = ?", (business_id,))
    cursor.execute("DELETE FROM jobs WHERE business_id = ?", (business_id,))
    cursor.execute("DELETE FROM business_verifications WHERE business_id = ?", (business_id,))
    conn.commit()
    conn.close()
    invalidate_api_cache("jobs")
    notify_realtime("business_deleted", {"business_id": business_id})
    return {"success": True, "message": "Business establishment deleted successfully."}

@app.get("/api/admin/demo-status")
def get_demo_status():
    return {"demo_data_hidden": is_demo_hidden()}

class ToggleDemoPayload(BaseModel):
    hide: Optional[bool] = None

@app.post("/api/admin/toggle-demo-data")
def toggle_demo_data(payload: Optional[ToggleDemoPayload] = None):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    """)
    current_hidden = is_demo_hidden()
    if payload is not None and payload.hide is not None:
        new_hidden = bool(payload.hide)
    else:
        new_hidden = not current_hidden

    cursor.execute("""
        INSERT INTO system_settings (key, value) VALUES ('demo_data_hidden', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    """, ("1" if new_hidden else "0",))
    conn.commit()
    conn.close()
    import time
    _demo_hidden_cache["val"] = new_hidden
    _demo_hidden_cache["ts"] = time.time()
    invalidate_api_cache()
    notify_realtime("demo_data_toggled", {"demo_data_hidden": new_hidden})
    return {
        "success": True,
        "demo_data_hidden": new_hidden,
        "message": "Demo data temporarily removed! Fresh accounts view active." if new_hidden else "Demo data restored!"
    }

@app.post("/api/admin/reset-demo")
def reset_demo_database():
    database.reset_demo_data()
    invalidate_api_cache()
    return {"success": True, "message": "NiceJobs demo database has been re-initialized to initial fresh state."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)

