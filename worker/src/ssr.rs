use tryon_shared::models::{Product, ProductFilter, ShopSettings};

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn topbar(_shop: &str) -> String {
    format!(
        r##"<header class="topbar"><a class="brand" href="/">{}</a><nav><a href="/admin">Admin</a></nav></header>"##,
        esc(crate::gen_texts::SHOP_NAME)
    )
}

/// Swap card — transplanted 1:1 from `design/out/card.html`
/// (ProductCard component). Placeholders replace static text; `.img` is a
/// real photo, buttons are real links, `.model-inset` holds the model
/// WITHOUT the garment. Click swaps; hold shows the styled shot.
const SWAP_JS: &str = r##"<script>(function(){function arm(root){var main=root.querySelector('img.main'),inset=root.querySelector('.model-inset'),
mi=root.dataset.model,si=root.dataset.styled,gi=root.dataset.garment,cur=root.querySelector('.swap-cur');
var showing='garment',timer=null;
function set(src,label){main.src=src;if(cur)cur.textContent=label;}
if(inset){inset.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();
if(showing==='garment'&&mi){showing='person';set(mi,'Model — hold to see it worn');}else{showing='garment';set(gi,'Garment — tap model to swap');}});}
function hold(ev){if(showing!=='person'||!si)return;ev.preventDefault();timer=setTimeout(function(){set(si,'Wearing it — release to go back');timer='held';},350);}
function release(){if(timer==='held'){set(mi,'Model — hold to see it worn');}clearTimeout(timer);timer=null;}
main.addEventListener('pointerdown',hold);main.addEventListener('pointerup',release);main.addEventListener('pointerleave',function(){clearTimeout(timer);timer=null;});}
document.querySelectorAll('.productcard').forEach(arm);})();</script>"##;

fn card(p: &Product, wa: &str, shop: &str) -> String {
    let inquire = tryon_shared::whatsapp::inquire_url(wa, shop, &p.title, &p.id);
    let model = if p.model_image_url.is_empty() { p.image_url.clone() } else { p.model_image_url.clone() };
    format!(
        r#"<article class="productcard" data-garment="{img}" data-model="{model}" data-styled="{styled}"><a href="/product/{id}"><img class="img main" loading="lazy" src="{img}" alt="{title}"/></a><div class="badge-pill"></div><p class="badge">{cat}</p><button class="model-inset" aria-label="view model"><img loading="lazy" src="{model}" alt="model without garment"/></button><p class="swap-cur">Garment — tap model to swap</p><p class="title">{title}</p><p class="price">{price}</p><a class="btn-tryon" href="/product/{id}"><span class="btn-tryon-label">Try On</span></a><a class="btn-inquire" target="_blank" rel="noopener" href="{wa}"><span class="btn-inquire-label">Inquire</span></a></article>"#,
        img = esc(&p.image_url),
        model = esc(&model),
        styled = esc(&p.styled_image_url),
        title = esc(&p.title),
        cat = esc(&p.category),
        price = esc(&p.price_display()),
        id = esc(&p.id),
        wa = esc(&inquire),
    )
}

/// Full `<head>` so WhatsApp/Twitter bots (no JS) pull title + description
/// + full image. `origin` must be absolute (`https://shop.workers.dev`).
fn shell(title: &str, desc: &str, image: &str, canonical: &str, body: &str) -> String {
    format!(
        r#"<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{t}</title><meta name="description" content="{d}"/><link rel="canonical" href="{c}"/><meta property="og:type" content="product"/><meta property="og:title" content="{t}"/><meta property="og:description" content="{d}"/><meta property="og:image" content="{i}"/><meta property="og:url" content="{c}"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="{t}"/><meta name="twitter:description" content="{d}"/><meta name="twitter:image" content="{i}"/><link rel="stylesheet" href="/styles/main.css"/><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Poppins:wght@400;600;700&display=swap"/></head><body><div id="app">{b}</div>{swap}</body></html>"#,
        t = esc(title),
        d = esc(desc),
        i = esc(image),
        c = esc(canonical),
        b = body,
        swap = SWAP_JS,
    )
}

/// Full `<head>` so WhatsApp/Twitter bots (no JS) pull title + description
/// + full image. `origin` must be absolute (`https://shop.workers.dev`).


/// SSR landing: real shop page. Search + category pills are plain
/// links/forms (server-filtered) so the page works with zero JS.
pub fn render_landing(
    shop: &ShopSettings,
    products: &[Product],
    all: &[Product],
    filter: &ProductFilter,
    origin: &str,
) -> String {
    let cards: String = products.iter().map(|p| card(p, &shop.owner_whatsapp, &shop.shop_name)).collect();
    let mut cats: Vec<String> = all.iter().map(|p| p.category.clone()).collect();
    cats.sort();
    cats.dedup();
    // Pills mirror the export (.pill-all 90px primary, .pill-1 110px);
    // extra categories flow after the two designed slots.
    let pills: String = cats
        .iter()
        .map(|c| {
            let cls = if *c == filter.category { "pill-1 on" } else { "pill-1" };
            format!(r#"<a class="{cls}" href="/?category={c}">{c}</a>"#, cls = cls, c = esc(c))
        })
        .collect();
    let body = format!(
        r#"<div class="landing"><div class="topbar"><a class="brand" href="/">{brand}</a><a class="admin-link" href="/admin">Admin</a></div><p class="hero-title">{shop}</p><p class="hero-sub">{sub}</p><form class="search" method="get" action="/"><input type="hidden" name="category" value="{cat}"/><input class="search-input" name="q" type="search" placeholder="Search products…" value="{q}"/></form><div class="pillrow"><a class="pill-all{all}" href="/">All</a>{pills}</div><p class="count">{n} products</p></div><main class="grid">{cards}</main>"#,
        brand = esc(crate::gen_texts::SHOP_NAME),
        shop = esc(crate::gen_texts::HERO_TITLE),
        sub = esc(crate::gen_texts::HERO_SUB),
        q = esc(&filter.query),
        cat = esc(&filter.category),
        all = if filter.category.is_empty() { " on" } else { "" },
        pills = pills,
        n = products.len(),
        cards = cards
    );
    let first_img = products.first().map(|p| p.image_url.clone()).unwrap_or_else(|| shop.logo_url.clone());
    shell(crate::gen_texts::SHOP_NAME, crate::gen_texts::HERO_SUB, &first_img, origin, &body)
}

/// Persistent try-on studio: vanilla JS, no bundle needed. Pick/take photo
/// -> browser validate + canvas downscale -> upload person -> sync try-on
/// (200 = result, 202 = poll) -> preview + download. Explicit buttons only.
const STUDIO_JS: &str = r##"<script>(function(){var root=document.getElementById('studio');if(!root)return;
var d=root.dataset,pickA=document.getElementById('pick-file'),pickB=document.getElementById('pick-cam'),
prev=document.getElementById('st-prev'),meta=document.getElementById('st-meta'),err=document.getElementById('st-err'),
welcome=document.getElementById('st-welcome'),start=document.getElementById('st-start'),change=document.getElementById('st-change'),
prog=document.getElementById('st-prog'),res=document.getElementById('st-res'),resImg=document.getElementById('st-resimg'),
retry=document.getElementById('st-retry'),tl=document.getElementById('st-timeline'),th=document.getElementById('st-tlhead');
var file=null,activeImageId=null,PK='tryon.person.v1',TK='tryon.timeline.v1',TTL=6*24*3600;
function load(k){try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function now(){return Math.floor(Date.now()/1000);}
function fail(m){err.textContent=m;err.style.display='block';}
function clear(){err.textContent='';err.style.display='none';}
function show(el,on){el.style.display=on?'':'none';}
function thumbOf(img,cb){var s=128/Math.max(img.naturalWidth,img.naturalHeight);
var c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*s));c.height=Math.max(1,Math.round(img.naturalHeight*s));
c.getContext('2d').drawImage(img,0,0,c.width,c.height);cb(c.toDataURL('image/jpeg',0.7));}
function pushTl(e){var l=load(TK)||[];l=l.filter(function(x){return x.thumb!==e.thumb;});l.unshift(e);save(TK,l.slice(0,12));paintTl(e.thumb);}
function paintTl(active){var l=load(TK)||[];tl.innerHTML='';if(!l.length){tl.style.display='none';th.style.display='none';return;}tl.style.display='';th.style.display='';
l.forEach(function(e){var b=document.createElement('button');b.className='tl-item'+(e.thumb===active?' on':'');b.title=e.kind;
var im=document.createElement('img');im.src=e.thumb;im.alt=e.kind;b.appendChild(im);
b.onclick=function(){selectEntry(e);};tl.appendChild(b);});}
function selectEntry(e){clear();
if(e.kind==='person'){if(!e.imageId||now()-e.ts>TTL){fail('That photo expired — pick a new one.');return;}
activeImageId=e.imageId;save(PK,{imageId:e.imageId,thumb:e.thumb,ts:e.ts});
prev.src=e.thumb;show(prev,true);meta.textContent='Saved photo — no need to re-pick.';show(start,true);show(change,true);showWelcome(true);paintTl(e.thumb);}
else{resImg.src=e.url;show(res,true);paintTl(e.thumb);res.scrollIntoView();}}
function showWelcome(on){welcome.textContent=on?'Saved photo restored — Start try-on, or Change photo.':'';show(welcome,on);}
function readyThumb(thumb,note){prev.src=thumb;show(prev,true);meta.textContent=note;show(start,true);show(change,true);}
function onPick(ev){clear();var f=ev.target.files&&ev.target.files[0];if(!f)return;
var ok=['image/jpeg','image/png','image/webp','image/heic','image/heif'];
if(f.type&&ok.indexOf(f.type)<0){fail('Unsupported type: use JPEG, PNG, WebP or HEIC.');return;}
if(f.size>10*1024*1024){fail('Photo over 10 MB — pick a smaller one.');return;}
downscale(f,function(out,mime,note){file={blob:out,mime:mime};activeImageId=null;showWelcome(false);
var u=URL.createObjectURL(out);var im=new Image();
im.onload=function(){thumbOf(im,function(t){readyThumb(u,note);save(PK,{imageId:'',thumb:t,ts:now()});pushTl({kind:'person',thumb:t,imageId:'',url:'',ts:now()});});};
im.src=u;});}
function downscale(f,cb){if(f.type==='image/heic'||f.type==='image/heif'){cb(f,f.type,'HEIC original sent as-is ('+(f.size/1048576).toFixed(1)+' MB)');return;}
var url=URL.createObjectURL(f),img=new Image();
img.onload=function(){URL.revokeObjectURL(url);var w=img.naturalWidth,h=img.naturalHeight;
if(w<256||h<256){fail('Photo too small — use at least 256x256.');return;}
var m=Math.max(w,h),tw=w,th=h;
if(m>1600){var s=1600/m;tw=Math.round(w*s);th=Math.round(h*s);}
if(tw===w){cb(f,f.type||'image/jpeg',w+'x'+h+' · '+(f.size/1048576).toFixed(1)+' MB');return;}
var c=document.createElement('canvas');c.width=tw;c.height=th;
c.getContext('2d').drawImage(img,0,0,tw,th);
c.toBlob(function(b){cb(b,'image/jpeg','resized in browser to '+tw+'x'+th+' (original was hi-res)');},'image/jpeg',0.85);};
img.onerror=function(){fail('Could not read that image.');};img.src=url;}
pickA.addEventListener('change',onPick);pickB.addEventListener('change',onPick);
change.addEventListener('click',function(){file=null;activeImageId=null;prev.src='';show(prev,false);show(start,false);show(change,false);meta.textContent='';showWelcome(false);clear();});
start.addEventListener('click',function(){if(!file&&!activeImageId){fail('Pick a photo first.');return;}clear();show(start,false);prog.textContent='Uploading photo…';show(prog,true);
function go(imageId){set_progress2('Trying it on… (about 10 seconds)');
fetch('/api/try-on/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:d.pid,title:d.title,description:d.desc,image_url:d.img,person_image_id:imageId})}).then(function(r){return r.json().then(function(j){return{status:r.status,body:j};});}).then(function(o){
if(o.status===200&&o.body.resultImageUrl){done(o.body.resultImageUrl);return;}
if(o.status===202&&o.body.generationId){poll(o.body.generationId,0);return;}
throw new Error((o.body&&o.body.message)||'try-on failed (credit refunded)');}).catch(function(e){show(prog,false);fail(e.message);show(start,true);});}
function set_progress2(m){prog.textContent=m;}
if(activeImageId){go(activeImageId);return;}
var fd=new FormData();fd.append('file',file.blob,'person.jpg');
fetch('/api/person-upload',{method:'POST',body:fd}).then(function(r){if(!r.ok)throw new Error('photo upload failed ('+r.status+')');return r.json();}).then(function(u){
if(!u.imageId)throw new Error('no imageId returned');activeImageId=u.imageId;
var im=new Image();im.onload=function(){thumbOf(im,function(t){save(PK,{imageId:u.imageId,thumb:t,ts:now()});pushTl({kind:'person',thumb:t,imageId:u.imageId,url:'',ts:now()});});};im.src=prev.src;
go(u.imageId);}).catch(function(e){show(prog,false);fail(e.message);show(start,true);});});
function poll(gid,n){if(n>=45){show(prog,false);fail('Still running after ~90s. Reload and try again.');show(start,true);return;}
prog.textContent='Checking result… ('+((n+1)*2)+'s)';
setTimeout(function(){fetch('/api/generations/'+encodeURIComponent(gid)).then(function(r){return r.json();}).then(function(j){
if(j.status==='COMPLETED'&&j.resultImageUrl){done(j.resultImageUrl);return;}
if(j.status==='FAILED'){show(prog,false);fail('Generation failed (credit refunded) — try another photo.');show(start,true);return;}
poll(gid,n+1);}).catch(function(){poll(gid,n+1);});},2000);}
function done(url){show(prog,false);resImg.src=url;show(res,true);
var im=new Image();im.onload=function(){try{thumbOf(im,function(t){pushTl({kind:'result',thumb:t,imageId:'',url:url,ts:now()});});}catch(e){pushTl({kind:'result',thumb:url,imageId:'',url:url,ts:now()});}};im.onerror=function(){pushTl({kind:'result',thumb:url,imageId:'',url:url,ts:now()});};im.crossOrigin='anonymous';im.src=url;
var dl=document.getElementById('st-dl');dl.onclick=function(){fetch(url).then(function(r){return r.blob();}).then(function(b){
var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='tryon-result.jpg';a.click();});};}
retry.addEventListener('click',function(){show(res,false);show(start,true);clear();});
(function boot(){paintTl(null);var p=load(PK);
if(p&&p.imageId&&now()-p.ts<TTL){activeImageId=p.imageId;readyThumb(p.thumb,'Saved photo restored — no need to re-pick.');showWelcome(true);paintTl(p.thumb);}})();
})();"##;

/// SSR product page + working studio. This exact URL is what shoppers
/// share, so bots get the product image + title + description with zero JS.
pub fn render_detail(shop: &ShopSettings, p: &Product, origin: &str) -> String {
    let canonical = tryon_shared::photo::share_url(origin, &p.id);
    let inquire = tryon_shared::whatsapp::inquire_url(&shop.owner_whatsapp, &shop.shop_name, &p.title, &p.id);
    let wa_share = tryon_shared::whatsapp::wa_share_url(origin, &p.title, &p.id);
    let body = format!(
        r#"{top}<a class="back" href="/">← Back to shop</a><article class="detail"><img src="{img}" alt="{title}"/><div><h1>{title}</h1><p>{desc}</p><p class="price">{price}</p><div class="row"><a class="btn wa" target="_blank" rel="noopener" href="{wa}">Inquire on WhatsApp</a></div><div class="share-row"><input class="share-link" readonly value="{canon}" onclick="this.select()"/><a class="btn" target="_blank" rel="noopener" href="{share}">Share</a></div></div></article><section class="studio" id="studio" data-pid="{id}" data-title="{title}" data-desc="{desc}" data-img="{img}"><h2>Virtual try-on</h2><div class="studio-pick"><p>Select a clear front-facing photo, or take one now.</p><div class="row"><label class="btn primary">Choose photo<input id="pick-file" type="file" accept="image/*" hidden/></label><label class="btn">Take photo<input id="pick-cam" type="file" accept="image/*" capture="user" hidden/></label></div><p class="hint">JPEG / PNG / WebP / HEIC · max 10 MB · hi-res auto-resized in your browser</p></div><img id="st-prev" class="studio-preview" style="display:none" alt="your photo"/><p id="st-meta" class="hint"></p><p id="st-welcome" class="hint ok" style="display:none"></p><p id="st-err" class="error" style="display:none"></p><div class="row"><button id="st-start" class="btn primary" style="display:none">Start try-on</button><button id="st-change" class="btn" style="display:none">Change photo</button></div><p id="st-prog" class="progress" style="display:none"></p><div id="st-res" style="display:none"><img id="st-resimg" class="studio-result-img" alt="try-on result"/><div class="row"><button id="st-dl" class="btn primary">Download image</button><button id="st-retry" class="btn">Try again</button></div><p class="hint">Result links expire — download it now to keep it.</p></div><h3 id="st-tlhead" class="tl-head" style="display:none">Your timeline</h3><div id="st-timeline" class="tl-row" style="display:none"></div></section>{js}"#,
        top = topbar(&shop.shop_name),
        img = esc(&p.image_url),
        title = esc(&p.title),
        desc = esc(&p.description),
        price = esc(&p.price_display()),
        wa = esc(&inquire),
        canon = esc(&canonical),
        share = esc(&wa_share),
        id = esc(&p.id),
        js = STUDIO_JS,
    );
    shell(&p.title, &p.description, &p.image_url, &canonical, &body)
}

const ADMIN_JS: &str = r##"<script>(function(){var slots=[0,1,2].map(function(i){return{img:document.getElementById('slot-img-'+i),input:document.getElementById('file'+i)};});
function fail(m){var e=document.getElementById('bd-err');e.textContent=m;e.style.display='block';}
function hook(i){var s=slots[i];s.input.addEventListener('change',function(){var f=s.input.files[0];if(!f)return;
if(f.size>10*1024*1024){fail('Photo '+(i+1)+' over 10 MB.');s.input.value='';return;}
var ok=['image/jpeg','image/png','image/webp','image/heic','image/heif'];
if(f.type&&ok.indexOf(f.type)<0){fail('Photo '+(i+1)+': use JPEG, PNG, WebP or HEIC.');s.input.value='';return;}
s.img.src=URL.createObjectURL(f);s.img.style.display='';});}
slots.forEach(function(_,i){hook(i);});
document.getElementById('btn-cam').addEventListener('click',function(){document.getElementById('filecam').click();});
document.getElementById('btn-photo').addEventListener('click',function(){document.getElementById('file0').click();});
document.getElementById('filecam').addEventListener('change',function(ev){var f=ev.target.files[0];if(!f)return;
var dt=new DataTransfer();dt.items.add(f);document.getElementById('file0').files=dt.files;
document.getElementById('file0').dispatchEvent(new Event('change'));});
document.getElementById('bundle-form').addEventListener('submit',function(ev){ev.preventDefault();
var fd=new FormData(ev.target);if(!fd.get('title')||!String(fd.get('title')).trim()){fail('Title is required.');return;}
if(!(fd.get('image0') instanceof File)||!fd.get('image0').size){fail('Garment photo is required.');return;}
var btn=document.getElementById('bd-submit');btn.disabled=true;btn.textContent='Uploading…';
fetch('/api/admin/products',{method:'POST',body:fd}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});}).then(function(o){
btn.disabled=false;btn.textContent='Save bundle';
if(!o.ok||!o.j.id)throw new Error((o.j&&o.j.message)||'upload failed');
document.getElementById('bd-ok').innerHTML='Saved: <a href="/product/'+o.j.id+'">'+o.j.id+'</a> — now on the landing grid.';
document.getElementById('bd-ok').style.display='';}).catch(function(e){btn.disabled=false;btn.textContent='Save bundle';fail(e.message);});});
})();</script>"##;

pub fn render_admin(shop: &ShopSettings, origin: &str) -> String {
    let body = format!(
        r#"{top}<div class="bundle"><p class="title">Upload bundle — 3 photos</p><p class="lab1">1 · Garment *</p><p class="lab2">2 · Model without *</p><p class="lab3">3 · Styled (auto after try-on)</p><form id="bundle-form" method="post" action="/api/admin/products" enctype="multipart/form-data"><label class="slot-garment" title="tap to pick garment photo"><img id="slot-img-0" class="slot-img slot0" style="display:none" alt="garment preview"/><input id="file0" name="image0" type="file" accept="image/*" hidden/></label><label class="slot-model" title="tap to pick model photo"><img id="slot-img-1" class="slot-img slot1" style="display:none" alt="model preview"/><input id="file1" name="image1" type="file" accept="image/*" hidden/></label><label class="slot-styled" title="tap to pick styled photo"><img id="slot-img-2" class="slot-img slot2" style="display:none" alt="styled preview"/><input id="file2" name="image2" type="file" accept="image/*" hidden/></label><p class="cap1">Garment flat</p><p class="cap2">Person, no garment</p><p class="cap3">Filled by first try-on result</p><button type="button" class="btn-photo" id="btn-photo">Product photo</button><button type="button" class="btn-cam" id="btn-cam">Take photo</button><input id="filecam" type="file" accept="image/*" capture="environment" hidden/><input class="f-title f-in" name="title" required placeholder="Title *"/><input class="f-price f-in" name="price_cents" type="number" min="0" placeholder="Price (cents) *"/><input class="f-cat f-in" name="category" placeholder="Category"/><input class="f-sizes f-in" name="sizes" placeholder="Sizes S,M,L"/><input class="f-desc f-in" name="description" placeholder="Description — helps the AI fit it right"/><button class="submit" id="bd-submit" type="submit"><span class="submit-t">Save bundle</span></button><p class="error" id="bd-err" style="display:none"></p><p class="ok" id="bd-ok" style="display:none"></p></form><p class="note">Stored as R2 keys garment / model / styled per product.</p></div>{js}"#,
        top = topbar(&shop.shop_name),
        js = ADMIN_JS,
    );
    shell("Admin", "Owner product upload.", "", origin, &body)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shop() -> ShopSettings {
        ShopSettings {
            shop_name: "S".into(),
            owner_whatsapp: "123".into(),
            currency: "USD".into(),
            logo_url: "".into(),
        }
    }

    fn product() -> Product {
        Product {
            id: "p1".into(),
            title: "Silk Dress".into(),
            description: "Red silk".into(),
            price_cents: 4999,
            currency: "USD".into(),
            image_url: "https://cdn/x.jpg".into(),
            model_image_url: "".into(),
                model_image_url: "".into(),
                styled_image_url: "".into(),
            styled_image_url: "".into(),
                model_image_url: "".into(),
                styled_image_url: "".into(),
            r2_key: "".into(),
            category: "Dresses".into(),
            sizes: vec![],
            created_at: "".into(),
        }
    }

    #[test]
    fn landing_contains_cards_and_wa_link() {
        let html = render_landing(&shop(), &[], &[], &ProductFilter::default(), "https://shop.com");
        assert!(html.contains("Search products"));
        assert!(html.contains("og:title"));
    }

    #[test]
    fn detail_has_absolute_og_image_for_bots() {
        let html = render_detail(&shop(), &product(), "https://shop.com");
        assert!(html.contains(r#"property="og:image" content="https://cdn/x.jpg""#));
        assert!(html.contains("https://shop.com/product/p1"));
        assert!(html.contains("twitter:card"));
        assert!(html.contains("id=\"st-start\""));
    }
}
