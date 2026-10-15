/* Shop baseline JS — plain, commented, Astra may reskin or replace.
   Flows: landing grid + swap cards, product studio + timeline, admin bundle. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const PK = "tryon.person.v1", TK = "tryon.timeline.v1", TTL = 6 * 24 * 3600;
  const now = () => Math.floor(Date.now() / 1000);
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  async function api(path, opts) {
    const r = await fetch(path, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || ("HTTP " + r.status));
    return j;
  }
  const money = (p) => (p.price_cents / 100).toFixed(2) + " " + p.currency;
  const waInquire = (owner, shop, p) =>
    "https://wa.me/" + owner.replace(/\D/g, "") + "?text=" +
    encodeURIComponent(`Hi ${shop}! I like ${p.title} (${p.id}). Is it available?`);

  /* ---- swap cards: tap inset swaps, hold on person shows styled ---- */
  function armSwap(root) {
    const main = root.querySelector("img.main"), inset = root.querySelector(".model-inset");
    const mi = root.dataset.model, si = root.dataset.styled, gi = root.dataset.garment;
    const cur = root.querySelector(".swap-cur");
    let showing = "garment", timer = null;
    const set = (src, label) => { main.src = src; if (cur) cur.textContent = label; };
    if (inset) inset.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (showing === "garment" && mi) { showing = "person"; set(mi, "Model — hold to see it worn"); }
      else { showing = "garment"; set(gi, "Garment — tap model to swap"); }
    });
    const hold = (ev) => {
      if (showing !== "person" || !si) return;
      ev.preventDefault();
      timer = setTimeout(() => { set(si, "Wearing it — release to go back"); timer = "held"; }, 350);
    };
    const release = () => { if (timer === "held") set(mi, "Model — hold to see it worn"); clearTimeout(timer); timer = null; };
    main.addEventListener("pointerdown", hold);
    main.addEventListener("pointerup", release);
    main.addEventListener("pointerleave", () => { clearTimeout(timer); timer = null; });
  }

  function cardHTML(p, shop, owner) {
    const model = p.model_image_url || p.image_url;
    return `<article class="productcard" data-garment="${esc(p.image_url)}" data-model="${esc(model)}" data-styled="${esc(p.styled_image_url || "")}">
      <a href="/app/product.html?id=${esc(p.id)}"><img class="img main" loading="lazy" src="${esc(p.image_url)}" alt="${esc(p.title)}"/></a>
      <div class="badge-pill"></div><p class="badge">${esc(p.category)}</p>
      <button class="model-inset" aria-label="view model"><img loading="lazy" src="${esc(model)}" alt="model without garment"/></button>
      <p class="swap-cur">Garment — tap model to swap</p>
      <p class="title">${esc(p.title)}</p><p class="price">${esc(money(p))}</p>
      <a class="btn-tryon" href="/app/product.html?id=${esc(p.id)}"><span class="btn-tryon-label">Try On</span></a>
      <a class="btn-inquire" target="_blank" rel="noopener" href="${esc(waInquire(owner, shop, p))}"><span class="btn-inquire-label">Inquire</span></a>
    </article>`;
  }

  /* ---- landing ---- */
  async function landing() {
    const shop = await api("/api/shop-settings").catch(() => ({ shop_name: "Shop", owner_whatsapp: "" }));
    const q = new URLSearchParams(location.search);
    const params = new URLSearchParams({ q: q.get("q") || "", category: q.get("category") || "" });
    const list = await api("/api/products?" + params.toString()).catch(() => []);
    const box = $("q"); if (box) box.value = q.get("q") || "";
    const cats = [...new Set(list.map((p) => p.category).filter(Boolean))].sort();
    const all = [...new Set((await api("/api/products").catch(() => [])).map((p) => p.category).filter(Boolean))].sort();
    $("pills").innerHTML = `<a class="pill-all${q.get("category") ? "" : " on"}" href="/app/">All</a>` +
      all.map((c) => `<a class="pill-1${c === q.get("category") ? " on" : ""}" href="/app/?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join("");
    $("count").textContent = list.length + " products";
    $("grid").innerHTML = list.map((p) => cardHTML(p, shop.shop_name, shop.owner_whatsapp)).join("");
    document.querySelectorAll(".productcard").forEach(armSwap);
    $("search-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      location.href = "/app/?q=" + encodeURIComponent($("q").value);
    });
  }

  /* ---- photo prep shared by studio + admin: validate, downscale, thumb ---- */
  function prepFile(file) {
    return new Promise((resolve, reject) => {
      const ok = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
      if (file.type && !ok.includes(file.type)) return reject(new Error("Use JPEG, PNG, WebP or HEIC."));
      if (file.size > 10 * 1024 * 1024) return reject(new Error("Photo over 10 MB."));
      if (file.type === "image/heic" || file.type === "image/heif") {
        return resolve({ blob: file, mime: file.type, note: `HEIC original sent as-is (${(file.size / 1048576).toFixed(1)} MB)`, heic: true });
      }
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const w = img.naturalWidth, h = img.naturalHeight;
        if (w < 256 || h < 256) return reject(new Error("Photo too small — use at least 256x256."));
        let tw = w, th = h;
        const m = Math.max(w, h);
        if (m > 1600) { const s = 1600 / m; tw = Math.round(w * s); th = Math.round(h * s); }
        if (tw === w && file.type === "image/jpeg") {
          return resolve({ blob: file, mime: file.type, note: `${w}x${h} · ${(file.size / 1048576).toFixed(1)} MB` });
        }
        const c = document.createElement("canvas"); c.width = tw; c.height = th;
        c.getContext("2d").drawImage(img, 0, 0, tw, th);
        c.toBlob((b) => resolve({ blob: b, mime: "image/jpeg", note: `resized in browser to ${tw}x${th}` }), "image/jpeg", 0.85);
      };
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = url;
    });
  }
  function thumbOf(img, cb) {
    const s = 128 / Math.max(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    cb(c.toDataURL("image/jpeg", 0.7));
  }

  /* ---- product studio + timeline ---- */
  async function product() {
    const id = new URLSearchParams(location.search).get("id") || "";
    const p = await api("/api/products/" + encodeURIComponent(id));
    document.title = p.title + " — TryOn & Shop";
    const shop = await api("/api/shop-settings").catch(() => ({ shop_name: "Shop", owner_whatsapp: "" }));
    $("detail").innerHTML = `<article class="detail"><img src="${esc(p.image_url)}" alt="${esc(p.title)}"/>
      <div><h1>${esc(p.title)}</h1><p>${esc(p.description)}</p><p class="price">${esc(money(p))}</p>
      <div class="row"><a class="btn wa" target="_blank" href="${esc(waInquire(shop.owner_whatsapp, shop.shop_name, p))}">Inquire on WhatsApp</a></div></div></article>`;
    studio(p);
  }

  function studio(p) {
    const show = (el, on) => { el.style.display = on ? "" : "none"; };
    const fail = (m) => { const e = $("st-err"); e.textContent = m; show(e, true); };
    const clear = () => { const e = $("st-err"); e.textContent = ""; show(e, false); };
    let file = null, activeImageId = null;
    const paintTl = (active) => {
      const tl = $("st-timeline"), th = $("st-tlhead"), l = load(TK) || [];
      tl.innerHTML = "";
      if (!l.length) { show(tl, false); show(th, false); return; }
      show(tl, true); show(th, true);
      l.forEach((e) => {
        const b = document.createElement("button");
        b.className = "tl-item" + (e.thumb === active ? " on" : "");
        b.innerHTML = `<img src="${esc(e.thumb)}" alt="${esc(e.kind)}"/>`;
        b.onclick = () => selectEntry(e);
        tl.appendChild(b);
      });
    };
    const pushTl = (e) => {
      const l = (load(TK) || []).filter((x) => x.thumb !== e.thumb);
      l.unshift(e); save(TK, l.slice(0, 12)); paintTl(e.thumb);
    };
    const ready = (thumb, note, welcomed) => {
      $("st-prev").src = thumb; show($("st-prev"), true);
      $("st-meta").textContent = note;
      $("st-welcome").textContent = welcomed ? "Saved photo restored — Start try-on, or Change photo." : "";
      show($("st-welcome"), welcomed);
      show($("st-start"), true); show($("st-change"), true);
    };
    const selectEntry = (e) => {
      clear();
      if (e.kind === "person") {
        if (!e.imageId || now() - e.ts > TTL) return fail("That photo expired — pick a new one.");
        activeImageId = e.imageId; file = null;
        save(PK, { imageId: e.imageId, ts: e.ts });
        ready(e.thumb, "Timeline photo selected.", false); paintTl(e.thumb);
      } else if (e.url) {
        $("st-resimg").src = e.url; show($("st-res"), true); paintTl(e.thumb);
      }
    };
    const onPick = async (ev) => {
      clear();
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      try {
        const r = await prepFile(f);
        file = { blob: r.blob, mime: r.mime }; activeImageId = null;
        const u = URL.createObjectURL(r.blob), im = new Image();
        im.onload = () => thumbOf(im, (t) => {
          ready(u, r.note, false);
          save(PK, { imageId: "", thumb: t, ts: now() });
          pushTl({ kind: "person", thumb: t, imageId: "", url: "", ts: now() });
        });
        im.src = u;
      } catch (e) { fail(e.message); }
    };
    $("pick-file").addEventListener("change", onPick);
    $("pick-cam").addEventListener("change", onPick);
    $("st-change").addEventListener("click", () => {
      file = null; activeImageId = null; $("st-prev").src = "";
      show($("st-prev"), false); show($("st-start"), false); show($("st-change"), false);
      $("st-meta").textContent = ""; show($("st-welcome"), false); clear();
    });
    $("st-start").addEventListener("click", async () => {
      if (!file && !activeImageId) return fail("Pick a photo first.");
      clear(); show($("st-start"), false);
      $("st-prog").textContent = "Uploading photo…"; show($("st-prog"), true);
      try {
        let imageId = activeImageId;
        if (file) {
          const fd = new FormData();
          fd.append("file", file.blob, "person.jpg");
          const u = await api("/api/person-upload", { method: "POST", body: fd });
          if (!u.imageId) throw new Error("no imageId returned");
          imageId = activeImageId = u.imageId;
          save(PK, { imageId, ts: now() });
        }
        $("st-prog").textContent = "Trying it on… (about 10 seconds)";
        const r = await fetch("/api/try-on/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: p.id, title: p.title, description: p.description, image_url: p.image_url, person_image_id: imageId }),
        });
        const j = await r.json();
        let url = null;
        if (r.status === 200 && j.resultImageUrl) url = j.resultImageUrl;
        else if (r.status === 202 && j.generationId) url = await poll(j.generationId);
        else throw new Error(j.message || "try-on failed (credit refunded)");
        show($("st-prog"), false);
        $("st-resimg").src = url; show($("st-res"), true);
        pushTl({ kind: "result", thumb: url, imageId: "", url, ts: now() });
        $("st-dl").onclick = async () => {
          const b = await (await fetch(url)).blob();
          const a = document.createElement("a");
          a.href = URL.createObjectURL(b); a.download = "tryon-result.jpg"; a.click();
        };
      } catch (e) { show($("st-prog"), false); fail(e.message); show($("st-start"), true); }
    });
    $("st-retry").addEventListener("click", () => { show($("st-res"), false); show($("st-start"), true); clear(); });
    async function poll(gid) {
      for (let n = 0; n < 45; n++) {
        $("st-prog").textContent = `Checking result… (${(n + 1) * 2}s)`;
        await new Promise((r) => setTimeout(r, 2000));
        const j = await api("/api/generations/" + encodeURIComponent(gid));
        if (j.status === "COMPLETED" && j.resultImageUrl) return j.resultImageUrl;
        if (j.status === "FAILED") throw new Error("Generation failed (credit refunded) — try another photo.");
      }
      throw new Error("Still running after ~90s. Reload and try again.");
    }
    paintTl(null);
    const saved = load(PK);
    if (saved && saved.imageId && now() - saved.ts < TTL) {
      activeImageId = saved.imageId;
      ready(saved.thumb || "", "Saved photo restored — no need to re-pick.", true);
    }
  }

  /* ---- admin bundle upload ---- */
  function admin() {
    const fail = (m) => { const e = $("bd-err"); e.textContent = m; show(e, true); };
    const show = (el, on) => { el.style.display = on ? "" : "none"; };
    [0, 1, 2].forEach((i) => {
      $("file" + i).addEventListener("change", (ev) => {
        const f = ev.target.files[0];
        if (!f) return;
        if (f.size > 10 * 1024 * 1024) { fail(`Photo ${i + 1} over 10 MB.`); ev.target.value = ""; return; }
        const img = $("slot-img-" + i);
        img.src = URL.createObjectURL(f); show(img, true);
      });
    });
    $("btn-photo").addEventListener("click", () => $("file0").click());
    $("btn-cam").addEventListener("click", () => $("filecam").click());
    $("filecam").addEventListener("change", (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const dt = new DataTransfer(); dt.items.add(f);
      $("file0").files = dt.files;
      $("file0").dispatchEvent(new Event("change"));
    });
    $("bundle-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      if (!String(fd.get("title") || "").trim()) return fail("Title is required.");
      const img0 = fd.get("image0");
      if (!(img0 instanceof File) || !img0.size) return fail("Garment photo is required.");
      const btn = $("bd-submit");
      btn.disabled = true; btn.textContent = "Uploading…";
      try {
        const j = await api("/api/admin/products", { method: "POST", body: fd });
        btn.disabled = false; btn.textContent = "Save bundle";
        const ok = $("bd-ok");
        ok.innerHTML = `Saved: <a href="/app/product.html?id=${encodeURIComponent(j.id)}">${esc(j.id)}</a> — now on the landing grid.`;
        show(ok, true);
      } catch (e) { btn.disabled = false; btn.textContent = "Save bundle"; fail(e.message); }
    });
    api("/api/products").then((list) => {
      $("admin-list").innerHTML = list.slice(0, 8).map((p) =>
        `<p><a href="/app/product.html?id=${esc(p.id)}">${esc(p.title)}</a> — ${(p.price_cents / 100).toFixed(2)} ${esc(p.currency)}</p>`).join("");
    }).catch(() => {});
  }

  window.Shop = { landing, product, admin };
})();
