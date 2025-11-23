export * from "./utilities-pure";

import type { NoticePoster } from "@/types/injections";
import { i18n } from "@/locales";

const { t } = i18n.global;

// report the failure if the future returned an error
//  this function can be but is not written as an async function since current code is cleaner
export function error_reporter(
  future: Promise<void>,
  description: string,
  display_notice: NoticePoster
): Promise<void> {
  return future.catch((error) => {
    display_notice("error", t("message.error.failure_report", { task: description }), String(error));
  });
}
