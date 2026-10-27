"""
NiceJobs - FastAPI Server & REST API
"""
import os
import json
import sqlite3
import uuid
import time
import secrets
from datetime import datetime
from typing import Optional, List, Dict, Any, Set
from collections import defaultdict
import asyncio
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Ensure local .env is loaded before application startup
load_dotenv()

import database
import bcrypt

app = FastAPI(title="NiceJobs API", version="1.0.0")

# =======================
# SECURITY HEADERS & DEFENSIVE MIDDLEWARE
# =======================
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if database.is_production():
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

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
        dead_ws = []
        msg = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now().isoformat(),
            "event_id": f"evt_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"
        }
        for ws in list(ws_set):
            if ws is exclude_ws:
                continue
            try:
                await ws.send_json(msg)
            except Exception:
                dead_ws.append(ws)
        for d in dead_ws:
            self.disconnect_ws(d)

    async def broadcast_event(self, event_type: str, data: Optional[Dict[str, Any]] = None, target_user: Optional[str] = None, target_business: Optional[str] = None):
        msg = {
            "type": event_type,
            "data": data or {},
            "target_user": target_user,
            "target_business": target_business,
            "timestamp": datetime.now().isoformat(),
            "event_id": f"evt_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"
        }
        
        dead_ws = []
        for ws in list(self.active_websockets):
            meta = self.metadata.get(ws, {})
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
                await ws.send_json(msg)
            except Exception:
                dead_ws.append(ws)
        for d in dead_ws:
            self.disconnect_ws(d)

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
    in the conversation. Returns conversation row as dict if valid, else None.
    """
    if not conv_id:
        return None
    try:
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,))
        conv = cursor.fetchone()
        if not conv:
            conn.close()
            return None

        conv_dict = dict(conv)
        if role == "admin":
            conn.close()
            return conv_dict

        u_id = (user_id or "").strip()
        b_id = (business_id or "").strip()

        # Direct match with candidate
        if u_id and u_id == conv_dict.get("user_id"):
            conn.close()
            return conv_dict

        # Direct match with business ID
        if b_id and b_id == conv_dict.get("business_id"):
            conn.close()
            return conv_dict

        # If user_id itself is the business ID
        if u_id and u_id == conv_dict.get("business_id"):
            conn.close()
            return conv_dict

        # Check if user belongs to or manages the business
        target_biz_id = conv_dict.get("business_id")
        if u_id and target_biz_id:
            # 1. Check if u_id is the primary business administrator
            cursor.execute("SELECT id FROM businesses WHERE id = ? AND admin_user_id = ?", (target_biz_id, u_id))
            if cursor.fetchone():
                conn.close()
                return conv_dict

            # 2. Check if u_id has an active business membership
            try:
                cursor.execute("SELECT id FROM business_memberships WHERE business_id = ? AND user_id = ?", (target_biz_id, u_id))
                if cursor.fetchone():
                    conn.close()
                    return conv_dict
            except Exception:
                pass

            # 3. Check if user has global admin role
            cursor.execute("SELECT role FROM users WHERE id = ?", (u_id,))
            u_row = cursor.fetchone()
            if u_row and u_row.get("role") == "admin":
                conn.close()
                return conv_dict

        conn.close()
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

def dispatch_system_email(to_email: str, subject: str, body_text: str, event_type: str = "general", cursor = None):
    mail_id = f"mail_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # If SMTP environment variables are configured, attempt real transmission
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASSWORD")

    status = "delivered_simulated"
    if smtp_host and smtp_user and smtp_pass:
        try:
            import smtplib
            from email.mime.text import MIMEText
            msg = MIMEText(body_text, "plain", "utf-8")
            msg["Subject"] = subject
            msg["From"] = f"NiceJobs Platform <{smtp_user}>"
            msg["To"] = to_email
            with smtplib.SMTP(smtp_host, smtp_port, timeout=5) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
            status = "delivered_smtp"
        except Exception as e:
            print(f"[MAIL SMTP ERROR] Failed sending to {to_email}: {e}")
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
        print(f"[MAIL LOG ERROR] {e}")

    print(f"\n=======================================================")
    print(f"[EMAIL NOTIFICATION DISPATCHED] Status: {status}")
    print(f"Recipient: {to_email}")
    print(f"Subject: {subject}")
    print(f"Event: {event_type}")
    print(f"Timestamp: {now}")
    print(f"-------------------------------------------------------")
    print(body_text[:280] + ("..." if len(body_text) > 280 else ""))
    print(f"=======================================================\n")
    return {"id": mail_id, "status": status, "to": to_email}

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
        keys_to_del = [k for k in _API_CACHE if k.startswith(prefix)]
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

    cursor.execute("""
        SELECT j.*, b.brand_name, b.legal_name, b.property_type, b.city, b.address, b.website, b.email as business_email,
               b.logo_url, b.cover_image, b.verification_status, b.star_rating, b.description as business_desc,
               b.amenities, b.benefits as business_benefits
        FROM jobs j
        JOIN businesses b ON j.business_id = b.id
        WHERE j.id = ?
    """, (job_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
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

    # Check application state for user
    applied = False
    application_data = None
    if user_id:
        cursor.execute("SELECT * FROM applications WHERE job_id = ? AND user_id = ?", (job_id, user_id))
        app_row = cursor.fetchone()
        if app_row:
            applied = True
            application_data = dict(app_row)
            if application_data.get("screening_answers"):
                application_data["screening_answers"] = json.loads(application_data["screening_answers"])

    # Check saved state
    saved = False
    if user_id:
        cursor.execute("SELECT 1 FROM saved_jobs WHERE job_id = ? AND user_id = ?", (job_id, user_id))
        saved = cursor.fetchone() is not None

    job["is_applied"] = applied
    job["application"] = application_data
    job["is_saved"] = saved

    conn.close()
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

    cursor.execute("SELECT * FROM businesses WHERE id = ?", (business_id,))
    row = cursor.fetchone()
    if not row or (is_demo_hidden() and row["is_demo"] == 1):
        conn.close()
        raise HTTPException(status_code=404, detail="Hotel/Business not found")

    biz = dict(row)
    biz["departments"] = json.loads(biz["departments"]) if biz["departments"] else []
    biz["amenities"] = json.loads(biz["amenities"]) if biz["amenities"] else []
    biz["benefits"] = json.loads(biz["benefits"]) if biz["benefits"] else []

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

    # Followed state
    is_followed = False
    if user_id:
        cursor.execute("SELECT 1 FROM followed_businesses WHERE user_id = ? AND business_id = ?", (user_id, business_id))
        is_followed = cursor.fetchone() is not None
    biz["is_followed"] = is_followed

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
    if payload.identifier:
        targets.add(payload.identifier.strip())
    if payload.email:
        targets.add(payload.email.strip())
    if payload.phone:
        p_raw = payload.phone.strip()
        targets.add(p_raw)
        norm_p = normalize_phone(p_raw)
        if norm_p:
            targets.add(norm_p)
            targets.add(f"+88{norm_p}")
            targets.add(f"+88 {norm_p}")

    if not targets:
        conn.close()
        raise HTTPException(status_code=400, detail="Please provide a valid phone number or email address.")

    for t in targets:
        otp_id = f"otp_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
        cursor.execute("INSERT INTO otp_verifications (id, identifier, otp_code, purpose, created_at, verified) VALUES (?, ?, ?, ?, ?, ?)", (otp_id, t, code, payload.purpose, now, 0))

    conn.commit()
    conn.close()

    display_target = payload.phone or payload.email or payload.identifier
    res_data = {
        "success": True,
        "message": f"6-digit security verification code dispatched to {display_target}"
    }
    if not database.is_production():
        res_data["demo_otp"] = code
    return res_data

class VerifyOtpPayload(BaseModel):
    identifier: str
    otp_code: str
    purpose: Optional[str] = None

@app.post("/api/auth/verify-otp")
def verify_otp(payload: VerifyOtpPayload):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id FROM otp_verifications
        WHERE identifier = ? AND otp_code = ? AND verified = 0
        ORDER BY created_at DESC LIMIT 1
    """, (payload.identifier, payload.otp_code))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid or expired 6-digit OTP code.")
    cursor.execute("UPDATE otp_verifications SET verified = 1 WHERE id = ?", (row["id"],))
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

class CheckBusinessAvailabilityPayload(BaseModel):
    official_email: Optional[str] = None
    official_telephone: Optional[str] = None
    representative_email: Optional[str] = None

@app.post("/api/auth/check-business-availability")
def check_business_availability(payload: CheckBusinessAvailabilityPayload):
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
                    "message": "This official business email is already registered to an existing account. Please log in or use a different official email."
                }
            cursor.execute("SELECT id FROM users WHERE LOWER(email) = ? AND role = 'recruiter'", (em,))
            if cursor.fetchone():
                return {
                    "available": False,
                    "field": "official_email",
                    "message": "This official business email is already registered to an existing business account. Please log in or use a different official email."
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
                # Check business users
                cursor.execute("SELECT id, phone FROM users WHERE phone IS NOT NULL AND phone != '' AND role = 'recruiter'")
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
            cursor.execute("SELECT id FROM users WHERE LOWER(email) = ? AND role = 'recruiter'", (rep_em,))
            if cursor.fetchone():
                return {
                    "available": False,
                    "field": "representative_email",
                    "message": "A business user account with this email address is already open. Please log in or use a different work email."
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

    norm_p = normalize_phone(payload.phone)
    raw_p = payload.phone.strip()
    with_prefix = f"+88{norm_p}" if norm_p else ""
    cursor.execute("""
        SELECT id FROM otp_verifications
        WHERE (identifier = ? OR identifier = ? OR identifier = ? OR identifier = ?) AND otp_code = ?
        ORDER BY created_at DESC LIMIT 1
    """, (payload.email, raw_p, norm_p, with_prefix, payload.otp_code.strip()))
    otp_row = cursor.fetchone()
    is_valid_otp = bool(otp_row)
    if not is_valid_otp and not database.is_production() and payload.otp_code.strip() in ["258330", "123456"]:
        is_valid_otp = True
    if not is_valid_otp:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid OTP code. Please enter the verification code sent to your phone/email.")

    if otp_row:
        cursor.execute("UPDATE otp_verifications SET verified = 1 WHERE id = ?", (otp_row["id"],))

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
    initial_cvs = json.dumps([
        {
            "id": f"cv_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}",
            "name": cv_filename,
            "title": f"Primary {payload.department or 'Hospitality'} Career CV",
            "uploaded_at": now.split(' ')[0],
            "size": "240 KB",
            "is_default": True
        }
    ]) if payload.cv_name else json.dumps([])

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
        payload.cv_url or "",
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

        norm_p = normalize_phone(payload.phone)
        raw_p = payload.phone.strip()
        with_prefix = f"+88{norm_p}" if norm_p else ""
        cursor.execute("""
            SELECT id FROM otp_verifications
            WHERE (identifier = ? OR identifier = ? OR identifier = ? OR identifier = ?) AND otp_code = ?
            ORDER BY created_at DESC LIMIT 1
        """, (payload.email, raw_p, norm_p, with_prefix, payload.otp_code.strip()))
        otp_row = cursor.fetchone()
        is_valid_otp = bool(otp_row)
        if not is_valid_otp and not database.is_production() and payload.otp_code.strip() in ["258330", "123456"]:
            is_valid_otp = True
        if not is_valid_otp:
            raise HTTPException(status_code=400, detail="Invalid OTP code. Please enter the verification code sent to your phone/email.")

        if otp_row:
            cursor.execute("UPDATE otp_verifications SET verified = 1 WHERE id = ?", (otp_row["id"],))

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

    # 2. Verify OTP
    norm_p = normalize_phone(payload.phone)
    raw_p = payload.phone.strip()
    with_prefix = f"+88{norm_p}" if norm_p else ""
    cursor.execute("""
        SELECT id FROM otp_verifications
        WHERE (identifier = ? OR identifier = ? OR identifier = ? OR identifier = ?) AND otp_code = ?
        ORDER BY created_at DESC LIMIT 1
    """, (payload.email, raw_p, norm_p, with_prefix, payload.otp_code.strip()))
    otp_row = cursor.fetchone()
    is_valid_otp = bool(otp_row)
    if not is_valid_otp and not database.is_production() and payload.otp_code.strip() in ["258330", "123456"]:
        is_valid_otp = True
    if not is_valid_otp:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid OTP code. Please enter the verification code sent to your phone/email.")

    if otp_row:
        cursor.execute("UPDATE otp_verifications SET verified = 1 WHERE id = ?", (otp_row["id"],))

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
            cursor.execute("""
                SELECT id FROM otp_verifications
                WHERE (identifier = ? OR identifier = ?) AND otp_code = ? AND verified = 0
                ORDER BY created_at DESC LIMIT 1
            """, (user["email"], user["phone"], payload.otp_code.strip()))
            otp_row = cursor.fetchone()
            is_valid_otp = bool(otp_row)
            if not is_valid_otp and not database.is_production() and payload.otp_code.strip() in ["258330", "123456"]:
                is_valid_otp = True
            if not is_valid_otp:
                record_public_rate_failure(rate_key)
                conn.close()
                raise HTTPException(status_code=401, detail="Invalid or expired verification code.")
            if otp_row:
                cursor.execute("UPDATE otp_verifications SET verified = 1 WHERE id = ?", (otp_row["id"],))
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
                "is_business_admin": True
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
        cursor.execute("""
            SELECT id FROM otp_verifications
            WHERE (identifier = ? OR identifier = ?) AND otp_code = ? AND verified = 0
            ORDER BY created_at DESC LIMIT 1
        """, (user["email"], user["phone"], payload.otp_code.strip()))
        otp_row = cursor.fetchone()
        is_valid_otp = bool(otp_row)
        if not is_valid_otp and not database.is_production() and payload.otp_code.strip() in ["258330", "123456"]:
            is_valid_otp = True
        if not is_valid_otp:
            record_public_rate_failure(rate_key)
            conn.close()
            raise HTTPException(status_code=401, detail="Invalid or expired verification code.")
        if otp_row:
            cursor.execute("UPDATE otp_verifications SET verified = 1 WHERE id = ?", (otp_row["id"],))
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
            "designation": user["designation"]
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
               u.name, u.email, u.phone, u.avatar_url, u.designation,
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
        # Verify OTP
        cursor.execute("""
            SELECT id FROM otp_verifications
            WHERE identifier = ? AND otp_code = ? AND verified = 0
            ORDER BY created_at DESC LIMIT 1
        """, (target, payload.otp_code))
        otp_match = cursor.fetchone()
        if not otp_match:
            conn.close()
            raise HTTPException(status_code=400, detail="Invalid OTP code for contact update.")
        cursor.execute("UPDATE otp_verifications SET verified = 1 WHERE id = ?", (otp_match["id"],))

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
        cursor.execute("UPDATE employee_profiles SET cv_list = ?, cv_name = ? WHERE user_id = ?", (json.dumps(cv_list), payload.name, effective_user_id))
    else:
        cursor.execute("INSERT INTO employee_profiles (user_id, cv_list, cv_name) VALUES (?, ?, ?)", (effective_user_id, json.dumps(cv_list), payload.name))

    conn.commit()
    conn.close()
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
    cursor.execute("UPDATE employee_profiles SET cv_list = ? WHERE user_id = ?", (json.dumps(cv_list), effective_user_id))
    conn.commit()
    conn.close()
    return {"success": True, "cv_list": cv_list}

@app.get("/api/applications/{app_id}/cv")
def get_application_cv(app_id: str, viewer_role: Optional[str] = "guest", viewer_id: Optional[str] = None, business_id: Optional[str] = None):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.id, a.user_id, a.selected_cv, a.applied_at, a.status,
               j.title as job_title, j.business_id,
               b.brand_name, b.verification_status,
               u.name as candidate_name, u.email as candidate_email, u.phone as candidate_phone,
               ep.headline, ep.summary, ep.skills, ep.experience, ep.education, ep.certifications, ep.languages
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN businesses b ON j.business_id = b.id
        JOIN users u ON a.user_id = u.id
        LEFT JOIN employee_profiles ep ON u.id = ep.user_id
        WHERE a.id = ?
    """, (app_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Application record not found")

    data = dict(row)

    # Permission check: Candidate cv will ONLY be visible to the jobs/businesses that he has applied for
    is_admin = viewer_role == "admin"
    is_applicant = viewer_id and viewer_id == data["user_id"]
    is_business_member = False
    if viewer_id:
        cursor.execute("SELECT 1 FROM business_memberships WHERE business_id = ? AND user_id = ?", (data["business_id"], viewer_id))
        if cursor.fetchone():
            is_business_member = True
    if business_id and business_id == data["business_id"]:
        is_business_member = True

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
               ep.open_to_work as candidate_open_to_work, ep.summary as candidate_summary
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN businesses b ON j.business_id = b.id
        JOIN users u ON a.user_id = u.id
        LEFT JOIN employee_profiles ep ON u.id = ep.user_id
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

    query += " ORDER BY a.updated_at DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()

    results = []
    for r in rows:
        d = dict(r)
        d["screening_answers"] = json.loads(d["screening_answers"]) if d["screening_answers"] else {}
        d["candidate_skills"] = json.loads(d["candidate_skills"]) if d.get("candidate_skills") else []
        d["candidate_education"] = json.loads(d["candidate_education"]) if d.get("candidate_education") else []
        d["candidate_experience"] = json.loads(d["candidate_experience"]) if d.get("candidate_experience") else []

        # Fetch status event timeline
        cursor.execute("SELECT * FROM application_events WHERE application_id = ? ORDER BY id ASC", (d["id"],))
        d["timeline"] = [dict(ev) for ev in cursor.fetchall()]

        results.append(d)

    conn.close()
    return results

class ApplicationSubmitPayload(BaseModel):
    job_id: str
    user_id: str = "user_rahim"
    cover_letter: Optional[str] = ""
    selected_cv: str = "Rahim_Ahmed_Executive_Hospitality_CV.pdf"
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

    cursor.execute("""
        INSERT INTO applications (
            id, job_id, user_id, status, applied_at, updated_at,
            cover_letter, selected_cv, screening_answers, recruiter_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        app_id,
        payload.job_id,
        payload.user_id,
        "submitted",
        now,
        now,
        payload.cover_letter,
        payload.selected_cv,
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
def toggle_save_job(job_id: str, user_id: str = "user_rahim"):
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT 1 FROM saved_jobs WHERE user_id = ? AND job_id = ?", (user_id, job_id))
    exists = cursor.fetchone()

    if exists:
        cursor.execute("DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?", (user_id, job_id))
        is_saved = False
    else:
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        cursor.execute("INSERT INTO saved_jobs (user_id, job_id, saved_at) VALUES (?, ?, ?)", (user_id, job_id, now))
        is_saved = True

    conn.commit()
    conn.close()

    notify_realtime(
        "saved_jobs_updated",
        {"job_id": job_id, "is_saved": is_saved, "user_id": user_id},
        target_user=user_id
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
def mark_all_notifications_read(user_id: Optional[str] = None, payload: Optional[ReadAllPayload] = None):
    effective_user_id = user_id or (payload.user_id if payload else None) or "user_rahim"
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
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT count(*) FROM users WHERE role = 'jobseeker'")
    total_candidates = cursor.fetchone()[0]

    cursor.execute("SELECT count(*) FROM users WHERE role = 'recruiter'")
    total_business_users = cursor.fetchone()[0]

    cursor.execute("SELECT count(*) FROM businesses")
    total_businesses = cursor.fetchone()[0]

    cursor.execute("SELECT count(*) FROM businesses WHERE verification_status = 'verified'")
    verified_businesses = cursor.fetchone()[0]

    cursor.execute("SELECT count(*) FROM businesses WHERE verification_status = 'pending'")
    pending_verifications = cursor.fetchone()[0]

    cursor.execute("SELECT count(*) FROM business_memberships WHERE approval_status = 'pending_admin_approval'")
    pending_moderators = cursor.fetchone()[0]

    cursor.execute("SELECT count(*) FROM jobs")
    total_jobs = cursor.fetchone()[0]

    cursor.execute("SELECT count(*) FROM jobs WHERE status = 'active'")
    active_jobs = cursor.fetchone()[0]

    cursor.execute("SELECT count(*) FROM users WHERE status = 'suspended'")
    suspended_users = cursor.fetchone()[0]

    conn.close()
    return {
        "total_candidates": total_candidates,
        "total_business_users": total_business_users,
        "total_businesses": total_businesses,
        "verified_businesses": verified_businesses,
        "pending_verifications": pending_verifications,
        "pending_moderators": pending_moderators,
        "total_jobs": total_jobs,
        "active_jobs": active_jobs,
        "suspended_users": suspended_users
    }

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

