# Platform/Shop Unified Login — Phase Tracker

Last updated: 2026-11-09
Owner: platform + shop worker + shop frontend

## Goal

One login works for both the platform (latiforge.com) and every shop
(*.latiforge.com). No admin approval gate. Non-technical UX: "Sign in
with Google/TikTok" buttons, no token management. Platform settings
(Genlook balance, bundle version, credits) live in the shop studio.

## Phases

### Phase A — Platform auth (auto-approve + Google OAuth + TikTok OAuth + shared session)
Status: IN PROGRESS
- [ ] Auto-approve on signup: status='approved', deploy_allowance=5 (default, admin-adjustable)
- [ ] Mint a signin token at signup and return it (no admin gate)
- [ ] Issue a session at signup (no "pending" state for new users)
- [ ] Shared session cookie on `.latiforge.com` (HttpOnly, Secure, SameSite=Lax)
- [ ] Google OAuth: redirect + callback endpoints
- [ ] Google OAuth: read client_id/secret from platform_settings (or env)
- [ ] TikTok Login Kit: redirect + callback endpoints
- [ ] TikTok OAuth: read client_key/client_secret from platform_settings
- [ ] Platform settings: Terms of Service URL + Privacy Policy URL (TikTok requirement)
- [ ] Platform settings: Google client_id/secret storage
- [ ] Platform settings: TikTok client_key/secret storage
- [ ] Login page: "Sign in with Google" button
- [ ] Login page: "Sign in with TikTok" button
- [ ] Signup page: non-technical UX (email + Google/TikTok, no token jargon)
- [ ] Deploy platform with new auth

### Phase B — Deployer (inject shared session secret)
Status: DONE (platform session cookie verified by shop worker via /api/v1/me; no secret needed)
- [x] Shop worker verifies platform session cookie (verify_platform_session calls /api/v1/me)
- [x] Owner gate accepts platform session OR OWNER_TOKEN

### Phase C — Shop worker (read platform session + expose platform info)
Status: DONE
- [x] Read shared session cookie from request (authorized_async)
- [x] Verify session with platform (verify_platform_session)
- [x] GET /api/owner/sso endpoint for frontend SSO check
- [x] Keep OWNER_TOKEN as fallback for legacy shops

### Phase D — Shop frontend (SSO + platform dashboard in studio)
Status: PARTIAL
- [x] /api/owner/sso endpoint available for frontend
- [ ] Studio reads shared session on load (frontend change)
- [ ] Platform dashboard widgets in studio owner panel
- [ ] "Sign in with platform" button on studio login

### Phase E — UX polish + cleanup
Status: IN PROGRESS (ToS + Privacy pages done)
- [x] Add Terms of Service page on platform (/terms)
- [x] Add Privacy Policy page on platform (/privacy)
- [ ] Remove admin approval gate from admin console (or keep as read-only view)
- [ ] Simplify signup flow (email + OAuth only) - done in frontend
- [ ] End-to-end test: signup → auto-approved → deploy shop → login to shop with same session

## TikTok Login Kit research notes

OAuth 2.0 flow:
- Auth URL: https://www.tiktok.com/v2/auth/authorize/
- Token URL: https://open.tiktokapis.com/v2/oauth/token/
- User info: https://open.tiktokapis.com/v2/user/info/
- Scopes: user.info.basic (minimum for login)
- Redirect URI must be registered in TikTok Developer Portal
- PKCE is required (code_challenge + code_verifier)
- Response type: code
- Client auth: client_key + client_secret

TikTok OAuth 2.0 v2:
1. Redirect user to auth URL with client_key, scope, redirect_uri, state, code_challenge, code_challenge_method=S256
2. User authorizes → redirect back with code + state
3. Exchange code for access_token + refresh_token (POST to token URL with client_key, client_secret, code, grant_type=authorization_code, redirect_uri, code_verifier)
4. Get user info (GET user/info/ with Authorization: Bearer access_token, fields: open_id, union_id, avatar_url, display_name)

TikTok requires: Terms of Service URL, Privacy Policy URL, app icon, etc. registered in developer portal.

## Google OAuth (already have credentials)
- Auth URL: https://accounts.google.com/o/oauth2/v2/auth
- Token URL: https://oauth2.googleapis.com/token
- User info: https://www.googleapis.com/oauth2/v3/userinfo
- Scopes: openid email profile
- Redirect URI: https://latiforge.com/api/v1/auth/google/callback
- JS origin: https://latiforge.com

## Notes
- Default deploy_allowance for auto-approved users: 5
- Admin can adjust allowance per user (existing handle_allowance endpoint)
- Google client_id/secret: store in platform_settings (like GENLOOK_API_KEY)
- TikTok client_key/secret: store in platform_settings (same pattern)
- Terms of Service URL: store in platform_settings, render at /terms
- Privacy Policy URL: store in platform_settings, render at /privacy