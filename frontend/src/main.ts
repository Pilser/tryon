/* main.ts - boot by page. Exactly one page module per HTML shell. */
import { landing } from "./pages/landing";
import { product } from "./pages/product";
import { studio } from "./pages/studio";
import { skin } from "./skin";

const page = document.body.dataset.page;
async function boot(): Promise<void> {
  if (page === "product") await product();
  else if (page === "studio") await studio();
  else await landing();
  skin();
}
void boot();
