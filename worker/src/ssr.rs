use tryon_shared::models::{Product, ProductFilter, ShopSettings};

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn topbar(shop: &str) -> String {
    format!(
        r##"<header class="topbar"><a class="brand" href="/">{}</a><nav><a href="/admin">Admin</a></nav></header>"##,
        esc(shop)
    )
}

fn card(p: &Product, wa: &str, shop: &str) -> String {
    let inquire = tryon_shared::whatsapp::inquire_url(wa, shop, &p.title, &p.id);
    format!(
        r#"<article class="card"><a href="/product/{id}"><img loading="lazy" src="{img}" alt="{title}"/></a><div class="card-body"><span class="eyebrow">{cat}</span><h3>{title}</h3><p class="price">{price}</p><div class="actions"><a class="btn primary" href="/product/{id}">Try On</a><a class="btn wa" target="_blank" rel="noopener" href="{wa}">Inquire</a></div></div></article>"#,
        img = esc(&p.image_url),
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
        r#"<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{t}</title><meta name="description" content="{d}"/><link rel="canonical" href="{c}"/><meta property="og:type" content="product"/><meta property="og:title" content="{t}"/><meta property="og:description" content="{d}"/><meta property="og:image" content="{i}"/><meta property="og:url" content="{c}"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="{t}"/><meta name="twitter:description" content="{d}"/><meta name="twitter:image" content="{i}"/><link rel="stylesheet" href="/styles/main.css"/></head><body><div id="app">{b}</div></body></html>"#,
        t = esc(title),
        d = esc(desc),
        i = esc(image),
        c = esc(canonical),
        b = body
    )
}

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
    let pills: String = cats
        .iter()
        .map(|c| {
            let active = if *c == filter.category { " class=\"on\"" } else { "" };
            format!(r#"<a{active} href="/?category={c}">{c}</a>"#, active = active, c = esc(c))
        })
        .collect();
    let body = format!(
        r#"{top}<section class="hero"><h1>{shop}</h1><p>Shop the collection. Try it on virtually, or inquire on WhatsApp.</p><form class="filterbar" method="get" action="/"><input name="q" type="search" placeholder="Search products…" value="{q}"/><input type="hidden" name="category" value="{cat}"/><button class="btn primary" type="submit">Search</button></form><div class="pills"><a href="/">All</a>{pills}</div><p class="count">{n} products</p></section><main class="grid">{cards}</main>"#,
        top = topbar(&shop.shop_name),
        shop = esc(&shop.shop_name),
        q = esc(&filter.query),
        cat = esc(&filter.category),
        pills = pills,
        n = products.len(),
        cards = cards
    );
    let first_img = products.first().map(|p| p.image_url.clone()).unwrap_or_else(|| shop.logo_url.clone());
    shell(&shop.shop_name, "Shop the collection with AI virtual try-on.", &first_img, origin, &body)
}

/// Persistent try-on studio: vanilla JS, no bundle needed. Pick/take photo
/// -> browser validate + canvas downscale -> upload person -> sync try-on
/// (200 = result, 202 = poll) -> preview + download. Explicit buttons only.
const STUDIO_JS: &str = r##"(function(){var root=document.getElementById('studio');if(!root)return;
var d=root.dataset,pickA=document.getElementById('pick-file'),pickB=document.getElementById('pick-cam'),
prev=document.getElementById('st-prev'),meta=document.getElementById('st-meta'),err=document.getElementById('st-err'),
welcome=document.getElementById('st-welcome'),start=document.getElementById('st-start'),change=document.getElementById('st-change'),
prog=document.getElementById('st-prog'),res=document.getElementById('st-res'),resImg=document.getElementById('st-resimg'),
retry=document.getElementById('st-retry'),tl=document.getElementById('st-timeline');
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
function paintTl(active){var l=load(TK)||[];tl.innerHTML='';if(!l.length){tl.style.display='none';return;}tl.style.display='';
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
        r#"{top}<a class="back" href="/">← Back to shop</a><article class="detail"><img src="{img}" alt="{title}"/><div><h1>{title}</h1><p>{desc}</p><p class="price">{price}</p><div class="row"><a class="btn wa" target="_blank" rel="noopener" href="{wa}">Inquire on WhatsApp</a></div><div class="share-row"><input class="share-link" readonly value="{canon}" onclick="this.select()"/><a class="btn" target="_blank" rel="noopener" href="{share}">Share</a></div></div></article><section class="studio" id="studio" data-pid="{id}" data-title="{title}" data-desc="{desc}" data-img="{img}"><h2>Virtual try-on</h2><div class="studio-pick"><p>Select a clear front-facing photo, or take one now.</p><div class="row"><label class="btn primary">Choose photo<input id="pick-file" type="file" accept="image/*" hidden/></label><label class="btn">Take photo<input id="pick-cam" type="file" accept="image/*" capture="user" hidden/></label></div><p class="hint">JPEG / PNG / WebP / HEIC · max 10 MB · hi-res auto-resized in your browser</p></div><img id="st-prev" class="studio-preview" style="display:none" alt="your photo"/><p id="st-meta" class="hint"></p><p id="st-welcome" class="hint ok" style="display:none"></p><p id="st-err" class="error" style="display:none"></p><div class="row"><button id="st-start" class="btn primary" style="display:none">Start try-on</button><button id="st-change" class="btn" style="display:none">Change photo</button></div><p id="st-prog" class="progress" style="display:none"></p><div id="st-res" style="display:none"><img id="st-resimg" class="studio-result-img" alt="try-on result"/><div class="row"><button id="st-dl" class="btn primary">Download image</button><button id="st-retry" class="btn">Try again</button></div><p class="hint">Result links expire — download it now to keep it.</p></div><h3 class="tl-head">Your timeline</h3><div id="st-timeline" class="tl-row" style="display:none"></div></section>{js}"#,
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

pub fn render_admin(shop: &ShopSettings, origin: &str) -> String {
    let body = format!(
        r#"{top}<main class="admin"><h1>Admin — {shop}</h1><form id="upload" method="post" action="/api/admin/products" enctype="multipart/form-data"><input name="title" required placeholder="Title"/><input name="price_cents" type="number" required placeholder="Price (cents)"/><input name="category" placeholder="Category"/><input name="image" type="file" accept="image/*" required/><button class="btn primary" type="submit">Upload to R2</button></form><div id="admin-list"></div></main>"#,
        top = topbar(&shop.shop_name),
        shop = esc(&shop.shop_name)
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
