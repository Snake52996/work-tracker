import type { InjectionKey } from "vue";

export type NoticeType = "error" | "info" | "success" | "warning";
export type NoticePoster = (type: NoticeType, title: string, content: string) => void;
export const inj_DisplayNotice = Symbol() as InjectionKey<NoticePoster>;
