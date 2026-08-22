#!/usr/bin/env python3
"""
Career Ops Webhook Notifier for Audio Job Hunter Cron & Automation Sweeps.
Dispatches job application submissions to the Career Ops tracker API.
"""

import sys
import json
import argparse
import urllib.request
import urllib.error

WEBHOOK_URL = "http://127.0.0.1:8098/api/webhook/application"

def post_application(data):
    payload = {
        "title": data.get("title", "Software Engineer"),
        "company": data.get("company", "Unknown"),
        "workplace_type": data.get("workplace_type", "remote"), # "remote" | "hybrid" | "on-site"
        "status": data.get("status", "applied"), # "applied", "wishlist", "interview_pending", etc.
        "application_method": data.get("application_method", "portal"), # "portal" | "email" | "linkedin"
        "url": data.get("url", ""),
        "location": data.get("location", ""),
        "job_description": data.get("job_description", ""),
        "info_provided": data.get("info_provided", "CV: andrei-gheorghe-cv.pdf"),
        "cover_letter": data.get("cover_letter", ""),
        "salary": data.get("salary", ""),
        "contact_email": data.get("contact_email", ""),
        "notes": data.get("notes", ""),
        "priority": data.get("priority", "high"),
        "source": data.get("source", "audio-job-hunter-cron")
    }

    req = urllib.request.Request(
        WEBHOOK_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            res_body = response.read().decode("utf-8")
            print(f"✅ Logged to Career Ops tracker: HTTP {response.status} -> {res_body}")
            return True
    except urllib.error.URLError as e:
        print(f"⚠️ Failed to reach Career Ops webhook: {e}", file=sys.stderr)
        return False

def main():
    parser = argparse.ArgumentParser(description="Notify Career Ops tracker of a new or updated application.")
    parser.add_argument("--title", required=True, help="Job title / position")
    parser.add_argument("--company", required=True, help="Company name")
    parser.add_argument("--workplace", default="remote", choices=["remote", "hybrid", "on-site"], help="Workplace type")
    parser.add_argument("--status", default="applied", help="Application status (applied, wishlist, etc)")
    parser.add_argument("--method", default="portal", choices=["portal", "email", "linkedin", "referral", "recruiter", "other"], help="Application method")
    parser.add_argument("--url", default="", help="Job listing or ATS URL")
    parser.add_argument("--location", default="", help="Job location")
    parser.add_argument("--salary", default="", help="Salary / compensation range")
    parser.add_argument("--info", default="CV: andrei-gheorghe-cv.pdf", help="Info provided / resume notes")
    parser.add_argument("--letter", default="", help="Cover letter text")
    parser.add_argument("--notes", default="", help="Additional notes")
    parser.add_argument("--priority", default="high", choices=["low", "medium", "high", "top"], help="Priority level")
    parser.add_argument("--source", default="audio-job-hunter-cron", help="Source identifier")

    args = parser.parse_args()

    post_application({
        "title": args.title,
        "company": args.company,
        "workplace_type": args.workplace,
        "status": args.status,
        "application_method": args.method,
        "url": args.url,
        "location": args.location,
        "salary": args.salary,
        "info_provided": args.info,
        "cover_letter": args.letter,
        "notes": args.notes,
        "priority": args.priority,
        "source": args.source
    })

if __name__ == "__main__":
    main()
