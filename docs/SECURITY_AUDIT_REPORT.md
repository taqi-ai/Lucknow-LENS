# Lucknow Lens — Cybersecurity & AppSec Audit Report

**Date:** November 19, 2026  
**Status:** Audit Completed | Security Hardening Applied  
**Scope:** Express Server, External Data Feeds, Gemini AI Integration, Client-Side DOM Rendering, Dependency Vulnerabilities  

---

## 1. Executive Summary

A comprehensive application security (AppSec) audit was conducted across Lucknow Lens. Because the application interacts with external third-party feeds (OpenSky, adsb.lol, RailRadar, Open-Meteo, TomTom, GDELT, RSS) and processes natural language queries via Google Gemini, data sanitization, input validation, and boundary isolation were primary focal points.

### Key Security Achievements in this Audit:
1. **Remediated Potential Stored XSS / Protocol Hijacking:** Enforced protocol whitelisting on external news URLs.
2. **Eliminated Critical IP Spoofing Risk:** Upgraded `proxy-addr` to 2.0.8, protecting rate limiting buckets from spoofed IPv4-mapped IPv6 subnets.
3. **Hardened AI Analyst Boundary:** Implemented input length bounds (500 chars), prompt escaping, and strict output schema verification.
4. **Verified Credential Isolation:** Confirmed zero hardcoded secrets or API keys in source files or Git history; only `.env.example` is tracked.

---

## 2. Threat Modeling & Attack Surface Analysis

```
[Untrusted Internet / User Input]
   │
   ├── A. Natural Language Prompt (/api/analyst)
   │      └── Threat: Prompt injection, memory exhaustion, malformed JSON injection
   │      └── Mitigation: 16KB Express limit, 500-char truncation, schema validation, rule-based fallback
   │
   ├── B. Upstream Third-Party Feeds (Weather, AQI, Flights, Trains, News)
   │      └── Threat: Malicious URLs (javascript:), SSRF, upstream data poisoning
   │      └── Mitigation: Centralized CachedFeed proxies, protocol whitelisting (http/https only)
   │
   ├── C. Client-Side 3D Navigation & Coordinates
   │      └── Threat: Out-of-bounds coordinates, NaN camera crash, unmapped layer injection
   │      └── Mitigation: Coordinate range assertion (lat 26.0–27.5, lon 80.0–81.8), layer allowlisting
   │
   └── D. Network & Rate Limiting
          └── Threat: Denial of service, rate limit exhaustion
          └── Mitigation: 180 req/min per IP with proxy-addr trust subnet protection, in-memory bucket sweeping
```

---

## 3. Vulnerability Details & Remediations

### VULN-01: Cross-Site Scripting via Untrusted News Feed Links (P0 / Critical)
- **CWE:** CWE-79 (Improper Neutralization of Input During Web Page Generation)
- **Location:** `src/components/features/LiveDataPanel.tsx`
- **Finding:** The news feed displayed articles scraped from external RSS and GDELT feeds. While modern browsers restrict certain script injection contexts, anchor tags with `href={a.url}` can execute arbitrary JavaScript if the URL begins with `javascript:` or a data URI.
- **Remediation:** Enforced strict URL parsing allowing only `http:` and `https:` schemes. Any malformed or non-HTTP URL resolves to `'#'`. Added `rel="noopener noreferrer"`.
- **Status:** **RESOLVED**.

### VULN-02: IP Spoofing in Rate Limiter via `proxy-addr` (P1 / High)
- **Advisory:** GHSA-jqcg-44mw-7w3h
- **Location:** `node_modules/proxy-addr` (Express dependency)
- **Finding:** Versions `<2.0.8` incorrectly treated certain IPv4-mapped IPv6 subnets as trusted proxies, allowing clients to spoof `req.ip` via `X-Forwarded-For`. An attacker could bypass rate limits or exhaust buckets for legitimate users.
- **Remediation:** Patched `proxy-addr` to `2.0.8` via lockfile update.
- **Status:** **RESOLVED**.

### VULN-03: Denial of Service via Trailing Bytes in `body-parser` and `compression` (P1 / High)
- **Advisories:** GHSA-27r3-jxmh-p828, GHSA-vc2v-76pw-4v95
- **Location:** `node_modules/body-parser`, `node_modules/compression`
- **Finding:** Memory leak on premature client response termination in `compression`, and unhandled trailing bytes in compressed POST bodies in `body-parser`.
- **Remediation:** Patched `compression` to `1.8.2` and `body-parser` to `1.20.9`.
- **Status:** **RESOLVED**.

### VULN-04: Unbounded Input & JSON Injection in AI Analyst (P2 / Medium)
- **CWE:** CWE-20 (Improper Input Validation)
- **Location:** `server.ts` line 303
- **Finding:** `/api/analyst` accepted string input without length bounds, and returned Gemini JSON output directly to the client without structural validation.
- **Remediation:** Capped `question` to 500 characters, sanitized string escaping inside Gemini prompt template, and asserted that `result.answer` is a non-empty string before responding.
- **Status:** **RESOLVED**.

---

## 4. Security Headers & Network Hygiene

The Express server sets the following security headers:
- `X-Content-Type-Options: nosniff` (Prevents MIME sniffing)
- `X-Frame-Options: SAMEORIGIN` (Mitigates clickjacking)
- `Referrer-Policy: strict-origin-when-cross-origin` (Protects referrer privacy)
- `Cross-Origin-Opener-Policy: same-origin` (Isolates browsing context)
- `Permissions-Policy: geolocation=(self), microphone=(), camera=()` (Disables microphone and camera)
- `X-Powered-By`: Disabled

---

## 5. Remaining Risks & Future Enhancements

1. **Content Security Policy (CSP)**:
   - Three.js shaders compile dynamically from WebGL program strings, and Web Workers are instantiated via Blob URLs in development. A production CSP header with strict nonces for external scripts and explicit `worker-src blob:` should be added when deploying to managed edge CDNs.
2. **Rate Limiter Storage**:
   - The current rate limiter uses an in-memory `Map` with periodic sweeping. If Lucknow Lens is deployed across multiple container instances behind a round-robin load balancer, a Redis-backed token bucket would enforce unified rate limits across replicas.
