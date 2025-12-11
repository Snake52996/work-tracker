<template>
  <v-main>
    <router-view />
    <app-footer />
    <v-bottom-sheet v-model="notifier.notice_configuration.shown" inset>
      <v-alert
        border="start"
        closable
        max-height="80vh"
        :title="notifier.notice_configuration.title"
        :type="notifier.notice_configuration.type"
        @click:close.stop="notifier.notice_configuration.shown = false"
      >
        <p v-for="content in notifier.notice_configuration.contents" :key="content">
          {{ content }}
        </p>
      </v-alert>
    </v-bottom-sheet>
  </v-main>
</template>
<script lang="ts" setup>
import { onBeforeUnmount, onMounted, provide } from "vue";
import { useDatabaseStore } from "@/stores/database";
import { useNotifier } from "@/stores/notifier";
import { inj_DisplayNotice } from "@/types/injections";
const notifier = useNotifier();
provide(inj_DisplayNotice, notifier.post_notify);

let disarm_unsaved_guard: (() => void) | null = null;
onMounted(() => {
  const database = useDatabaseStore();
  const unsaved_guard = (event: BeforeUnloadEvent) => {
    if (database.database_ !== undefined && database.database_modified_unsaved) {
      event.preventDefault();
    }
  };
  disarm_unsaved_guard = () => {
    window.removeEventListener("beforeunload", unsaved_guard);
  };
  window.addEventListener("beforeunload", unsaved_guard);
});
onBeforeUnmount(() => {
  if (disarm_unsaved_guard !== null) {
    disarm_unsaved_guard();
  }
});
</script>
