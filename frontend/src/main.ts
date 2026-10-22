/* main.ts - boot by page. Exactly one page module per HTML shell. */
import { landing } from "./pages/landing";
import { product } from "./pages/product";
import { studio } from "./pages/studio";
import { dashboard } from "./pages/dashboard";
import { skin } from "./skin";
import { installErrorLog } from "./core/log";

const page = document.body.dataset.page;
installErrorLog();
skin(); // Paint the static shell instantly; pages re-run it after render.
async function boot(): Promise<void> {
  if (page === "product") await product();
  else if (page === "studio") await studio();
  else if (page === "dashboard") await dashboard();
  else await landing();
  skin();
}
void boot();
