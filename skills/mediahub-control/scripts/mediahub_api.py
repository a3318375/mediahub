#!/usr/bin/env python3
"""Small standard-library client for mediahub business APIs. No write retries."""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def target_url(base, path, queries):
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Base URL must be an HTTP(S) service URL without credentials, query or fragment")
    if not re.fullmatch(r"/api/v1/(?:whoami|logs|downloads|(?:media|resources|subscriptions|downloads|115|settings)/[A-Za-z0-9_./%-]+)", path) and path != "/api/health":
        raise ValueError("Only supported mediahub business API paths are allowed")
    decoded = urllib.parse.unquote(path)
    if any(part in (".", "..") for part in decoded.split("/")) or "\\" in decoded or "%" in decoded or "reveal" in decoded.lower():
        raise ValueError("Unsafe API path")
    pairs = []
    for query in queries:
        key, sep, value = query.partition("=")
        if not sep or key.lower() in ("token", "api_key", "apikey", "authorization"):
            raise ValueError("Queries must be key=value and must not contain authentication")
        pairs.append((key, value))
    return base.rstrip("/") + path + ("?" + urllib.parse.urlencode(pairs) if pairs else "")


def redact(value, secret):
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if re.search(r"apikey|cookie|password|token|secret|authorization", k, re.I) and k not in ("configuredSecrets", "maskedSecrets") else redact(v, secret)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v, secret) for v in value]
    if isinstance(value, str) and secret:
        return value.replace(secret, "[REDACTED]")
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("method", choices=["GET", "POST", "PUT", "PATCH"])
    parser.add_argument("path")
    parser.add_argument("-q", "--query", action="append", default=[])
    body = parser.add_mutually_exclusive_group()
    body.add_argument("--body", help="UTF-8 JSON request file")
    body.add_argument("--body-env", help="Environment variable containing JSON request body")
    parser.add_argument("--base-url", default=os.environ.get("MEDIAHUB_BASE_URL", "http://127.0.0.1:18080"))
    parser.add_argument("--timeout", type=float, default=110)
    args = parser.parse_args()
    try:
        url = target_url(args.base_url, args.path, args.query)
        if not 0 < args.timeout <= 180:
            raise ValueError("Timeout must be between 0 and 180 seconds")
        key = os.environ.get("MEDIAHUB_API_KEY", "").strip()
        if not key and args.path != "/api/health":
            raise ValueError("Configure MEDIAHUB_API_KEY in the Hermes execution environment")
        payload = None
        if args.body or args.body_env:
            if args.method == "GET":
                raise ValueError("GET does not accept a request body")
            if args.body:
                with open(args.body, encoding="utf-8-sig") as stream:
                    raw = stream.read()
            else:
                raw = os.environ.get(args.body_env, "")
            payload = json.dumps(json.loads(raw), ensure_ascii=False).encode("utf-8")
        headers = {"Accept": "application/json"}
        if args.path != "/api/health":
            headers["Authorization"] = "Bearer " + key
        if payload is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=payload, headers=headers, method=args.method)
        opener = urllib.request.build_opener(NoRedirect())
        try:
            response = opener.open(request, timeout=args.timeout)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read(8 * 1024 * 1024 + 1)
            if len(raw) > 8 * 1024 * 1024:
                raise ValueError("Response exceeded 8 MiB")
            try:
                data = json.loads(raw)
            except (ValueError, UnicodeError):
                data = {"error": "Non-JSON response; check service address and HTTP status"}
            result = {"status": response.code, "data": redact(data, key)}
            if response.headers.get("Retry-After"):
                result["retryAfter"] = response.headers["Retry-After"]
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0 if 200 <= response.code < 300 else 1
    except (ValueError, OSError, urllib.error.URLError) as error:
        # Never print request bodies, headers, credentials or raw network exceptions.
        message = str(error) if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError) else "Request failed; verify configuration. Read back state before retrying writes."
        print(json.dumps({"error": message}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
