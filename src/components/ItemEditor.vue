<template>
  <v-row>
    <v-col
      :style="column_style"
      :xs="column_sizes.xs"
      :sm="column_sizes.sm"
      :md="column_sizes.md"
      :lg="column_sizes.lg"
      :xl="column_sizes.xl"
      :xxl="column_sizes.xxl"
      class="position-sticky top-0"
      style="height: max-content"
    >
      <item-viewer
        :data="effective_data"
        :configuration="database_store.database_!.configurations.entry.entries"
        :data_id="props.data_id ?? ''"
        :override_image="override_image"
        :in_editor="true"
      />
    </v-col>
    <v-col
      :style="column_style"
      :xs="column_sizes.xs"
      :sm="column_sizes.sm"
      :md="column_sizes.md"
      :lg="column_sizes.lg"
      :xl="column_sizes.xl"
      :xxl="column_sizes.xxl"
    >
      <v-card :loading="submitting">
        <v-card-text v-if="database_store.has_image">
          <v-file-input
            density="compact"
            prepend-icon="mdi-image"
            accept="image/*"
            :label="$t('message.load_image_from_file')"
            @update:model-value="load_image_from_file"
            v-model="image_files"
          ></v-file-input>
        </v-card-text>
        <v-card-text v-if="local_data_ready">
          <template
            v-for="(entry, index) in database_store.database_?.configurations.entry.entries"
            :key="index"
          >
            <v-row>
              <v-col cols="12">
                <v-divider v-if="database_store.has_image || index !== 0"></v-divider>
              </v-col>
              <v-col cols="12">
                <p>{{ entry.name }}</p>
              </v-col>
              <v-col cols="12">
                <item-string-editor
                  v-if="entry.type === 'string'"
                  :data="(local_data.entries.get(entry.name) as StringEntryData)"
                />
                <item-rating-editor
                  v-else-if="entry.type === 'rating'"
                  :data="(local_data.entries.get(entry.name) as InternalRatingEntryData)"
                  :configuration="entry"
                />
                <item-tag-editor
                  v-else-if="entry.type === 'tag'"
                  :entry_name="entry.name"
                  :data="(local_data.entries.get(entry.name) as InternalTagEntryData)"
                  :configuration="entry"
                />
              </v-col>
            </v-row>
          </template>
          <v-banner v-if="data_invalid_reasons.length !== 0" color="error" icon="$error" class="my-6">
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
              <v-btn block color="primary" :disabled="data_invalid_reasons.length !== 0" @click="submit">
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
import { i18n } from "@/locales";
import { load_image } from "@/procedures/image-utils";
import { validate_internal_item } from "@/procedures/item-validator";
import { dual_way_filter } from "@/procedures/utilities";
import { useDatabaseStore } from "@/stores/database";
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
import { ImageImageFormat, ThumbnailImageFormat } from "@/types/image-types";
import { inj_DisplayNotice } from "@/types/injections";
import { explain_invalid_reason, type ItemInvalidReason } from "@/types/invalid-items";

import { computed, inject, onMounted } from "vue";
import { VFileInput } from "vuetify/components";

const { t } = i18n.global;
const display_notice = inject(inj_DisplayNotice)!;
const database_store = useDatabaseStore();
const props = defineProps<{ data?: DataItem; data_id?: string }>();
const emit = defineEmits<{
  done: [];
}>();

const column_sizes = computed(() => ({
  xs: database_store.has_image ? "" : "12",
  sm: database_store.has_image ? "" : "12",
  md: database_store.has_image ? "" : "12",
  lg: database_store.has_image ? "" : "6",
  xl: database_store.has_image ? "" : "6",
  xxl: database_store.has_image ? "" : "4",
}));
const column_style = computed(() =>
  database_store.has_image ? `width: ${database_store.image_size.width}px` : ""
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
    .database_!.configurations.entry.entries.map((entry_config) => {
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
    .filter((value) => value !== null && value !== undefined);
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
  if (props.data !== undefined && props.data_id !== undefined) {
    // fetch provided data
    //  we need to do deep copy so that modifications not yet submitted will not leak to database
    local_data.value.image = props.data.image === undefined ? undefined : { ...props.data.image };
    props.data.entries?.forEach((value, key) => {
      const config = database_store.database_!.configurations.entry.entries.find(
        (value) => value.name === key
      )!;
      if (config.type === "rating") {
        const data = value as RatingEntryData;
        local_data.value.entries.set(key, {
          score: data.score,
          comment: data.comment ?? "",
          use_comment: data.comment ? true : false,
        });
      } else if (config.type === "string") {
        const data = value as StringEntryData;
        local_data.value.entries.set(key, {
          value: data.value,
        });
      } else if (config.type === "tag") {
        const data = value as TagEntryData;
        local_data.value.entries.set(key, {
          tags: [...data.tags],
        });
      }
    });
    // prepare image
    if (database_store.has_image) {
      database_store.get_image(props.data_id).then((image) => {
        override_image.value = image ?? "";
      });
    }
  }
  // emplace default (empty) values to undefined entries
  //  this will help editor by providing valid storages for each possible entries
  database_store.database_!.configurations.entry.entries.forEach((entry) => {
    if (local_data.value.entries!.has(entry.name)) {
      return;
    }
    if (entry.type === "string") {
      local_data.value.entries!.set(entry.name, { value: "" } as StringEntryData);
    } else if (entry.type === "tag") {
      local_data.value.entries!.set(entry.name, { tags: [] } as TagEntryData);
    } else if (entry.type === "rating") {
      local_data.value.entries!.set(entry.name, {
        score: 0,
        comment: "",
        use_comment: false,
      } as InternalRatingEntryData);
    }
  });
  local_data_ready.value = true;
});

const image_files: Ref<File | undefined> = ref(undefined);

function load_image_internal(image: Blob | HTMLImageElement) {
  load_image(image, database_store.image_size, ImageImageFormat, ThumbnailImageFormat).then((result) => {
    image_files.value = undefined;
    if (result === null) {
      return;
    }
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
  });
}

function load_image_from_file(files: File | File[] | undefined) {
  image_files.value = undefined;
  if (files === undefined || files instanceof Array) {
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
    database_store.database_!.configurations.entry
  );
});

async function submit_internal() {
  const result: DataItem = {};
  // prepare the images
  const images =
    image_helpers.image_bitmap === null
      ? undefined
      : {
          image: image_helpers.image_bitmap!,
          image_url: image_helpers.image_url!,
          thumbnail: image_helpers.thumbnail_bitmap!,
          thumbnail_url: image_helpers.thumbnail_url!,
        };
  result.image = local_data.value.image;
  // handle each entry
  if (database_store.entries.length !== 0) {
    result.entries = new Map();
  }
  const tag_patch = database_store.prepare_tag_registration();
  database_store.entries.forEach((entry_config) => {
    const data_ = effective_data.value.entries.get(entry_config.name);
    if (data_ === undefined) {
      return;
    }
    if (entry_config.type === "string") {
      result.entries!.set(entry_config.name, data_ as StringEntryData);
    } else if (entry_config.type === "rating") {
      const data = data_ as InternalRatingEntryData;
      const regularized_data: RatingEntryData = {
        score: data.score,
        comment: data.use_comment && data.comment ? data.comment : undefined,
      };
      result.entries!.set(entry_config.name, regularized_data);
    } else if (entry_config.type === "tag") {
      const data = data_ as InternalTagEntryData;
      // register new tags to the database
      const [established_tags, new_tags] = dual_way_filter(
        data.tags,
        (value) => typeof value === "number"
      ) as [number[], string[]];
      const new_tag_ids = tag_patch.register_tags(entry_config.name, new_tags);
      const regularized_data: TagEntryData = {
        tags: established_tags.concat(new_tag_ids).sort(),
      };
      result.entries!.set(entry_config.name, regularized_data);
    }
  });
  // place the item to the database
  const errors = await database_store.place_item([
    { runtime_id: props.data_id, source: result, images: images },
  ]);
  if (errors.length === 0) {
    emit("done");
    return;
  }
  display_notice(
    "error",
    t("message.error.cannot_commit_modification"),
    errors.map(({ reason }) => explain_invalid_reason(reason)).join("; ")
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
