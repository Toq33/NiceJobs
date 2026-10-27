import asyncio
import json
import os
import subprocess
import time
import requests
import websockets

BASE_URL = "http://127.0.0.1:8001"
CANDIDATE_USER_ID = "user_1792756801_3ff6a7"
CONVERSATION_ID = "conv_1792835049_c03a2d"

_next_id = 100

async def cdp_eval(ws, expr):
    global _next_id
    _next_id += 1
    my_id = _next_id
    await ws.send(json.dumps({
        "id": my_id,
        "method": "Runtime.evaluate",
        "params": {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True
        }
    }))
    while True:
        res = json.loads(await ws.recv())
        if res.get("id") == my_id:
            if "exceptionDetails" in res.get("result", {}):
                print(f"CDP Eval error for {my_id}: {res['result']['exceptionDetails']}")
            val = res.get("result", {}).get("result", {}).get("value")
            return val

async def main():
    print("Launching Chromium...")
    chrome_proc = subprocess.Popen([
        "/snap/bin/chromium",
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--remote-debugging-port=9222",
        "http://127.0.0.1:8001"
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    pages = None
    for _ in range(15):
        await asyncio.sleep(1.0)
        try:
            pages = requests.get("http://127.0.0.1:9222/json", timeout=2).json()
            if pages:
                break
        except Exception:
            pass

    try:
        assert pages, "No pages returned from CDP"
        target = next((p for p in pages if p.get("type") == "page" and "8001" in p.get("url", "")), None)
        assert target, f"No NiceJobs page found in {pages}"
        ws_url = target["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url) as ws:
            print("Connected to Chromium CDP")
            await ws.send(json.dumps({"id": 1, "method": "Page.enable"}))
            await ws.send(json.dumps({"id": 2, "method": "Runtime.enable"}))

            print("Waiting for page and app.js to load...")
            for i in range(25):
                loaded = await cdp_eval(ws, "typeof window.quickLoginCandidate === 'function'")
                if loaded is True:
                    print(f"✅ app.js loaded after attempt {i+1}")
                    break
                await asyncio.sleep(0.5)
            assert loaded is True, "app.js failed to load in browser"

            # 1. Quick login as Candidate dfdf
            print("Simulating candidate login via quickLoginCandidate()...")
            login_res = await cdp_eval(ws, """
                (async () => {
                    await window.quickLoginCandidate();
                    return window.state.currentUser ? window.state.currentUser.name : null;
                })()
            """)
            print(f"Logged in user: {login_res}")
            assert login_res == "dfdf", f"Expected dfdf, got {login_res}"

            # Wait 1s for handshake and initial sync
            await asyncio.sleep(1.0)

            # 2. Check realtime WebSocket connection status in browser
            print("Checking WebSocket connection status in browser...")
            ws_state = -1
            for _ in range(15):
                ws_state = await cdp_eval(ws, "window.realtimeSocket ? window.realtimeSocket.readyState : -1")
                if ws_state == 1:
                    print("✅ Browser WebSocket state: OPEN (1)")
                    break
                await asyncio.sleep(0.5)
            assert ws_state == 1, f"WebSocket not open: {ws_state}"

            # 3. Wait for inbox chat stream to mount in DOM
            print("Waiting for inbox chat stream to mount in DOM...")
            chat_mounted = False
            for _ in range(20):
                chat_mounted = await cdp_eval(ws, "document.getElementById('chat-stream-scroll') !== null")
                if chat_mounted is True:
                    print("✅ Chat stream mounted in DOM")
                    break
                await asyncio.sleep(0.5)

            # 4. Check initial notification badge
            initial_badge = await cdp_eval(ws, """
                (() => {
                    const b = document.getElementById('notif-badge');
                    return b ? parseInt(b.textContent || '0', 10) : 0;
                })()
            """)
            print(f"Initial notification badge count: {initial_badge}")

            # 5. Trigger backend real-time chat message to this candidate
            print("Triggering real-time message on backend...")
            unique_alert_title = f"Alert {int(time.time())}"
            notif_trigger = requests.post(f"{BASE_URL}/api/messages", json={
                "conversation_id": CONVERSATION_ID,
                "sender_id": "user_1792756972_f8fa67",
                "sender_name": "Radisson Black Recruiter",
                "sender_role": "business",
                "content": f"Live automated test message: {unique_alert_title}"
            })
            assert notif_trigger.status_code == 200, f"Status: {notif_trigger.status_code}"

            # 6. Wait for browser DOM to update in real time WITHOUT REFRESH
            print("Waiting for DOM to update automatically...")
            updated = False
            for poll in range(15):
                await asyncio.sleep(0.5)
                dom_info = await cdp_eval(ws, f"""
                    (() => {{
                        const toasts = Array.from(document.querySelectorAll('.toast')).map(t => t.textContent).join(' ');
                        const badge = document.getElementById('notif-badge')?.textContent || '0';
                        const bodyText = document.body.innerText || '';
                        const hasText = bodyText.includes("{unique_alert_title}");
                        return {{ toasts, badge, hasText }};
                    }})()
                """)
                print(f"Poll {poll+1} DOM state: {dom_info}")
                if dom_info.get("hasText") or "Radisson Black Recruiter" in dom_info.get("toasts", "") or dom_info.get("badge") != str(initial_badge):
                    print(f"✅ Real-time DOM update detected: {dom_info}")
                    updated = True
                    break

            assert updated, "DOM did not update in real-time"

            # 6. Take a screenshot of the live updated UI
            screenshot_path = "/home/dexter/.gemini/antigravity-ide/brain/21992588-97e5-45b3-88eb-5614d94fede2/.tempmediaStorage/realtime_live_verification.png"
            os.makedirs(os.path.dirname(screenshot_path), exist_ok=True)
            global _next_id
            _next_id += 1
            ss_id = _next_id
            await ws.send(json.dumps({
                "id": ss_id,
                "method": "Page.captureScreenshot",
                "params": {"format": "png"}
            }))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == ss_id:
                    import base64
                    img_data = base64.b64decode(msg["result"]["data"])
                    with open(screenshot_path, "wb") as f:
                        f.write(img_data)
                    print(f"📸 Live UI verification screenshot saved: {screenshot_path}")
                    break

            print("\n🎉 BROWSER REAL-TIME DOM TEST COMPLETED SUCCESSFULLY!")

    finally:
        chrome_proc.terminate()
        chrome_proc.wait()

if __name__ == "__main__":
    asyncio.run(main())
