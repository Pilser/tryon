# TikTok App Submission — Copy-Paste Text

## Description (for TikTok users)
SaaSTryon (latiforge.com) is a virtual try-on platform for fashion retailers. Shop owners upload their product photos and let shoppers see how garments look on them using AI-generated previews. Shoppers sign in with TikTok to save their try-on history and share looks with friends.

## Explain how each product and scope works

### Login Kit (user.info.basic)
TikTok Login Kit is used for account creation and sign-in. When a user clicks "Sign in with TikTok" on latiforge.com or any shop subdomain (*.latiforge.com), they are redirected to TikTok's authorization page. After the user consents, we receive an authorization code which we exchange server-side for an access token. We then call the TikTok user info endpoint to retrieve the user's open_id and display name, which we use to create or look up their platform account. No TikTok data is stored beyond the open_id and display name needed for account identity. The access token is used once and not persisted.

### Scope justification
- `user.info.basic`: Required to identify the user and create their platform account. We only read open_id and display name. No other profile data is requested or stored.

## App details
- App name: SaaSTryon
- Website: https://latiforge.com
- Terms of Service: https://latiforge.com/terms
- Privacy Policy: https://latiforge.com/privacy
- Category: E-commerce / Fashion
- Platform: Web

## Contact
- Support email: support@latiforge.com