#!/usr/bin/env python
"""JWT forgery battery against the Aria auth spike's verifier.
Env: SPIKE (default http://127.0.0.1:8788), JWT_ACCESS (a valid ES256 access token).
Fires alg:none, HS256-confusion (public key as HMAC secret), payload-tamper, kid-traversal,
garbage vs GET /v1/me. Every forgery MUST be rejected (401); the valid token MUST be accepted.
Exit 0 if all behave correctly, 1 if any forgery is ACCEPTED (a break)."""
import os, sys, json, base64, hmac, hashlib, requests
try:
    import jwt as _pyjwt  # PyJWT, only for unverified decode
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
except Exception as e:
    print("needs PyJWT + cryptography (pip install PyJWT cryptography):", e); sys.exit(2)

SP = os.environ.get("SPIKE", "http://127.0.0.1:8788")
access = os.environ.get("JWT_ACCESS")
if not access:
    print("set JWT_ACCESS to a valid ES256 access token (mint via the OTP flow)"); sys.exit(2)

jwks = requests.get(f"{SP}/.well-known/jwks.json", timeout=5).json()
pl = _pyjwt.decode(access, options={"verify_signature": False}); parts = access.split(".")
b64e = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
b64u = lambda s: base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
k = jwks["keys"][0]; kid = k.get("kid")
pub = ec.EllipticCurvePublicNumbers(int.from_bytes(b64u(k["x"]), "big"), int.from_bytes(b64u(k["y"]), "big"), ec.SECP256R1()).public_key()
pem = pub.public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)

breaks = 0
def hit(label, token, expect_ok):
    global breaks
    r = requests.get(f"{SP}/v1/me", headers={"Authorization": f"Bearer {token}"}, timeout=5)
    ok = r.status_code == 200
    bad = ok != expect_ok
    if bad and not expect_ok: breaks += 1
    print(f"  [{label}] HTTP {r.status_code} {'ACCEPTED' if ok else 'rejected'} {'<<BREAK>>' if bad else ''}")

def forge_hs256(secret):
    h = b64e(json.dumps({"alg": "HS256", "typ": "JWT", "kid": kid}, separators=(",", ":")).encode())
    p = b64e(json.dumps(pl, separators=(",", ":")).encode())
    sig = hmac.new(secret, f"{h}.{p}".encode(), hashlib.sha256).digest()
    return f"{h}.{p}.{b64e(sig)}"

hit("control-valid", access, True)
hit("alg-none", _pyjwt.encode(pl, key="", algorithm="none"), False)
hit("hs256-confusion(pem)", forge_hs256(pem), False)
hit("hs256-confusion(rawxy)", forge_hs256(b64u(k["x"]) + b64u(k["y"])), False)
pl2 = dict(pl); pl2["sub"] = "attacker-uid"
hit("payload-tamper", f"{parts[0]}.{b64e(json.dumps(pl2, separators=(',', ':')).encode())}.{parts[2]}", False)
h2 = b64e(json.dumps({"alg": "ES256", "typ": "JWT", "kid": "../../etc/passwd"}, separators=(",", ":")).encode())
hit("kid-traversal", f"{h2}.{parts[1]}.{parts[2]}", False)
hit("garbage", "not.a.jwt", False)
print(f"  => {breaks} forgeries accepted (want 0)")
sys.exit(1 if breaks else 0)
