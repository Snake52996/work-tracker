<template>
  <v-sheet>
    <v-container>
      <v-progress-linear
        v-if="working"
        v-model="progress"
        :buffer-value="listing_progress"
        color="secondary"
        stream
      />
      <v-file-input
        v-model="selected_files"
        hide-input
        multiple
        prepend-icon="mdi-file-multiple"
        @update:model-value="do_import"
      />
    </v-container>
  </v-sheet>
</template>
<script setup lang="ts">
import type { DataItem } from "@/types/datasource-data";
import { inject } from "vue";
import { VFileInput } from "vuetify/components";
import { i18n } from "@/locales";
import { load_dumped_item, type LoadedImage } from "@/procedures/item-migrant";
import { useDatabaseStore } from "@/stores/database";

import { inj_DisplayNotice } from "@/types/injections";
import { explain_invalid_reason } from "@/types/invalid-items";

const { t } = i18n.global;
const database_store = useDatabaseStore();
const working: Ref<boolean> = ref(false);
const progress: Ref<number> = ref(0);
const listing_progress: Ref<number> = ref(0);
const emit = defineEmits<{
  done: [];
}>();
const display_notice = inject(inj_DisplayNotice)!;
function stem(filename: string) {
  const last_dot = filename.lastIndexOf(".");
  return last_dot <= 0 ? filename : filename.slice(0, last_dot);
}
async function do_import_internal(data_files: File[], image_files: Map<string, File>) {
  let finished_items = 0;
  const update_progress = () => {
    finished_items += 1;
    progress.value = (finished_items / data_files.length) * 100;
  };
  const data_items = await Promise.all(
    data_files.map(async file => {
      const text = await file.text();
      try {
        const result = await load_dumped_item(
          database_store.database_!.configurations.entry,
          text,
          image_files.get(stem(file.name)),
        );
        update_progress();
        if (result.is_err()) {
          display_notice(
            "error",
            t("message.error.failed_to_parse_imported_data"),
            String(result.unwrap_error()),
          );
          return null;
        }
        return result.unwrap();
      } catch (error) {
        display_notice("error", t("message.error.failed_to_parse_imported_data"), String(error));
        update_progress();
        return null;
      }
    }),
  );
  if (data_items.includes(null)) {
    emit("done");
    return;
  }
  const errors = await database_store.place_item(
    (
      data_items as {
        data: DataItem;
        images?: LoadedImage;
      }[]
    ).map(({ data, images }) => ({ source: data, images: images })),
  );
  emit("done");
  if (errors.length > 0) {
    display_notice(
      "error",
      t("message.error.failed_to_import_reasons"),
      errors
        .map(({ index, reason }) => `${data_files[index]!.name}: ${explain_invalid_reason(reason)}`)
        .slice(0, 24)
        .join("\n"),
    );
  }
}
async function do_import_starter(files: File[]) {
  const file_count = files.length;
  const data_files: File[] = [];
  const image_files: Map<string, File> = new Map();
  for (const [index, file] of files.entries()) {
    if (file.name.endsWith(".json")) {
      data_files.push(file);
    } else {
      image_files.set(stem(file.name), file);
    }
    listing_progress.value = ((index + 1) / file_count) * 100;
  }
  await do_import_internal(data_files, image_files);
}

const selected_files: Ref<File[]> = ref([]);
function do_import(files: File | File[] | undefined) {
  if (files === undefined) {
    return;
  }
  const real_files = files instanceof File ? [files] : files;
  selected_files.value = [];
  working.value = true;
  do_import_starter(real_files).then(() => {
    working.value = false;
  });
}
</script>
