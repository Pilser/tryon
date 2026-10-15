/* main.ts — boot by page. Exactly one page module per HTML shell. */
import { landing } from "./pages/landing";
import { product } from "./pages/product";
import { admin } from "./pages/admin";
import { skin } from "./skin";

const page = document.body.dataset.page;
async function boot(): Promise<void> {
  if (page === "product") await product();
  else if (page === "admin") admin();
  else await landing();
  skin();
}
void boot();
