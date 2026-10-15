//! Timeline: latest-first strip of person photos + generated results.
//! Latest entry is "in front". Pure logic shared by SSR JS (mirrored) and
//! the Leptos client. Entries persist in browser localStorage; the person
//! `imageId` is valid ~7 days (Genlook TTL), so entries expire after 6.

use serde::{Deserialize, Serialize};

pub const CAP: usize = 12;
/// Person imageIds older than this are treated as expired (Genlook keeps 7d).
pub const PERSON_TTL_SECS: i64 = 6 * 24 * 3600;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Entry {
    /// "person" or "result".
    pub kind: String,
    /// Small data-URL thumb (person) or remote URL (result).
    pub thumb: String,
    /// Genlook imageId for person entries.
    pub image_id: String,
    /// Full result URL for result entries.
    pub url: String,
    /// Unix seconds.
    pub ts: i64,
}

/// Push newest-first, de-dupe identical thumbs, cap length. Pure.
pub fn push(mut list: Vec<Entry>, e: Entry) -> Vec<Entry> {
    list.retain(|x| x.thumb != e.thumb);
    list.insert(0, e);
    list.truncate(CAP);
    list
}

/// A stored person entry is usable only within TTL.
pub fn person_usable(e: &Entry, now: i64) -> bool {
    e.kind == "person" && !e.image_id.is_empty() && now - e.ts < PERSON_TTL_SECS
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(kind: &str, thumb: &str) -> Entry {
        Entry { kind: kind.into(), thumb: thumb.into(), image_id: "img".into(), url: "".into(), ts: 0 }
    }

    #[test]
    fn newest_first_deduped_capped() {
        let mut l = vec![];
        l = push(l, e("person", "a"));
        l = push(l, e("result", "b"));
        l = push(l, e("person", "a"));
        assert_eq!(l.len(), 2);
        assert_eq!(l[0].thumb, "a");
    }

    #[test]
    fn ttl_expiry() {
        let p = e("person", "a");
        assert!(person_usable(&p, PERSON_TTL_SECS - 1));
        assert!(!person_usable(&p, PERSON_TTL_SECS + 1));
    }
}
