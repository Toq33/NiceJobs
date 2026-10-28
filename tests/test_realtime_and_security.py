import json
import time
import requests
import asyncio
import websockets

BASE_URL = "http://127.0.0.1:8001"
WS_URL = "ws://127.0.0.1:8001/ws"

def test_login_and_auth():
    print("--> Testing login and auth...")
    # 1. Candidate login
    cand_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "someonee@gmail.com",
        "password": "123456",
        "role": "jobseeker"
    })
    assert cand_resp.status_code == 200, f"Candidate login failed: {cand_resp.text}"
    cand_user = cand_resp.json()["user"]
    print(f"    Candidate logged in: {cand_user['name']} (ID: {cand_user['id']})")

    # 2. Recruiter login
    rec_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "business_email": "hrs@radissondhaka.com",
        "email": "far@radissondhaka.com",
        "password": "123456",
        "role": "recruiter"
    })
    assert rec_resp.status_code == 200, f"Recruiter login failed: {rec_resp.text}"
    rec_user = rec_resp.json()["user"]
    print(f"    Recruiter logged in: {rec_user['name']} (ID: {rec_user['id']})")

    # 3. Test wrong password
    bad_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "someonee@gmail.com",
        "password": "WrongPassword999!",
        "role": "jobseeker"
    })
    assert bad_resp.status_code == 401, f"Expected 401 on bad password, got {bad_resp.status_code}"
    print("    Wrong password correctly rejected with 401.")

def test_file_upload_security():
    print("--> Testing file upload security...")
    # Attempt to upload disallowed .exe file
    files = {'file': ('malicious.exe', b'MZ executable content', 'application/x-msdownload')}
    resp = requests.post(f"{BASE_URL}/api/messages/upload", files=files)
    assert resp.status_code == 400, f"Expected 400 on .exe upload, got {resp.status_code}"
    print("    Disallowed file type (.exe) correctly blocked with 400.")

    # Upload allowed PDF file
    files = {'file': ('resume.pdf', b'%PDF-1.4 sample pdf content', 'application/pdf')}
    resp = requests.post(f"{BASE_URL}/api/messages/upload", files=files)
    assert resp.status_code == 200, f"Failed to upload valid PDF: {resp.text}"
    data = resp.json()
    assert data["success"] is True and "file_url" in data
    print(f"    Allowed file type (.pdf) successfully uploaded: {data['file_url']}")

async def test_websocket_realtime():
    print("--> Testing WebSocket realtime dispatch...")
    user_id = "user_1792756801_3ff6a7"
    received_events = []

    async with websockets.connect(f"{WS_URL}?user_id={user_id}") as ws:
        # Wait for connected greeting
        greeting = await asyncio.wait_for(ws.recv(), timeout=5.0)
        greet_data = json.loads(greeting)
        assert greet_data.get("type") == "connection_established", f"Unexpected greeting: {greeting}"
        print("    WebSocket client connected and received handshake.")

        # Trigger a test realtime event
        test_payload = {
            "type": "notification_created",
            "data": {"title": "Realtime Audit Test", "message": "Testing multi-client delivery"},
            "target_user": user_id
        }
        emit_resp = requests.post(f"{BASE_URL}/api/realtime/test-emit", json=test_payload)
        assert emit_resp.status_code == 200, f"Failed to emit test event: {emit_resp.text}"

        # Receive until notification_created
        evt = None
        for _ in range(5):
            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            candidate = json.loads(msg)
            if candidate.get("type") == "notification_created":
                evt = candidate
                break
        assert evt is not None, "Did not receive notification_created event"
        assert evt.get("data", {}).get("title") == "Realtime Audit Test"
        assert "event_id" in evt and "timestamp" in evt
        print(f"    Received realtime event via WebSocket: {evt['type']} (event_id: {evt['event_id']})")

async def test_end_to_end_mutation_events():
    print("--> Testing End-to-End Realtime Mutation Events...")
    user_id = "user_1792756801_3ff6a7" # Rahim (candidate)
    biz_id = "biz_1792756972_a86aa5" # Radisson Black

    # Connect candidate WebSocket
    async with websockets.connect(f"{WS_URL}?user_id={user_id}") as cand_ws:
        await cand_ws.recv() # Handshake

        # Connect business WebSocket
        async with websockets.connect(f"{WS_URL}?business_id={biz_id}") as biz_ws:
            await biz_ws.recv() # Handshake

            # 1. Test saved-jobs toggle
            save_resp = requests.post(f"{BASE_URL}/api/saved-jobs/job_1792830314_31d109?user_id={user_id}")
            assert save_resp.status_code == 200, f"Saved job toggle failed: {save_resp.text}"
            
            # Candidate should receive saved_jobs_updated
            msg = await asyncio.wait_for(cand_ws.recv(), timeout=5.0)
            evt = json.loads(msg)
            # Drain any presence events if present
            while evt.get("type") == "presence:update":
                msg = await asyncio.wait_for(cand_ws.recv(), timeout=5.0)
                evt = json.loads(msg)
            assert evt.get("type") == "saved_jobs_updated", f"Expected saved_jobs_updated, got: {evt}"
            print(f"    [Candidate] Verified realtime event: {evt['type']}")

            # 2. Test notifications mark all as read
            read_resp = requests.post(f"{BASE_URL}/api/notifications/read-all?user_id={user_id}")
            assert read_resp.status_code == 200, f"Read all failed: {read_resp.text}"
            msg = await asyncio.wait_for(cand_ws.recv(), timeout=5.0)
            evt = json.loads(msg)
            while evt.get("type") == "presence:update":
                msg = await asyncio.wait_for(cand_ws.recv(), timeout=5.0)
                evt = json.loads(msg)
            assert evt.get("type") == "notifications_read", f"Expected notifications_read, got: {evt}"
            print(f"    [Candidate] Verified realtime event: {evt['type']}")

            # 3. Test chat message broadcast
            send_payload = {
                "conversation_id": "conv_1792835049_c03a2d",
                "sender_id": user_id,
                "sender_role": "candidate",
                "sender_name": "Rahim Hossain",
                "content": "Automated verification real-time message stream!"
            }
            msg_resp = requests.post(f"{BASE_URL}/api/messages", json=send_payload)
            assert msg_resp.status_code == 200, f"Message send failed: {msg_resp.text}"

            # Business (recipient) receives chat_message
            b_msg = await asyncio.wait_for(biz_ws.recv(), timeout=5.0)
            b_evt = json.loads(b_msg)
            while b_evt.get("type") == "presence:update":
                b_msg = await asyncio.wait_for(biz_ws.recv(), timeout=5.0)
                b_evt = json.loads(b_msg)
            assert b_evt.get("type") == "chat_message", f"Expected chat_message on business, got: {b_evt}"
            print(f"    [Business] Successfully received chat_message via WebSocket: {b_evt['data']['message_id']}")

def main():
    test_login_and_auth()
    test_file_upload_security()
    asyncio.run(test_websocket_realtime())
    asyncio.run(test_end_to_end_mutation_events())
    print("\n=======================================================")
    print("[ALL PASS] Real-Time & Security Suite Verified 100% OK!")
    print("=======================================================")

if __name__ == "__main__":
    main()
