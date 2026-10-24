import subprocess
import time
import json
import urllib.request
import websockets
import asyncio

async def test_browser_e2e():
    print("=" * 60)
    print("🌐 HEADLESS CHROMIUM E2E REAL-TIME TEST")
    print("=" * 60)

    # Launch Chromium in headless mode with remote debugging port
    chrome_proc = subprocess.Popen([
        "/snap/bin/chromium",
        "--headless=new",
        "--no-sandbox",
        "--remote-debugging-port=9222",
        "http://localhost:8000/#home"
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    try:
        # Wait for CDP to be ready
        time.sleep(3)
        targets_raw = urllib.request.urlopen("http://localhost:9222/json").read()
        targets = json.loads(targets_raw.decode("utf-8"))
        page_target = next((t for t in targets if t.get("type") == "page"), None)
        assert page_target, "No page target found in Chromium"
        ws_url = page_target["webSocketDebuggerUrl"]
        print(f"  ✓ Connected to Chromium DevTools: {ws_url}")

        async with websockets.connect(ws_url) as cdp:
            # Helper to send CDP command
            msg_id = 0
            async def send_cdp(method, params=None):
                nonlocal msg_id
                msg_id += 1
                req = {"id": msg_id, "method": method, "params": params or {}}
                await cdp.send(json.dumps(req))
                while True:
                    res = json.loads(await cdp.recv())
                    if res.get("id") == msg_id:
                        return res.get("result", {})

            # Enable Runtime & Page
            await send_cdp("Runtime.enable")
            await send_cdp("Page.enable")
            
            # Wait for page to finish initial loading
            # Wait for browser WebSocket to connect
            ws_ready_state = -1
            for _ in range(20):
                ws_state_eval = await send_cdp("Runtime.evaluate", {
                    "expression": "window.realtimeSocket ? window.realtimeSocket.readyState : -1"
                })
                ws_ready_state = ws_state_eval.get("result", {}).get("value")
                if ws_ready_state == 1:
                    break
                time.sleep(0.5)

            print(f"  ✓ Browser WebSocket readyState: {ws_ready_state} (1 = OPEN)")
            assert ws_ready_state == 1, f"Expected WebSocket to be OPEN (1), got {ws_ready_state}"

            # Verify initial toast count
            initial_toast_eval = await send_cdp("Runtime.evaluate", {
                "expression": "document.querySelectorAll('.toast').length"
            })
            initial_toasts = initial_toast_eval.get("result", {}).get("value", 0)
            print(f"  ✓ Initial toasts on page: {initial_toasts}")

            # Now create a new vacancy via HTTP backend to trigger real-time broadcast
            print("\n  Broadcasting new vacancy from server...")
            biz_b = "biz_1792756972_a86aa5"
            create_job_req = urllib.request.Request(
                "http://localhost:8000/api/jobs",
                data=json.dumps({
                    "business_id": biz_b,
                    "title": "Head Sommelier - Live E2E Sync",
                    "department": "Food & Beverage",
                    "property_location": "Dhaka, Bangladesh",
                    "employment_type": "Full-time",
                    "shift": "Day",
                    "salary_min": 70000,
                    "salary_max": 95000,
                    "salary_period": "month",
                    "currency": "BDT",
                    "vacancies": 1,
                    "description": "Live real-time E2E test vacancy.",
                    "requirements": ["Court of Master Sommeliers"],
                    "deadline": "2026-12-31"
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            create_res = urllib.request.urlopen(create_job_req).read()
            job_info = json.loads(create_res.decode("utf-8"))
            test_job_id = job_info["job_id"]
            print(f"  ✓ Job created on backend: {test_job_id}")

            # Give browser 1 second to receive WebSocket event and update DOM
            time.sleep(1.5)

            # Check that a live toast appeared without any page reload!
            toast_eval = await send_cdp("Runtime.evaluate", {
                "expression": "Array.from(document.querySelectorAll('.toast')).map(t => t.textContent).join(' | ')"
            })
            toast_text = toast_eval.get("result", {}).get("value", "")
            print(f"  ✓ Browser live toast notification: '{toast_text}'")
            assert "New Vacancy Live" in toast_text, f"Expected 'New Vacancy Live' in toast text, got '{toast_text}'"

            # Check that the job card is now present in the DOM without refresh
            job_card_eval = await send_cdp("Runtime.evaluate", {
                "expression": f"document.body.innerText.includes('Head Sommelier - Live E2E Sync')"
            })
            card_present = job_card_eval.get("result", {}).get("value", False)
            print(f"  ✓ Job rendered on page in real-time without page refresh: {card_present}")
            assert card_present, "Job title was not found in browser DOM after live broadcast"

            # Clean up the test job
            del_req = urllib.request.Request(f"http://localhost:8000/api/admin/jobs/{test_job_id}", method="DELETE")
            urllib.request.urlopen(del_req)
            print(f"  ✓ Cleaned up test job {test_job_id}")

            print("\n" + "=" * 60)
            print("🎉 BROWSER E2E TEST PASSED: Live DOM Updated In Real Time!")
            print("=" * 60)

    finally:
        chrome_proc.terminate()
        try:
            chrome_proc.wait(timeout=2)
        except Exception:
            chrome_proc.kill()

if __name__ == "__main__":
    asyncio.run(test_browser_e2e())
