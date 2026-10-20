/* inspect-pages.ts - what is deployed in the account, and what a Pages
   project was built from. Used to recover the Jerboa pages (project
   "jerboa-ui") and to check a customer's domain setup.

   bun scripts/inspect-pages.ts [project_name]

   Auth (either):
     CLOUDFLARE_API_TOKEN=<token>                  (scoped API token)
     CLOUDFLARE_API_KEY=<key> + CLOUDFLARE_EMAIL=<email>   (global API key)
   Env: CLOUDFLARE_ACCOUNT_ID (optional - prints every account). */
const key = process.env.CLOUDFLARE_API_KEY;
const email = process.env.CLOUDFLARE_EMAIL;
const token = process.env.CLOUDFLARE_API_TOKEN;
const API = "https://api.cloudflare.com/client/v4";

if (!token && !(key && email)) {
  console.error("need CLOUDFLARE_API_TOKEN, or CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL");
  process.exit(2);
}
const auth: Record<string, string> = token
  ? { authorization: `Bearer ${token}` }
  : { "X-Auth-Email": email!, "X-Auth-Key": key! };

const get = async (url: string): Promise<any> => {
  const res = await fetch(`${API}${url}`, { headers: auth });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    return { _error: `${url} -> ${res.status} ${JSON.stringify(json.errors ?? json)}` };
  }
  return json.result;
};

/* 1. the accounts. */
const accounts = await get("/accounts?per_page=50");
if (accounts._error) {
  console.error(accounts._error);
  process.exit(1);
}
const list = Array.isArray(accounts) ? accounts : accounts.result ?? [];
const accs = (process.env.CLOUDFLARE_ACCOUNT_ID
  ? list.filter((a: any) => a.id === process.env.CLOUDFLARE_ACCOUNT_ID)
  : list) as any[];
for (const a of accs) console.log(`account ${a.id} ${a.name}`);

/* 2. per account: Pages projects, Workers scripts, zones, the
   workers.dev label. */
for (const a of accs) {
  const p = await get(`/accounts/${a.id}/pages/projects`);
  if (p._error) {
    console.log(`  pages: ${p._error}`);
  } else {
    for (const pr of p as any[]) {
      console.log(`  PAGES ${pr.name} | production_branch: ${pr.production_branch ?? "-"}`);
      console.log(`       build: ${pr.build_command ?? "-"} -> ${pr.build_output_dir ?? "-"}`);
      const src = pr.source ?? (pr.deployment_configs?.production?.env_vars ?? {});
      const repo = Object.entries(src ?? {}).filter(([k]) => /repo|branch|commit|sha/i.test(k));
      if (repo.length) console.log(`       source hints: ${JSON.stringify(repo)}`);
      const deps = await get(`/accounts/${a.id}/pages/projects/${pr.name}`);
      if (!deps._error) {
        console.log(`       domains: ${JSON.stringify((deps as any).domains ?? [])}`);
        const envs = (deps as any).deployment_configs?.production?.env_vars ?? {};
        const interesting = Object.entries(envs).filter(([k]) => !/^(_|CF_PAGES|NODE_)/.test(k));
        if (interesting.length) {
          console.log(`       env vars: ${interesting.map(([k, v]) => `${k}=${v}`).join(" ")}`);
        }
      }
    }
  }

  const s = await get(`/accounts/${a.id}/workers/scripts`);
  if (!s._error) {
    for (const sc of s as any[]) console.log(`  WORKER ${sc.id} (created ${sc.created_on})`);
  }
  const sub = await get(`/accounts/${a.id}/workers/subdomain`);
  if (!sub._error) console.log(`  workers.dev label: ${(sub as any).subdomain}`);

  const z = await get("/zones?per_page=50");
  if (!z._error) {
    for (const zone of z as any[]) {
      console.log(`  ZONE ${zone.name} (${zone.id}) plan: ${zone.plan?.name ?? "-"}`);
    }
  }
}

/* 3. one project in detail: its deployments. */
const project = process.argv[2];
if (project) {
  for (const a of accs) {
    const d = await get(`/accounts/${a.id}/pages/projects/${project}/deployments`);
    if (d._error) {
      console.log(`deployments for ${project}: ${d._error}`);
      continue;
    }
    for (const dep of (d as any[]).slice(0, 5)) {
      console.log(
        `DEPLOY ${dep.id} | ${dep.environment} | ${dep.latest_stage?.name ?? "-"} | ${dep.created_on}`,
      );
      for (const alias of dep.aliases ?? []) console.log(`   url: ${alias}`);
    }
  }
}
