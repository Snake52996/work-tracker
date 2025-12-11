/**
 * router/index.ts
 *
 * Automatic routes for `./src/pages/*.vue`
 */

// Composables
import { setupLayouts } from "virtual:generated-layouts";
import { createRouter, createWebHistory } from "vue-router";
import { routes } from "vue-router/auto-routes";
import { i18n } from "@/locales";
import { useDatabaseStore } from "@/stores/database";
import { useNotifier } from "@/stores/notifier";

const { t } = i18n.global;

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: setupLayouts(routes),
});

// Workaround for https://github.com/vitejs/vite/issues/11804
router.onError((err, to) => {
  if (err?.message?.includes?.("Failed to fetch dynamically imported module")) {
    if (localStorage.getItem("vuetify:dynamic-reload")) {
      console.error("Dynamic import error, reloading page did not fix it", err);
    } else {
      console.log("Reloading page to fix dynamic import error");
      localStorage.setItem("vuetify:dynamic-reload", "true");
      location.assign(to.fullPath);
    }
  } else {
    console.error(err);
  }
});

let notifier: ReturnType<typeof useNotifier> | null = null;
let database: ReturnType<typeof useDatabaseStore> | null = null;

router.isReady().then(() => {
  localStorage.removeItem("vuetify:dynamic-reload");
  // pinia stores, cannot be acquired before pinia has been setup
  // we delay this call to the moment first router navigation has done
  notifier = useNotifier();
  database = useDatabaseStore();
});

// the unsaved change guard should not be triggered until this timestamp
let no_unsaved_guard_till = 0;

router.beforeEach(to => {
  if (notifier === null || database === null) {
    return true;
  }
  if (database.database_ === undefined) {
    return true;
  }
  // this is the list of paths that are always safe to navigate to, even if there are some unsaved changes
  if (["/Main", "/Maintenance"].includes(to.path)) {
    return true;
  }
  if (database.database_modified_unsaved && Date.now() > no_unsaved_guard_till) {
    notifier.post_notify("warning", t("message.unsaved_changes.title"), t("message.unsaved_changes.content"));
    no_unsaved_guard_till = Date.now() + 60_000;
    return false;
  }
  database.reset();
  return true;
});

export default router;
