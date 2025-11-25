<template>
  <v-tooltip interactive v-model="show_tooltip" :disabled="in_editor" open-delay="500" close-delay="300">
    <template v-slot:activator="{ props: activatorProps }">
      <v-card v-bind="activatorProps" :color="selection?.has(data_id) ? 'primary' : ''">
        <div v-if="database_store.has_image" class="fill-width">
          <v-lazy :height="database_store.image_size.height">
            <v-img
              :width="database_store.image_size.width"
              :height="database_store.image_size.height"
              :src="override_image ?? fetched_image"
              style="margin: auto"
              @click="load_full_image"
            >
              <template v-slot:placeholder>
                <div
                  class="align-center justify-center fill-height"
                  style="background: linear-gradient(to right, #f0c27b, #4b1248)"
                ></div>
              </template>
            </v-img>
          </v-lazy>
        </div>
        <v-card-text>
          <div style="display: grid; grid-template-columns: max-content 1fr; gap: 24px 16px">
            <template v-for="(entry, index) in entries_available_for_present">
              <p style="width: max-content">{{ entry.name }}</p>
              <component
                :is="display_map[entry.type]"
                :data="props.data.entries
            ?.get(entry.name)!"
                :configuration="entry"
              ></component>
            </template>
          </div>
        </v-card-text>
      </v-card>
    </template>
    <div style="display: grid; grid-template-columns: 1fr; gap:8px;">
      <v-btn block @click="request_for_modify">{{ $t("action.edit") }}</v-btn>
      <v-btn block v-if="selection?.has(data_id)" @click="emit('unselect', data_id)">{{ $t("action.unselect") }}</v-btn>
      <v-btn block v-else @click="emit('select', data_id)">{{ $t("action.select") }}</v-btn>
    </div>
  </v-tooltip>
</template>
<script setup lang="ts">
import { useDatabaseStore } from "@/stores/database";
import type { DataItem } from "@/types/datasource-data";
import type { InternalDataItem } from "@/types/datasource-entry";
import type { DatasourceEntryConfiguration } from "@/types/datasource-entry-details";
import ItemRatingDisplay from "./ItemRatingDisplay.vue";
import ItemStringDisplay from "./ItemStringDisplay.vue";
import ItemTagDisplay from "./ItemTagDisplay.vue";

import { computed, onMounted } from "vue";

const display_map = {
  string: ItemStringDisplay,
  tag: ItemTagDisplay,
  rating: ItemRatingDisplay,
};

const database_store = useDatabaseStore();
const props = defineProps<{
  data_id: string;
  data: DataItem | InternalDataItem;
  configuration: DatasourceEntryConfiguration[];
  override_image: string | null;
  in_editor?: boolean;
  update_broadcast?: Set<string>;
  selection?: Set<string>;
}>();
const emit = defineEmits<{
  request_modify: [string];
  select: [string];
  unselect: [string];
}>();
const load_full_image: Ref<(() => void) | undefined> = ref(undefined);

const entries_available_for_present = computed(() => {
  if (!props.configuration) {
    return [];
  }
  return props.configuration.filter((entry) => props.data.entries?.has(entry.name));
});
const fetched_image: Ref<string> = ref("");

function update_header_image() {
  const cached_image = database_store.get_cached_image(props.data_id);
  if (cached_image !== undefined) {
    // full image have been loaded, just display it
    fetched_image.value = cached_image;
    return;
  }
  // full image is not loaded, we need to get the thumbnail
  database_store.get_thumbnail(props.data_id).then((image) => {
    fetched_image.value = image;
  });
  // set full image fetcher
  load_full_image.value = () => {
    // the fetcher should be called only once
    load_full_image.value = undefined;
    database_store.get_image(props.data_id).then((image) => {
      fetched_image.value = image;
    });
  };
}

onMounted(() => {
  if (props.override_image === null) {
    update_header_image();
    if (props.update_broadcast !== undefined) {
      watch(props.update_broadcast, (new_value) => {
        if (new_value.has(props.data_id)) {
          update_header_image();
        }
      });
    }
  }
});

const show_tooltip: Ref<boolean> = ref(false);
function request_for_modify() {
  emit("request_modify", props.data_id);
  show_tooltip.value = false;
}
</script>
