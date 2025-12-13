<template>
  <v-row>
    <v-col
      class="display-column"
      :lg="column_sizes.lg"
      :md="column_sizes.md"
      :sm="column_sizes.sm"
      :style="column_style"
      :xl="column_sizes.xl"
      :xxl="column_sizes.xxl"
    >
      <item-viewer
        :configuration="database_store.database_!.configurations.entry.entries"
        :data="effective_data"
        :data-id="props.dataId ?? ''"
        :in-editor="true"
        :override-image="override_image"
      />
    </v-col>
    <v-col
      class="display-column"
      :lg="column_sizes.lg"
      :md="column_sizes.md"
      :sm="column_sizes.sm"
      :style="column_style"
      :xl="column_sizes.xl"
      :xxl="column_sizes.xxl"
    >
      <v-card :loading="submitting">
        <v-card-text v-if="database_store.has_image">
          <v-btn block class="mb-6" @click="emit('done')"> {{ $t("action.cancel") }} </v-btn>
          <v-text-field
            v-model="remote_image_load.url"
            clearable
            density="comfortable"
            :label="$t('message.load_image_from_url')"
            :loading="remote_image_load.loading"
            prepend-icon="mdi-link-variant"
            @click:clear="remote_image_load.url = ''"
            @keydown.enter="load_image_from_url"
          >
            <template #append>
              <v-btn
                :disabled="remote_image_load.url.length === 0"
                icon="mdi-download"
                :loading="remote_image_load.loading"
                @click="load_image_from_url"
              />
            </template>
          </v-text-field>
          <v-file-input
            v-model="image_files"
            accept="image/*"
            density="compact"
            :label="$t('message.load_image_from_file')"
            prepend-icon="mdi-image"
            @update:model-value="load_image_from_file"
          />
        </v-card-text>
        <v-card-text v-if="local_data_ready">
          <template
            v-for="(entry, index) in database_store.database_?.configurations.entry.entries"
            :key="index"
          >
            <v-row>
              <v-col cols="12">
                <v-divider v-if="database_store.has_image || index !== 0" />
              </v-col>
              <v-col cols="12">
                <p>{{ entry.name }}</p>
              </v-col>
              <v-col cols="12">
                <item-string-editor
                  v-if="entry.type === 'string'"
                  :data="local_data.entries.get(entry.name) as StringEntryData"
                />
                <item-rating-editor
                  v-else-if="entry.type === 'rating'"
                  :configuration="entry"
                  :data="local_data.entries.get(entry.name) as InternalRatingEntryData"
                />
                <item-tag-editor
                  v-else-if="entry.type === 'tag'"
                  :configuration="entry"
                  :data="local_data.entries.get(entry.name) as InternalTagEntryData"
                  :entry-name="entry.name"
                />
              </v-col>
            </v-row>
          </template>
          <v-banner v-if="data_invalid_reasons.length > 0" class="my-6" color="error" icon="$error">
            <v-banner-text>
              {{
                `${$t("message.error.cannot_commit_modification")}\n${data_invalid_reasons
                  .map(explain_invalid_reason)
                  .join("; ")}`
              }}
            </v-banner-text>
          </v-banner>
          <v-row justify="space-around">
            <v-col cols="5">
              <v-btn block color="primary" :disabled="data_invalid_reasons.length > 0" @click="submit">
                {{ $t("action.confirm") }}
              </v-btn>
            </v-col>
            <v-col cols="5">
              <v-btn block @click="emit('done')"> {{ $t("action.cancel") }} </v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>
<script setup lang="ts">
import type { Reactive } from "vue";
import type { DataItem } from "@/types/datasource-data";
import type {
  InternalDataItem,
  InternalEntryData,
  InternalRatingEntryData,
  InternalTagEntryData,
  RatingEntryData,
  StringEntryData,
  TagEntryData,
} from "@/types/datasource-entry";
import { computed, inject, onMounted, reactive } from "vue";
import { VFileInput } from "vuetify/components";
import { i18n } from "@/locales";
import { load_image } from "@/procedures/image-utils";
import { validate_internal_item } from "@/procedures/item-validator";
import { dual_way_filter, try_complete_url } from "@/procedures/utilities";
import { useDatabaseStore } from "@/stores/database";
import { ImageImageFormat, ThumbnailImageFormat } from "@/types/image-types";

import { inj_DisplayNotice } from "@/types/injections";
import { explain_invalid_reason, type ItemInvalidReason } from "@/types/invalid-items";

const { t } = i18n.global;
const display_notice = inject(inj_DisplayNotice)!;
const database_store = useDatabaseStore();
const props = defineProps<{ data?: DataItem; dataId?: string }>();
const emit = defineEmits<{
  done: [];
}>();

const column_sizes = computed(() => ({
  sm: database_store.has_image ? "" : "12",
  md: database_store.has_image ? "" : "12",
  lg: database_store.has_image ? "" : "6",
  xl: database_store.has_image ? "" : "6",
  xxl: database_store.has_image ? "" : "4",
}));
const column_style = computed(() =>
  database_store.has_image ? `width: ${database_store.image_size.width}px` : "",
);

// we maintain a local copy of the data if we are editing: we do not want modifications goes straight down to
//  the database, which may introduce overhead and cause chaos
const local_data: Ref<InternalDataItem> = ref({ entries: new Map<string, InternalEntryData>() });
const override_image: Ref<string> = ref("");
const local_data_ready: Ref<boolean> = ref(false);
const effective_data = computed((): InternalDataItem => {
  if (local_data_ready.value === false) {
    return { entries: new Map() };
  }
  const helper = database_store
    .database_!.configurations.entry.entries.map(entry_config => {
      const entry_value = local_data.value.entries.get(entry_config.name)!;
      if (entry_config.type === "string" && (entry_value as StringEntryData).value === "") {
        return undefined;
      } else if (entry_config.type === "tag" && (entry_value as InternalTagEntryData).tags.length === 0) {
        return undefined;
      } else if (entry_config.type === "rating" && (entry_value as InternalRatingEntryData).score === 0) {
        return undefined;
      }
      return [entry_config.name, entry_value] as [string, InternalEntryData];
    })
    .filter(value => value !== null && value !== undefined);
  const result = {
    image: local_data.value.image,
    entries: new Map<string, InternalEntryData>(helper),
  };
  return result;
});

const image_helpers: {
  image_url: string | null;
  image_bitmap: ImageBitmap | null;
  thumbnail_url: string | null;
  thumbnail_bitmap: ImageBitmap | null;
} = {
  image_url: null,
  image_bitmap: null,
  thumbnail_url: null,
  thumbnail_bitmap: null,
};

onMounted(() => {
  image_helpers.image_url = null;
  image_helpers.image_bitmap = null;
  image_helpers.thumbnail_url = null;
  image_helpers.thumbnail_bitmap = null;
  // build local data
  if (props.data !== undefined && props.dataId !== undefined) {
    // fetch provided data
    //  we need to do deep copy so that modifications not yet submitted will not leak to database
    local_data.value.image = props.data.image === undefined ? undefined : { ...props.data.image };
    if (props.data.entries) {
      for (const [key, value] of props.data.entries.entries()) {
        const config = database_store.database_!.configurations.entry.entries.find(
          value => value.name === key,
        )!;
        switch (config.type) {
          case "rating": {
            const data = value as RatingEntryData;
            local_data.value.entries.set(key, {
              score: data.score,
              comment: data.comment ?? "",
              use_comment: data.comment ? true : false,
            });
            break;
          }
          case "string": {
            const data = value as StringEntryData;
            local_data.value.entries.set(key, {
              value: data.value,
            });
            break;
          }
          case "tag": {
            const data = value as TagEntryData;
            local_data.value.entries.set(key, {
              tags: [...data.tags],
            });
            break;
          }
          // No default
        }
      }
    }
    // prepare image
    if (database_store.has_image) {
      database_store.get_image(props.dataId).then(image => {
        image.map(value => (override_image.value = value));
      });
    }
  }
  // emplace default (empty) values to undefined entries
  //  this will help editor by providing valid storages for each possible entries
  for (const entry of database_store.database_!.configurations.entry.entries) {
    if (local_data.value.entries!.has(entry.name)) {
      continue;
    }
    switch (entry.type) {
      case "string": {
        local_data.value.entries!.set(entry.name, { value: "" } as StringEntryData);
        break;
      }
      case "tag": {
        local_data.value.entries!.set(entry.name, { tags: [] } as TagEntryData);
        break;
      }
      case "rating": {
        local_data.value.entries!.set(entry.name, {
          score: 0,
          comment: "",
          use_comment: false,
        } as InternalRatingEntryData);
        break;
      }
      // No default
    }
  }
  local_data_ready.value = true;
});

const image_files: Ref<File | undefined> = ref(undefined);

function load_image_internal(image: Blob | HTMLImageElement) {
  load_image(image, database_store.image_size, ImageImageFormat, ThumbnailImageFormat).then(result_ => {
    image_files.value = undefined;
    if (result_.is_err()) {
      display_notice("error", t("message.error.failed_to_import_image"), String(result_.unwrap_error()));
      return;
    }
    const result = result_.unwrap();
    // free previous temporary image
    if (image_helpers.image_bitmap !== null) {
      image_helpers.image_bitmap.close();
      URL.revokeObjectURL(image_helpers.image_url!);
      image_helpers.thumbnail_bitmap!.close();
      URL.revokeObjectURL(image_helpers.thumbnail_url!);
    }
    // store new image
    image_helpers.image_bitmap = result.image;
    image_helpers.thumbnail_bitmap = result.thumbnail;
    image_helpers.image_url = result.image_url;
    image_helpers.thumbnail_url = result.thumbnail_url;
    // update override image
    override_image.value = image_helpers.image_url;
    remote_image_load.url = "";
  });
}

const remote_image_load: Reactive<{
  url: string;
  loading: boolean;
}> = reactive({ url: "", loading: false });
function load_image_from_url() {
  remote_image_load.loading = true;
  const url = try_complete_url(remote_image_load.url);
  if (url === null) {
    display_notice("error", t("message.error.invalid_url"), "");
    return;
  }
  (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        display_notice(
          "error",
          t("message.error.failed_to_fetch_data", { source: url }),
          response.statusText,
        );
        return;
      }
      const content = await response.blob();
      load_image_internal(content);
    } catch (error) {
      display_notice("error", t("message.error.failed_to_fetch_data", { source: url }), String(error));
    }
  })()
    .catch(error => {
      display_notice("error", t("message.error.failed_to_fetch_data", { source: url }), String(error));
    })
    .finally(() => {
      remote_image_load.loading = false;
    });
}

function load_image_from_file(files: File | File[] | undefined) {
  image_files.value = undefined;
  if (files === undefined || Array.isArray(files)) {
    return;
  }
  load_image_internal(files);
}

const data_invalid_reasons = computed((): ItemInvalidReason[] => {
  if (local_data_ready.value === false) {
    return [];
  }
  return validate_internal_item(
    effective_data.value,
    override_image.value,
    database_store.database_!.configurations.entry,
  );
});

async function submit_internal() {
  const result: DataItem = {};
  // prepare the images
  const images = (() => {
    if (image_helpers.image_bitmap === null) {
      return undefined;
    }
    return {
      image: image_helpers.image_bitmap!,
      image_url: image_helpers.image_url!,
      thumbnail: image_helpers.thumbnail_bitmap!,
      thumbnail_url: image_helpers.thumbnail_url!,
    };
  })();
  result.image = local_data.value.image;
  // handle each entry
  if (database_store.entries.length > 0) {
    result.entries = new Map();
  }
  const tag_patch = database_store.prepare_tag_registration();
  for (const entry_config of database_store.entries) {
    const data_ = effective_data.value.entries.get(entry_config.name);
    if (data_ === undefined) {
      continue;
    }
    switch (entry_config.type) {
      case "string": {
        result.entries!.set(entry_config.name, data_ as StringEntryData);
        break;
      }
      case "rating": {
        const data = data_ as InternalRatingEntryData;
        const regularized_data: RatingEntryData = {
          score: data.score,
          comment: data.use_comment && data.comment ? data.comment : undefined,
        };
        result.entries!.set(entry_config.name, regularized_data);
        break;
      }
      case "tag": {
        const data = data_ as InternalTagEntryData;
        // register new tags to the database
        const [established_tags, new_tags] = dual_way_filter(
          data.tags,
          value => typeof value === "number",
        ) as [number[], string[]];
        const new_tag_ids = tag_patch.register_tags(entry_config.name, new_tags);
        const regularized_data: TagEntryData = {
          tags: established_tags.concat(new_tag_ids).toSorted(),
        };
        result.entries!.set(entry_config.name, regularized_data);
        break;
      }
      // No default
    }
  }
  // place the item to the database
  const errors = await database_store.place_item([
    { runtime_id: props.dataId, source: result, images: images },
  ]);
  if (errors.length === 0) {
    emit("done");
    return;
  }
  display_notice(
    "error",
    t("message.error.cannot_commit_modification"),
    errors.map(({ reason }) => explain_invalid_reason(reason)).join("; "),
  );
}

const submitting: Ref<boolean> = ref(false);

function submit() {
  submitting.value = true;
  submit_internal().then(() => {
    submitting.value = false;
  });
}
</script>
<style lang="css" scoped>
.display-column {
  /* 104px = overlay padding (64px * 2) + row margin (-12px * 2) */
  height: calc(100vh - 104px);
  overflow-y: scroll;
  scrollbar-width: none;
}
</style>
