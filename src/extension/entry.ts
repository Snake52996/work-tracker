// ==UserScript==
// @name        WT injector
// @namespace   Violentmonkey Scripts
// @match       *://*/*
// @grant       GM.addStyle
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.deleteValue
// @grant       GM_addValueChangeListener
// @version     1.4
// ==/UserScript==
import { InjectorConfiguration } from "./types/configuration";
import { start_configuration } from "./userscripts/configurations";
import { start_injector } from "./userscripts/injector";

const ConfigurePageURL = "https://snake.moe/wt-injector/";

(() => {
  // entry point of this script
  async function injection_proxy() {
    // if we are on the configuring page, do configurations
    if (window.location.href === ConfigurePageURL) {
      window.addEventListener("load", () => {
        start_configuration();
      });
      return;
    }
    // get an instance of the injector configurations
    const load_result = await InjectorConfiguration.from_store();
    if (load_result.is_err()) {
      alert(String(load_result.unwrap_error()));
      return;
    }
    const configuration = load_result.unwrap();
    // try to match current page
    const host = configuration.hosts.find(host => window.location.href.match(new RegExp(host.host)) !== null);
    if (host === undefined) {
      return;
    }
    window.addEventListener("load", () => {
      start_injector(host, configuration);
    });
  }
  injection_proxy();
})();
