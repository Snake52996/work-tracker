<template>
  <div v-if="local_state.ready" class="fill-width">
    <v-card class="mb-6">
      <v-card-title style="text-align: center">{{ $t("message.tags_to_be_modified") }}</v-card-title>
      <v-card-text>
        <v-card
          v-if="local_state.tag_modifications.length > 0"
          v-for="(tag, index) in local_state.tag_modifications"
          :key="tag.config.name"
          class="mx-auto my-2"
          :title="tag.config.name"
        >
          <template v-slot:append>
            <v-switch v-model="tag.enabled" color="primary" hide-details></v-switch>
          </template>
          <v-card-text>
            <v-autocomplete
              v-model:search="input_receivers[index]!.content"
              :items="selectable_tags[index]!"
              hide-no-data
              no-filter
              :error="input_error_state[index]!"
              :prepend-icon="input_receivers[index]!.add_mode ? 'mdi-plus' : 'mdi-minus'"
              @click:prepend="input_receivers[index]!.add_mode = !input_receivers[index]!.add_mode"
              @keydown.enter="
                input_error_state[index]! === false &&
                  commit_tag(index, selectable_tags[index]!.at(0)!.internal_value)
              "
            >
              <template v-slot:item="{ item }">
                <v-list-item @click="commit_tag(index, item.raw.internal_value)">
                  <v-list-item-title> {{ item.raw.display_name }} </v-list-item-title>
                </v-list-item>
              </template>
            </v-autocomplete>
            <v-list>
              <v-list-item
                v-for="(added_tag, index) in tag.added"
                :key="added_tag"
                :title="typeof added_tag === 'string' ? added_tag : tag.tag_pool[added_tag]!"
                prepend-icon="mdi-plus"
              >
                <template v-slot:append>
                  <v-btn icon="mdi-close-circle" @click="tag.added.splice(index, 1)"></v-btn>
                </template>
              </v-list-item>
              <v-list-item
                v-for="(removed_tag, index) in tag.removed"
                :key="removed_tag"
                :title="tag.tag_pool[removed_tag]!"
                prepend-icon="mdi-minus"
              >
                <template v-slot:append>
                  <v-btn icon="mdi-close-circle" @click="tag.removed.splice(index, 1)"></v-btn>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
        <v-sheet v-else class="pa-4 text-center mx-auto">
          <v-icon class="mb-5" icon="mdi-tag-off" size="112"></v-icon>
          <h2 class="text-h5 mb-6">{{ $t("message.no_tag_to_be_edited.title") }}</h2>
          <p class="mb-4 text-medium-emphasis text-body-2">
            {{ $t("message.no_tag_to_be_edited.description") }}
          </p>
        </v-sheet>
      </v-card-text>
      <v-card-actions class="justify-end">
        <v-btn
          color="primary"
          :disabled="bind_items.some(({ errors }) => errors.some((error) => error !== null))"
          :loading="busy"
          @click="commit_modifications"
          >{{ $t("action.confirm") }}</v-btn
        >
        <v-btn @click="emit('close')">{{ $t("action.cancel") }}</v-btn>
      </v-card-actions>
    </v-card>
    <v-row>
      <v-col cols="6" class="preview-container" ref="from-container">
        <v-sheet v-if="active_tag_modifications.length === 0" class="py-4 text-center mx-auto">
          <v-icon class="mb-5" icon="mdi-database"></v-icon>
          <h2 class="text-h5">{{ $t("message.tags_in_database") }}</h2>
        </v-sheet>
        <v-hover
          v-else
          v-for="item in bind_items"
          :key="item.id"
          open-delay="300"
          @update:model-value="
            (value) => {
              update_focused_item(item.id, value, 'from');
            }
          "
        >
          <template v-slot:default="{ props }">
            <v-card
              class="mb-4"
              v-bind="props"
              :color="local_state.focused_item === item.id ? 'primary' : ''"
              ref="from-tags"
              :data-item-id="item.id"
            >
              <template v-for="tag in active_tag_modifications" :key="tag.config.name">
                <v-card-title>{{ tag.config.name }}</v-card-title>
                <v-card-text>
                  <v-row>
                    <v-col
                      v-for="tag_value in (item.data.entries!.get(tag.config.name) as (TagEntryData | undefined))?.tags ?? []"
                      :key="tag_value"
                      class="flex-grow-0"
                    >
                      <v-chip>
                        {{ tag.tag_pool[tag_value]! }}
                      </v-chip>
                    </v-col>
                  </v-row>
                </v-card-text>
              </template>
            </v-card>
          </template>
        </v-hover>
      </v-col>
      <v-col cols="6" class="preview-container" ref="to-container">
        <v-sheet v-if="active_tag_modifications.length === 0" class="py-4 text-center mx-auto">
          <v-icon class="mb-5" icon="mdi-database-edit"></v-icon>
          <h2 class="text-h5">{{ $t("message.tags_preview") }}</h2>
        </v-sheet>
        <v-hover
          v-else
          v-for="item in bind_items"
          :key="item.id"
          open-delay="300"
          @update:model-value="
            (value) => {
              update_focused_item(item.id, value, 'to');
            }
          "
        >
          <template v-slot:default="{ props }">
            <v-card
              v-bind="props"
              class="mb-4"
              :color="local_state.focused_item === item.id ? 'primary' : ''"
              ref="to-tags"
              :data-item-id="item.id"
            >
              <template v-for="(tag, index) in active_tag_modifications" :key="tag.config.name">
                <v-card-title>{{ tag.config.name }}</v-card-title>
                <v-card-text>
                  <v-alert
                    v-if="item.errors[index]"
                    type="error"
                    :title="$t('message.error.entry_contains_error')"
                    class="mb-2"
                  >
                    {{ explain_invalid_reason(item.errors[index]) }}
                  </v-alert>
                  <v-row>
                    <v-col
                      v-for="tag_value in item.modified_tags[index]!"
                      :key="tag_value"
                      class="flex-grow-0"
                    >
                      <v-chip>
                        {{ typeof tag_value === "string" ? tag_value : tag.tag_pool[tag_value]! }}
                      </v-chip>
                    </v-col>
                  </v-row>
                </v-card-text>
              </template>
            </v-card>
          </template>
        </v-hover>
      </v-col>
    </v-row>
  </div>
</template>
<style lang="css" scoped>
.preview-container {
  max-height: 60vh;
  overflow-y: scroll;
  scrollbar-width: none;
}
</style>
<script setup lang="ts">
import { i18n } from "@/locales";
import type { DatasourceEntryTagConfiguration } from "@/types/datasource-entry-details";
import { useDatabaseStore } from "@/stores/database";
import type { DataItem } from "@/types/datasource-data";
import { inj_DisplayNotice } from "@/types/injections";
import type { EntryData, TagEntryData } from "@/types/datasource-entry";
import { explain_invalid_reason, ItemInvalidType, type ItemInvalidReason } from "@/types/invalid-items";
import { dual_way_filter } from "@/procedures/utilities-pure";

import type { Ref, Reactive } from "vue";
import { onMounted, reactive, readonly, computed, ref, inject, useTemplateRef, watch } from "vue";
import { useGoTo } from "vuetify";
import type { VCard } from "vuetify/components";

const { t } = i18n.global;
const goto = useGoTo();
const database_store = useDatabaseStore();
const display_notice = inject(inj_DisplayNotice)!;
const props = defineProps<{
  item_ids: string[];
}>();
const emit = defineEmits<{ close: [] }>();
const local_state: Reactive<{
  ready: boolean;
  tag_modifications: {
    config: Readonly<DatasourceEntryTagConfiguration>;
    tag_pool: string[];
    enabled: boolean;
    added: (string | number)[];
    removed: number[];
  }[];
  items: DataItem[];
  focused_item: string;
}> = reactive({ ready: false, tag_modifications: [], items: [], focused_item: "" });

const from_tags = useTemplateRef("from-tags");
const to_tags = useTemplateRef("to-tags");
const from_container = useTemplateRef("from-container");
const to_container = useTemplateRef("to-container");

// auto-scrolling supports
function update_focused_item(runtime_id: string, value: boolean, side: "from" | "to") {
  if (value) {
    const predictor = (value: any) => value.$el.dataset.itemId === runtime_id;
    const this_node = (side === "from" ? from_tags : to_tags).value!.find(predictor)!;
    const that_node = (side === "from" ? to_tags : from_tags).value!.find(predictor)!;
    const this_container = side === "from" ? from_container : to_container;
    const that_container = side === "from" ? to_container : from_container;
    const additional_offset =
      this_node.$el.getBoundingClientRect().y - this_container.value!.$el.getBoundingClientRect().y;
    nextTick().then(() => {
      goto(that_node, {
        offset: -additional_offset,
        container: that_container.value!,
        easing: "easeInOutCubic",
      }).then(() => {
        local_state.focused_item = runtime_id;
      });
    });
  } else if (runtime_id === local_state.focused_item) {
    local_state.focused_item = "";
  }
}

// tag_modifications that are enabled
const active_tag_modifications = computed(() =>
  local_state.tag_modifications.filter(({ enabled }) => enabled)
);
// this array of instances binds several attributes together to ease accessing to them
//  id: the runtime id of the data item
//  data: the original, readonly (though not enforced) DataItem instance
//  modified_tags: tags modified, that is, tags with modification enabled
//   it has the same order as the tag modifications filtered with enabled equals true
//   if the content of one tag is included here, the content is comprehensive: all tags originally specified
//   on this item, if not removed, and all newly added tags are included in the array
//  errors: error description for each modified tag. The value will be null if no error occurs
const bind_items = computed(() =>
  local_state.items.map((data, index) => {
    const modified_tags: (string | number)[][] = [];
    const errors: (ItemInvalidReason | null)[] = [];
    active_tag_modifications.value.forEach((tag) => {
      const content = data.entries!.get(tag.config.name) as TagEntryData | undefined;
      const basic_tags = content?.tags ?? [];
      const removed_tags = basic_tags.filter((value) => !tag.removed.includes(value));
      const pure_add_tags = tag.added.filter(
        (value) => typeof value === "string" || !removed_tags.includes(value)
      );
      const new_tags = pure_add_tags.concat(removed_tags);
      modified_tags.push(new_tags);
      if (tag.config.exclusive && new_tags.length > 1) {
        const error: ItemInvalidReason = { type: ItemInvalidType.exclusive, key: tag.config.name };
        errors.push(error);
      } else if (!tag.config.optional && new_tags.length === 0) {
        const error: ItemInvalidReason = { type: ItemInvalidType.missing, key: tag.config.name };
        errors.push(error);
      } else {
        errors.push(null);
      }
    });
    return { id: props.item_ids[index]!, data: data, modified_tags: modified_tags, errors: errors };
  })
);
const input_receivers: Reactive<
  {
    add_mode: boolean;
    content: string;
  }[]
> = reactive([]);
const selectable_tags = computed(() => {
  return input_receivers.map(
    ({ add_mode, content }, index): { display_name: string; internal_value: string | number }[] => {
      const modifications = local_state.tag_modifications[index]!;
      const reshaped_tag_pool = modifications.tag_pool.map((value, index) => ({
        display_name: value,
        internal_value: index,
      }));
      const exact_match = (() => {
        const exact_match_index = modifications.tag_pool.indexOf(content);
        if (exact_match_index !== -1) {
          // return this exact match
          return { display_name: content, internal_value: exact_match_index };
        }
        // no exact match was found, a candidate can still be generated if the user is adding a tag
        if (add_mode && content.length !== 0) {
          return { display_name: content, internal_value: content };
        }
        return null;
      })();
      // provide autocompletion
      const non_exact_matches = reshaped_tag_pool.filter(({ display_name }) => display_name !== content);
      const [prefix_match, not_prefix] = dual_way_filter(non_exact_matches, ({ display_name }) =>
        display_name.startsWith(content)
      );
      const candidates = (exact_match === null ? [] : [exact_match]).concat(
        prefix_match,
        not_prefix.filter(({ display_name }) => display_name.includes(content))
      );
      // filter out tags that have already been added or removed
      return candidates.filter(
        ({ internal_value }) =>
          !modifications.added.includes(internal_value) &&
          (typeof internal_value === "string" || !modifications.removed.includes(internal_value))
      );
    }
  );
});
const input_error_state = computed(() => {
  return input_receivers.map(({ content }, index) =>
    selectable_tags.value[index]!.every(({ display_name }) => display_name !== content)
  );
});
function commit_tag(index: number, internal_value: string | number) {
  input_receivers[index]!.content = "";
  const add_mode = input_receivers[index]!.add_mode;
  if (add_mode) {
    local_state.tag_modifications[index]!.added.push(internal_value);
  } else {
    local_state.tag_modifications[index]!.removed.push(internal_value as number);
  }
}
onMounted(() => {
  local_state.tag_modifications = database_store.entries
    .filter((entry) => entry.type === "tag")
    .map((config) => ({
      config: readonly(config),
      tag_pool: database_store.tags.get(config.name) ?? [],
      enabled: false,
      added: [],
      removed: [],
    }));
  local_state.tag_modifications.forEach(() => {
    input_receivers.push({ add_mode: true, content: "" });
  });
  local_state.items = props.item_ids.map((runtime_id) => database_store.data.get(runtime_id)!);
  local_state.ready = true;
});

const busy: Ref<boolean> = ref(false);
async function commit_modifications_implementation() {
  // 1. since we might register new tags to the database, a patch must be requested first
  const patch = database_store.prepare_tag_registration();
  // 2. we create new DataItem instances for all items
  const active_modifications = active_tag_modifications.value;
  const tags_modified = new Set(active_modifications.map(({ config }) => config.name));
  const new_items = bind_items.value.map(
    ({ id, data, modified_tags }): { runtime_id: string; source: DataItem } => {
      // 2.1. we rebuild the entries field so that we do not accidentally have the data in database modified
      // data entries with type other than tag is referenced directly from the original data instance
      //  since this editor will never modify them
      // data entries with tag type but with modification disabled can also be added this way
      const directly_referenced = database_store.entries
        .map((configuration): [string, EntryData] | null => {
          if (configuration.type === "tag" && tags_modified.has(configuration.name)) {
            return null;
          }
          const content = data.entries?.get(configuration.name);
          if (content === undefined) {
            return null;
          }
          return [configuration.name, content];
        })
        .filter((item) => item !== null);
      const new_data_entries = new Map(directly_referenced);
      // 2.2. we add tag entries to the new entries map
      //  note modified_tags contains all tags, both those stored for this item in the database previously,
      //  and also newly created ones. We do not need the original value in the existing data mapping
      modified_tags.forEach((tags, index) => {
        console.log(tags, tags.length);
        if (tags.length === 0) {
          return; // no tags, a entry should not be generated according to the database format specification
        }
        // 2.2.1. we split tags into two parts, in which only the second part need to be registered
        const [existing_tags, new_tags] = dual_way_filter(tags, (value) => typeof value === "number") as [
          number[],
          string[]
        ];
        // 2.2.2. we register the new tags
        const configuration = active_modifications[index]!.config;
        const registered_tags = patch.register_tags(configuration.name, new_tags);
        // 2.2.3. emit the entry
        const content: TagEntryData = { tags: existing_tags.concat(registered_tags) };
        console.log(content);
        console.log(configuration.name);
        new_data_entries.set(configuration.name, content);
        console.log(new_data_entries);
      });
      console.log(new_data_entries);

      // 2.3. we reference the image field directly from the original data instance since no modification will
      //  be done to this field.
      const data_item: DataItem = { image: data.image, entries: new_data_entries };
      // 2.4. build the structure which is ready to be placed into database
      return { runtime_id: id, source: data_item };
    }
  );
  // 3. submit the modification
  const failures = await database_store.place_item(new_items);
  if (failures.length === 0) {
    emit("close");
    return;
  }
  display_notice(
    "error",
    t("cannot_commit_modification"),
    failures.map(({ index, reason }) => `${index}: ${explain_invalid_reason(reason)}`).join("\n")
  );
}
function commit_modifications() {
  busy.value = true;
  commit_modifications_implementation().finally(() => {
    busy.value = false;
  });
}
</script>
