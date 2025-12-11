import type { Reactive } from "vue";
import type { NoticeType } from "@/types/injections";
import { defineStore } from "pinia";
import { reactive } from "vue";
export const useNotifier = defineStore("notifier", () => {
  const notice_configuration: Reactive<{
    type: NoticeType;
    title: string;
    contents: string[];
    shown: boolean;
  }> = reactive({ type: "info", title: "", contents: [], shown: false });
  function post_notify(type: NoticeType, title: string, content: string) {
    notice_configuration.type = type;
    notice_configuration.title = title;
    notice_configuration.contents = content.split("\n");
    notice_configuration.shown = true;
  }
  return { notice_configuration, post_notify };
});
