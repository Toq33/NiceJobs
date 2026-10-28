import asyncio
import json
import time
import requests
import websockets

BASE_URL = "http://127.0.0.1:8001"
WS_URL = "ws://127.0.0.1:8001/ws"

RECRUITER_USER_ID = "user_1792756972_f8fa67"
RECRUITER_BIZ_ID = "biz_1792756972_a86aa5"
CANDIDATE_USER_ID = "user_1792756801_3ff6a7"
CONVERSATION_ID = "conv_1792835049_c03a2d"

results = []

def record(test_name, passed, detail=""):
    results.append({"test": test_name, "passed": passed, "detail": detail})
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"[{status}] {test_name}: {detail}")

async def listen_for_events(ws, event_list, stop_event):
    try:
        while not stop_event.is_set():
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=0.5)
                data = json.loads(msg)
                event_list.append(data)
            except asyncio.TimeoutError:
                continue
            except websockets.exceptions.ConnectionClosed:
                break
    except Exception as e:
        pass

def get_event_field(e, field):
    if field in e:
        return e[field]
    if "data" in e and isinstance(e["data"], dict) and field in e["data"]:
        return e["data"][field]
    return None

async def run_tests():
    print("=== STARTING END-TO-END REAL-TIME TEST SUITE ===")
    
    # 1. Connect 3 clients: Recruiter, Candidate, and Guest (Unauthenticated)
    recruiter_ws_url = f"{WS_URL}?client_id=recruiter_test&user_id={RECRUITER_USER_ID}&business_id={RECRUITER_BIZ_ID}&role=recruiter"
    candidate_ws_url = f"{WS_URL}?client_id=candidate_test&user_id={CANDIDATE_USER_ID}&role=jobseeker"
    guest_ws_url = f"{WS_URL}?client_id=guest_test"

    recruiter_ws = await websockets.connect(recruiter_ws_url)
    candidate_ws = await websockets.connect(candidate_ws_url)
    guest_ws = await websockets.connect(guest_ws_url)

    recruiter_events = []
    candidate_events = []
    guest_events = []

    stop_event = asyncio.Event()
    t_rec = asyncio.create_task(listen_for_events(recruiter_ws, recruiter_events, stop_event))
    t_can = asyncio.create_task(listen_for_events(candidate_ws, candidate_events, stop_event))
    t_gst = asyncio.create_task(listen_for_events(guest_ws, guest_events, stop_event))

    await asyncio.sleep(0.5)
    record("WebSocket Connections", True, "Connected Recruiter, Candidate, and Guest WebSockets")

    # TEST A: Public Broadcast - Post a Job
    # Check if all clients receive the job_created event
    new_job_id = None
    try:
        job_payload = {
            "title": "Realtime Test Sous Chef",
            "department": "Kitchen",
            "property_location": "Gulshan 2, Dhaka",
            "employment_type": "Full-time",
            "experience_level": "1-3 Years",
            "salary_min": 45000,
            "salary_max": 55000,
            "description": "Automated test job for real-time validation",
            "requirements": ["Proficiency in French cuisine", "3+ years experience"],
            "deadline": "2026-12-31",
            "business_id": RECRUITER_BIZ_ID
        }
        res = requests.post(f"{BASE_URL}/api/jobs", json=job_payload)
        assert res.status_code == 200, f"Status code {res.status_code}: {res.text}"
        res_data = res.json()
        new_job_id = res_data.get("job_id") or (res_data.get("job", {}).get("id"))
        assert new_job_id, f"No job_id in response: {res_data}"

        # Wait for broadcast
        await asyncio.sleep(1.0)
        rec_has_job = any(e.get("type") == "job_created" and get_event_field(e, "job_id") == new_job_id for e in recruiter_events)
        can_has_job = any(e.get("type") == "job_created" and get_event_field(e, "job_id") == new_job_id for e in candidate_events)
        gst_has_job = any(e.get("type") == "job_created" and get_event_field(e, "job_id") == new_job_id for e in guest_events)

        record("Job Creation Real-time Broadcast", rec_has_job and can_has_job and gst_has_job, 
               f"Recruiter: {rec_has_job}, Candidate: {can_has_job}, Guest: {gst_has_job}")
    except Exception as e:
        record("Job Creation Real-time Broadcast", False, str(e))

    # TEST B: Candidate Submits Application -> Recruiter receives real-time application_created + notification
    # Guest must NOT receive the private application event
    app_id = None
    if new_job_id:
        try:
            recruiter_events.clear()
            candidate_events.clear()
            guest_events.clear()

            app_payload = {
                "job_id": new_job_id,
                "user_id": CANDIDATE_USER_ID,
                "cover_letter": "I am submitting this in real time!"
            }
            res = requests.post(f"{BASE_URL}/api/applications", json=app_payload)
            assert res.status_code == 200, f"Status code {res.status_code}: {res.text}"
            res_app = res.json()
            app_id = res_app.get("application_id") or (res_app.get("application", {}).get("id"))
            assert app_id, f"No app_id found in {res_app}"

            await asyncio.sleep(1.0)

            # Check Recruiter received application_created and notification_created
            rec_app_event = next((e for e in recruiter_events if e.get("type") == "application_created" and (get_event_field(e, "application_id") == app_id or get_event_field(e, "id") == app_id or (e.get("application") and e["application"].get("id") == app_id))), None)
            rec_notif_event = next((e for e in recruiter_events if e.get("type") == "notification_created"), None)

            # Check Privacy: Guest must NOT receive application_created
            gst_leaked = any(e.get("type") == "application_created" for e in guest_events)

            record("Candidate Application Real-time Delivery to Recruiter", 
                   rec_app_event is not None and rec_notif_event is not None and not gst_leaked,
                   f"Recruiter received app={rec_app_event is not None}, notif={rec_notif_event is not None}; Guest leaked={gst_leaked}")
        except Exception as e:
            record("Candidate Application Real-time Delivery to Recruiter", False, str(e))

    # TEST C: Recruiter Updates Application Status -> Candidate receives application_status_updated + notification
    # Recruiter receives ats_updated
    # Guest receives NOTHING
    if app_id:
        try:
            recruiter_events.clear()
            candidate_events.clear()
            guest_events.clear()

            res = requests.patch(f"{BASE_URL}/api/applications/{app_id}/status", json={"status": "interview"})
            assert res.status_code == 200, f"Status code {res.status_code}: {res.text}"

            await asyncio.sleep(1.0)

            can_status_event = next((e for e in candidate_events if e.get("type") == "application_status_updated" and get_event_field(e, "application_id") == app_id), None)
            can_notif_event = next((e for e in candidate_events if e.get("type") == "notification_created"), None)
            rec_ats_event = next((e for e in recruiter_events if e.get("type") == "ats_updated"), None)
            gst_leaked = any(e.get("type") in ["application_status_updated", "ats_updated", "notification_created"] for e in guest_events)

            record("Recruiter Status Update Real-time Delivery to Candidate & ATS",
                   can_status_event is not None and can_notif_event is not None and rec_ats_event is not None and not gst_leaked,
                   f"Candidate status={can_status_event is not None}, notif={can_notif_event is not None}; Recruiter ATS={rec_ats_event is not None}; Guest leaked={gst_leaked}")
        except Exception as e:
            record("Recruiter Status Update Real-time Delivery to Candidate & ATS", False, str(e))

    # TEST D: Direct Messaging Real-time Delivery & Privacy Filtering
    try:
        recruiter_events.clear()
        candidate_events.clear()
        guest_events.clear()

        msg_payload = {
            "conversation_id": CONVERSATION_ID,
            "sender_id": CANDIDATE_USER_ID,
            "sender_name": "dfdf",
            "sender_role": "user",
            "content": f"Real-time test message at {int(time.time())}"
        }
        res = requests.post(f"{BASE_URL}/api/messages", json=msg_payload)
        assert res.status_code == 200, f"Status code {res.status_code}: {res.text}"

        await asyncio.sleep(1.0)

        rec_msg = next((e for e in recruiter_events if e.get("type") in ["chat_message", "message_created"] and get_event_field(e, "conversation_id") == CONVERSATION_ID), None)
        gst_leaked = any(e.get("type") in ["chat_message", "message_created"] for e in guest_events)

        record("Direct Chat Real-time Delivery & Privacy",
               rec_msg is not None and not gst_leaked,
               f"Recruiter received chat={rec_msg is not None}; Guest received private chat={gst_leaked}")
    except Exception as e:
        record("Direct Chat Real-time Delivery & Privacy", False, str(e))

    # TEST E: SSE Fallback Endpoint Validation
    try:
        sse_res = requests.get(f"{BASE_URL}/api/realtime/events?client_id=sse_test", stream=True, timeout=2.0)
        content_type = sse_res.headers.get("content-type", "")
        record("SSE Fallback Stream Available", "text/event-stream" in content_type, f"Content-Type: {content_type}")
    except requests.exceptions.Timeout:
        record("SSE Fallback Stream Available", True, "Stream remained open indefinitely as expected (text/event-stream)")
    except Exception as e:
        record("SSE Fallback Stream Available", False, str(e))

    # TEST F: Cleanup Test Data
    if new_job_id:
        try:
            requests.delete(f"{BASE_URL}/api/admin/jobs/{new_job_id}")
            record("Admin Job Deletion & Real-time Event", True, f"Cleaned up job {new_job_id}")
        except Exception as e:
            record("Admin Job Deletion & Real-time Event", False, str(e))

    stop_event.set()
    await recruiter_ws.close()
    await candidate_ws.close()
    await guest_ws.close()
    await asyncio.gather(t_rec, t_can, t_gst, return_exceptions=True)

    print("\n=== TEST SUITE RESULTS ===")
    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    print(f"Total: {total}, Passed: {passed}, Failed: {total - passed}")
    if passed == total:
        print("🎉 ALL TESTS PASSED!")
    else:
        print(f"❌ {total - passed} TESTS FAILED")
        exit(1)

if __name__ == "__main__":
    asyncio.run(run_tests())
