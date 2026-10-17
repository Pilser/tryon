/* pages/dashboard.ts - owner usage dashboard as its own page: a login gate
   (same owner token as the studio) and the full-width tabbed dashboard. */
import { ownerLogin } from "../core/api";
import { loadOwner, saveOwner } from "../core/store";
import { renderDashboard } from "../components/dashboard";
import { skin } from "../skin";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n as T;
}

export async function dashboard(): Promise<void> {
  const box = el("dash");
  const login = el("dash-login");
  const open = async (): Promise<void> => {
    login.style.display = "none";
    box.style.display = "";
    await renderDashboard(box);
  };
  const t = loadOwner();
  if (t) {
    try {
      await ownerLogin(t);
      await open();
      return;
    } catch {
      saveOwner(""); // stale token: show the gate
    }
  }
  const fail = el("db-login-err");
  login.style.display = "";
  el("db-login").addEventListener("click", () => void (async () => {
    const token = (el("db-token") as HTMLInputElement).value.trim();
    if (!token) { fail.textContent = "Enter your owner token."; fail.style.display = ""; return; }
    try {
      await ownerLogin(token);
      saveOwner(token);
      await open();
    } catch {
      fail.textContent = "Wrong token - try again.";
      fail.style.display = "";
    }
  })());
  el("db-token").addEventListener("keydown", (ev) => {
    if ((ev as KeyboardEvent).key === "Enter") (el("db-login") as HTMLButtonElement).click();
  });
}
