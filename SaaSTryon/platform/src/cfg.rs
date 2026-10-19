/* cfg.rs - validation + shared constants (pure logic, no worker runtime:
every rule ships with tests). Env bindings are read inline by the
command handlers (`PLATFORM_DB`, `ADMIN_TOKEN`, ...). */

/// Subdomains the platform keeps for itself / never assigns to shops.
pub const RESERVED_SUBDOMAINS: &[&str] = &[
    "www",
    "app",
    "api",
    "admin",
    "platform",
    "latiforge",
    "shop",
    "tryon",
    "mail",
    "webmail",
    "status",
    "staging",
    "preview",
    "dashboard",
    "help",
    "support",
    "blog",
    "docs",
    "static",
    "cdn",
];

/// DNS-safe shop subdomain: 3-63 chars of [a-z0-9-], no leading/trailing
/// hyphen, not reserved (B3 name limits also keep script names valid).
pub fn valid_subdomain(sub: &str) -> bool {
    let s = sub;
    (3..=63).contains(&s.len())
        && !s.starts_with('-')
        && !s.ends_with('-')
        && !RESERVED_SUBDOMAINS.contains(&s)
        && s.bytes()
            .all(|b| matches!(b, b'a'..=b'z' | b'0'..=b'9' | b'-'))
}

/// Cheap (non-RFC-complete) email check: exactly one `@`, sane local part,
/// domain with at least one label separator and valid labels.
pub fn valid_email(email: &str) -> bool {
    let e = email.trim();
    let mut parts = e.split('@');
    let (local, domain, extra) = (parts.next(), parts.next(), parts.next());
    let (Some(local), Some(domain), None) = (local, domain, extra) else {
        return false;
    };
    valid_local(local) && valid_domain(domain)
}

fn valid_local(local: &str) -> bool {
    (1..=64).contains(&local.len())
        && local.bytes().all(|b| {
            b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'%' | b'+' | b'-' | b'*')
        })
        && !local.starts_with('.')
        && !local.ends_with('.')
}

fn valid_domain(domain: &str) -> bool {
    if !(4..=253).contains(&domain.len()) || !domain.contains('.') {
        return false;
    }
    domain.split('.').all(|label| {
        (1..=63).contains(&label.len())
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    })
}

/// Contact normalisation: digits only, keep a leading `+` (international
/// format); spaces/parens/dashes are dropped.
pub fn normalise_contact(raw: &str) -> String {
    let plus = raw.trim_start().starts_with('+');
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    if plus && !digits.is_empty() {
        format!("+{digits}")
    } else {
        digits
    }
}

/// A contact is usable when it survives normalisation with 7-20 digits.
pub fn valid_contact(raw: &str) -> bool {
    let digits = normalise_contact(raw).trim_start_matches('+').len();
    (7..=20).contains(&digits)
}

/// Allowance gate (§7.3 step 2): a deploy is allowed only while the user
/// has spare allowance left. Zero allowance = never.
pub fn deploy_allowed(deploy_used: i64, deploy_allowance: i64) -> bool {
    deploy_used < deploy_allowance
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_validator_good_and_bad() {
        for good in ["a@b.co", "amina.studio+shop@gmail.com", "user_1@x.dev"] {
            assert!(valid_email(good), "{good} should be valid");
        }
        for bad in [
            "",
            "no-at-sign",
            "@x.com",
            "a@@b.com",
            ".local@x.com",
            "a@xn",
            "a@x-.com",
            "a@-x.com",
            "a@x..com",
        ] {
            assert!(!valid_email(bad), "{bad:?} should be invalid");
        }
    }

    #[test]
    fn subdomain_rules() {
        for good in ["amina", "amina-studio", "shop42", "a-b-c"] {
            assert!(valid_subdomain(good), "{good} should be valid");
        }
        for bad in [
            "ab",    // too short
            "",      // empty
            "Amina", // not dns-lowercase after check charset (uppercase)
            "-amina",
            "amina-",                // hyphen edges
            "amina store",           // space
            "amina.store",           // dot
            "x".repeat(64).as_str(), // too long
            "admin",
            "www",
            "api", // reserved
        ] {
            assert!(!valid_subdomain(bad), "{bad:?} should be invalid");
        }
    }

    #[test]
    fn contact_normalisation() {
        assert_eq!(normalise_contact(" +1 (555) 010-2030 "), "+15550102030");
        assert_eq!(normalise_contact("0772 123 456"), "0772123456");
        assert_eq!(normalise_contact("call me monday"), "");
        assert!(valid_contact("+1 555 010 2030"));
        assert!(valid_contact("0772123456"));
        assert!(!valid_contact("123456")); // too short
        assert!(!valid_contact("no digits at all"));
    }

    #[test]
    fn allowance_gate_math() {
        assert!(deploy_allowed(0, 1));
        assert!(deploy_allowed(2, 5));
        assert!(!deploy_allowed(5, 5)); // used == allowance: gate closed
        assert!(!deploy_allowed(6, 5)); // over-run: gate closed
        assert!(!deploy_allowed(0, 0)); // zero allowance = never allowed
    }
}
