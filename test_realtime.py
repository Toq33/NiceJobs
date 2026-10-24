import asyncio
import json
import websockets
import requests
import sys

BASE_HTTP = "http://localhost:8000"
BASE_WS = "ws://localhost:8000/ws"

async def wait_for_event(ws, expected_types, timeout=6.0):
    """Waits for an event matching any of expected_types, ignoring unrelated queued events."""
    if isinstance(expected_types, str):
        expected_types = [expected_types]
    end_time = asyncio.get_event_loop().time() + timeout
    while True:
        remaining = end_time - asyncio.get_event_loop().time()
        if remaining <= 0:
            raise TimeoutError(f"Timed out waiting for any of {expected_types}")
        raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        evt = json.loads(raw)
        evt_type = evt.get("type")
        if evt_type in expected_types:
            return evt

async def test_realtime_suite():
    print("=" * 60)
    print("🚀 NICEJOBS COMPREHENSIVE REAL-TIME VERIFICATION")
    print("=" * 60)

    user_a = "user_1792756801_3ff6a7" # Candidate dfdf
    recruiter_b = "user_1792756972_f8fa67" # Recruiter far
    biz_b = "biz_1792756972_a86aa5"
    conv_id = "conv_1792835049_c03a2d"

    # 1. Connect two WebSocket clients
    print("\n[Step 1] Establishing WebSocket connections for Candidate and Recruiter...")
    async with websockets.connect(BASE_WS) as ws_candidate, \
               websockets.connect(BASE_WS) as ws_recruiter:

        # Identify Candidate
        await ws_candidate.send(json.dumps({
            "action": "identify",
            "user_id": user_a,
            "business_id": None,
            "role": "jobseeker"
        }))
        ack_cand = await wait_for_event(ws_candidate, "identified")
        print("  ✓ Candidate connected and identified on WebSocket")

        # Identify Recruiter
        await ws_recruiter.send(json.dumps({
            "action": "identify",
            "user_id": recruiter_b,
            "business_id": biz_b,
            "role": "recruiter"
        }))
        ack_rec = await wait_for_event(ws_recruiter, "identified")
        print("  ✓ Recruiter connected and identified on WebSocket")

        # 2. Test Real-time Chat Messaging
        print("\n[Step 2] Testing Bidirectional Real-time Chat Messaging...")
        msg_text = f"Real-time automated sync test message at {asyncio.get_event_loop().time()}"
        res = requests.post(f"{BASE_HTTP}/api/messages", json={
            "conversation_id": conv_id,
            "sender_id": user_a,
            "sender_name": "dfdf Candidate",
            "sender_role": "jobseeker",
            "content": msg_text
        })
        assert res.status_code == 200, f"Failed to post message: {res.text}"

        rec_event = await wait_for_event(ws_recruiter, "chat_message")
        print(f"  ✓ Recruiter received live chat message: '{rec_event.get('data', {}).get('content')}'")
        assert rec_event.get("data", {}).get("content") == msg_text

        # 3. Test Real-time Job Creation Broadcast
        print("\n[Step 3] Testing Real-time Job Creation Broadcast...")
        job_title = f"Realtime Suite Chef {int(asyncio.get_event_loop().time())}"
        create_job_res = requests.post(f"{BASE_HTTP}/api/jobs", json={
            "business_id": biz_b,
            "title": job_title,
            "department": "Food & Beverage",
            "property_location": "Dhaka, Bangladesh",
            "employment_type": "Full-time",
            "shift": "Day",
            "salary_min": 65000,
            "salary_max": 85000,
            "salary_period": "month",
            "currency": "BDT",
            "vacancies": 2,
            "description": "Demonstrating automated real-time vacancy broadcasting.",
            "requirements": ["HACCP Certification", "5+ years luxury experience"],
            "deadline": "2026-12-31"
        })
        assert create_job_res.status_code == 200, f"Job creation failed: {create_job_res.text}"
        new_job_id = create_job_res.json()["job_id"]
        print(f"  ✓ Vacancy created: id={new_job_id}, title='{job_title}'")

        cand_job_evt = await wait_for_event(ws_candidate, "job_created")
        print(f"  ✓ Candidate received real-time 'job_created' broadcast: {cand_job_evt.get('data', {}).get('title')}")
        assert cand_job_evt.get("data", {}).get("job_id") == new_job_id

        # 4. Test Real-time Job Application Submission
        print("\n[Step 4] Testing Real-time Job Application & Targeted Notifications...")
        app_res = requests.post(f"{BASE_HTTP}/api/applications", json={
            "job_id": new_job_id,
            "user_id": user_a,
            "cover_letter": "Automated real-time test application note.",
            "selected_cv": "Hospitality CV",
            "screening_answers": {}
        })
        assert app_res.status_code == 200, f"Application submission failed: {app_res.text}"
        app_id = app_res.json()["application_id"]
        print(f"  ✓ Application submitted: app_id={app_id}")

        rec_app_event = await wait_for_event(ws_recruiter, "application_created")
        print(f"  ✓ Recruiter received 'application_created': candidate='{rec_app_event.get('data', {}).get('candidate_name')}'")

        cand_app_event = await wait_for_event(ws_candidate, "application_submitted")
        print(f"  ✓ Candidate received 'application_submitted': job='{cand_app_event.get('data', {}).get('job_title')}'")

        # 5. Test Recruiter Updating Application Status (shortlisted)
        print("\n[Step 5] Testing Application Status Progression & Candidate Live Update...")
        patch_res = requests.patch(f"{BASE_HTTP}/api/applications/{app_id}/status", json={
            "status": "shortlisted",
            "recruiter_notes": "Passed initial screening. Moving to interview round.",
            "actor_name": "Hotel Hiring Manager"
        })
        assert patch_res.status_code == 200, f"Status update failed: {patch_res.text}"

        cand_status_event = await wait_for_event(ws_candidate, "application_status_updated")
        print(f"  ✓ Candidate received real-time status update: status='{cand_status_event.get('data', {}).get('status')}'")
        assert cand_status_event.get("data", {}).get("status") == "shortlisted"

        rec_ats_event = await wait_for_event(ws_recruiter, "ats_updated")
        print(f"  ✓ Recruiter received ATS board update: status='{rec_ats_event.get('data', {}).get('status')}'")
        assert rec_ats_event.get("data", {}).get("status") == "shortlisted"

        # 6. Test Saved Jobs Real-time Sync
        print("\n[Step 6] Testing Saved Jobs Real-time Sync...")
        save_res = requests.post(f"{BASE_HTTP}/api/saved-jobs/{new_job_id}?user_id={user_a}")
        assert save_res.status_code == 200
        cand_save_event = await wait_for_event(ws_candidate, "saved_jobs_updated")
        print(f"  ✓ Candidate received saved job event: is_saved={cand_save_event.get('data', {}).get('is_saved')}")

        # 7. Test Mark All Notifications Read Real-time Sync
        print("\n[Step 7] Testing Notifications Read-All Real-time Sync...")
        read_res = requests.post(f"{BASE_HTTP}/api/notifications/read-all?user_id={user_a}")
        assert read_res.status_code == 200
        cand_read_event = await wait_for_event(ws_candidate, "notifications_read")
        print(f"  ✓ Candidate received notifications read sync: type='{cand_read_event.get('type')}'")

        # 8. Test Admin Job Status Broadcast
        print("\n[Step 8] Testing Admin Job Modification Broadcast...")
        status_update_res = requests.post(f"{BASE_HTTP}/api/admin/jobs/{new_job_id}/status", json={
            "status": "paused"
        })
        assert status_update_res.status_code == 200
        broadcast_cand = await wait_for_event(ws_candidate, "job_status_changed")
        broadcast_rec = await wait_for_event(ws_recruiter, "job_status_changed")
        print(f"  ✓ Candidate received status change: status='{broadcast_cand.get('data', {}).get('status')}'")
        print(f"  ✓ Recruiter received status change: status='{broadcast_rec.get('data', {}).get('status')}'")

        # 9. Test Job Deletion Broadcast & Clean up
        print("\n[Step 9] Testing Job Deletion Broadcast & Cleanup...")
        del_res = requests.delete(f"{BASE_HTTP}/api/admin/jobs/{new_job_id}")
        assert del_res.status_code == 200
        del_cand = await wait_for_event(ws_candidate, "job_deleted")
        del_rec = await wait_for_event(ws_recruiter, "job_deleted")
        print(f"  ✓ Candidate received deletion: job_id='{del_cand.get('data', {}).get('job_id')}'")
        print(f"  ✓ Recruiter received deletion: job_id='{del_rec.get('data', {}).get('job_id')}'")

    print("\n" + "=" * 60)
    print("🎉 ALL 9 REAL-TIME VERIFICATION TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_realtime_suite())
