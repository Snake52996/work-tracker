<template>
  <v-app-bar>
    <v-app-bar-title>
      {{ database_store.database_?.configurations.global.name ?? "" }}
    </v-app-bar-title>
    <v-btn
      v-if="database_store.database_modified"
      icon
      @click="result_error_reporter(database_store.save_delta(), $t('action.download_delta'), display_notice)"
    >
      <v-icon :color="database_store.database_modified_unsaved ? 'warning' : ''">mdi-download-outline</v-icon>
      <v-tooltip activator="parent" location="bottom">{{ $t("action.download_delta") }}</v-tooltip>
    </v-btn>
    <v-btn
      icon
      @click="result_error_reporter(database_store.save_all(), $t('action.download_delta'), display_notice)"
    >
      <v-icon :color="database_store.database_modified_unsaved ? 'warning' : ''">
        mdi-download-multiple-outline
      </v-icon>
      <v-tooltip activator="parent" location="bottom">{{ $t("action.download_full_database") }}</v-tooltip>
    </v-btn>
    <v-btn icon @click="create_new_data_item">
      <v-icon>mdi-plus</v-icon>
      <v-tooltip activator="parent" location="bottom">{{
        $t("acTion.create", { target: $t("terms.new_database_item") })
      }}</v-tooltip>
    </v-btn>
    <v-btn v-if="selections.selected_items.size > 0" icon @click="show_batched_editor = true">
      <v-icon>mdi-pencil-box-multiple-outline</v-icon>
      <v-tooltip activator="parent" location="bottom">{{ $t("action.batch_tag_modify") }}</v-tooltip>
    </v-btn>
    <v-btn icon @click="show_importer = true">
      <v-icon>mdi-import</v-icon>
      <v-tooltip activator="parent" location="bottom">{{ $t("action.import") }}</v-tooltip>
    </v-btn>
    <v-btn icon to="/Maintenance">
      <v-icon>mdi-wrench</v-icon>
      <v-tooltip activator="parent" location="bottom">{{ $t("action.maintenance") }}</v-tooltip>
    </v-btn>
    <v-btn icon @click="logout">
      <v-icon>mdi-logout</v-icon>
      <v-tooltip activator="parent" location="bottom">{{ $t("action.lock_database") }}</v-tooltip>
    </v-btn>
  </v-app-bar>
  <v-data-iterator :items="display_items" :items-per-page="item_per_page" :page="current_page">
    <template #header>
      <v-sheet class="fill-width">
        <v-container>
          <v-row>
            <v-col cols="8">
              <v-autocomplete
                v-model:search="search_input"
                :error="!search_input_valid"
                hide-no-data
                item-title="command"
                :items="search_autocompletes"
                no-filter
                prepend-icon="mdi-magnify"
                @keydown.enter="update_search"
              >
                <template #item="{ item }">
                  <v-list-item @click="item.raw.action">
                    <v-list-item-title> {{ item.raw.command }} </v-list-item-title>
                    <v-list-item-subtitle v-if="item.raw.explanation !== undefined">
                      {{ item.raw.explanation }}
                    </v-list-item-subtitle>
                  </v-list-item>
                </template>
              </v-autocomplete>
            </v-col>
            <v-col cols="4">
              <v-select
                v-model="current_sorting"
                item-title="name"
                :items="available_sorting_methods"
                :label="$t('hint.sort_by')"
                return-object
              />
            </v-col>
            <v-col cols="4">
              <v-btn
                v-if="display_items.every(item => selections.selected_items.has(item))"
                @click="change_all_selected_state({ selected: false })"
              >
                {{ $t("action.unselect_all") }}
              </v-btn>
              <v-btn v-else @click="change_all_selected_state({ selected: true })">{{
                $t("action.select_all")
              }}</v-btn>
            </v-col>
            <v-col cols="4">
              <v-btn @click="change_all_selected_state({ inverse: true })">{{
                $t("action.inverse_selection")
              }}</v-btn>
            </v-col>
            <v-col cols="4">
              <v-switch
                v-model="selections.show_selected_only"
                color="primary"
                hide-details
                :label="$t('action.show_only_selected')"
              />
            </v-col>
          </v-row>
          <v-row align="center">
            <v-col
              v-for="(criteria, index) in searching_root"
              :key="`${criteria.toString()}@${index}`"
              class="flex-grow-0"
            >
              <v-chip
                v-if="Array.isArray(criteria)"
                class="py-6"
                closable
                style="width: max-content"
                @click:close="searching_root.splice(index, 1)"
              >
                <v-row>
                  <v-col
                    v-for="(criterion, index_inner) in criteria"
                    :key="`${criterion}@${index_inner}`"
                    class="flex-grow-0"
                  >
                    <v-chip
                      closable
                      @click:close="
                        criteria.length === 1
                          ? searching_root.splice(index, 1)
                          : criteria.splice(index_inner, 1)
                      "
                    >
                      {{ criterion }}
                    </v-chip>
                  </v-col>
                </v-row>
              </v-chip>
              <v-chip v-else closable @click:close="searching_root.splice(index, 1)"> {{ criteria }} </v-chip>
            </v-col>
          </v-row>
          <h3 style="text-align: center">
            {{ $t("message.displayed_items", { count: display_items.length }) }}
          </h3>
        </v-container>
      </v-sheet>
    </template>
    <template #default="{ items }">
      <v-container class="pa-2" fluid>
        <v-row justify="space-around">
          <v-col
            v-for="item in items"
            :key="item.raw"
            class="flex-grow-0"
            lg="4"
            md="6"
            sm="12"
            style="max-width: 480px"
            xl="3"
            xxl="2"
          >
            <ItemViewer
              :configuration="database_store.database_?.configurations.entry.entries!"
              :data="database_store.data.get(item.raw)!"
              :data-id="item.raw"
              :override-image="null"
              :selection="selections.selected_items"
              :update-broadcast="reload_image_notifier"
              @request-modify="edit_existing_item"
              @select="selections.selected_items.add(item.raw)"
              @unselect="selections.selected_items.delete(item.raw)"
            />
          </v-col>
        </v-row>
      </v-container>
    </template>
    <template #footer="{ pageCount }">
      <v-row justify="space-around">
        <v-col cols="8">
          <v-pagination v-model="current_page" :length="pageCount" />
        </v-col>
        <v-col cols="2">
          <v-number-input
            v-model="goto_page_number"
            control-variant="hidden"
            :label="$t('action.goto')"
            :max="pageCount"
            :min="1"
            @keydown.enter="current_page = goto_page_number"
          />
        </v-col>
        <v-col cols="2">
          <v-select
            v-model="item_per_page"
            :items="[10, 20, 40, 50, 100]"
            :label="$t('hint.item_per_page')"
          />
        </v-col>
      </v-row>
    </template>
  </v-data-iterator>
  <v-overlay
    v-model="show_editor"
    class="justify-center"
    content-class="py-16 overflow-x-hidden overflow-y-scroll hide-scroll-bar"
    height="100%"
    :persistent="true"
    scroll-strategy="none"
    width="85%"
  >
    <ItemEditor :data="edit_data" :data-id="edit_data_id" @done="finish_editing" />
  </v-overlay>
  <v-overlay
    v-model="show_batched_editor"
    class="justify-center"
    content-class="py-16 overflow-x-hidden overflow-y-scroll hide-scroll-bar"
    height="100%"
    :persistent="true"
    scroll-strategy="none"
    width="85%"
  >
    <BatchedTagEditor
      :item-ids="[...selections.selected_items.keys()]"
      @close="show_batched_editor = false"
    />
  </v-overlay>
  <v-btn
    color="primary"
    icon="mdi-rocket-outline"
    style="position: fixed; right: 24px; bottom: 48px"
    @click="goto(0)"
  />
  <v-bottom-sheet v-model="show_importer">
    <DataImporter @done="show_importer = false" />
  </v-bottom-sheet>
</template>
<script lang="ts" setup>
import type { Reactive, Ref, ShallowReactive } from "vue";
import type { DataItem } from "@/types/datasource-data";
import type { DatasourceEntryConfiguration } from "@/types/datasource-entry-details";
import { computed, inject, onMounted, ref, shallowReactive } from "vue";
import { useGoTo } from "vuetify";
import { Sorting } from "@/definitions/sorting_types";
import { i18n } from "@/locales";
import { to_sorting } from "@/procedures/sorting";
import { find_tag_candidates } from "@/procedures/tag-matching";
import { result_error_reporter } from "@/procedures/utilities";
import { useDatabaseStore } from "@/stores/database";
import { inj_DisplayNotice } from "@/types/injections";
import {
  AndSearchNode,
  compile_search_command,
  extract_enclosed_string,
  get_available_operators,
  get_operator_index,
  OrSearchNode,
  to_enclosed_string,
} from "@/types/search-node";

const { t } = i18n.global;

const router = useRouter();
const database_store = useDatabaseStore();
const goto = useGoTo();
const display_notice = inject(inj_DisplayNotice)!;

const edit_data: Ref<DataItem | undefined> = ref(undefined);
const edit_data_id: Ref<string | undefined> = ref(undefined);
const show_editor: Ref<boolean> = ref(false);
const show_batched_editor: Ref<boolean> = ref(false);
const show_importer: Ref<boolean> = ref(false);
const reload_image_notifier: ShallowReactive<Set<string>> = shallowReactive(new Set());

const current_page: Ref<number> = ref(1);
const item_per_page: Ref<number> = ref(10);
const goto_page_number: Ref<number> = ref(1);

function create_new_data_item() {
  edit_data.value = undefined;
  edit_data_id.value = undefined;
  show_editor.value = true;
}
function edit_existing_item(data_id: string) {
  edit_data_id.value = data_id;
  edit_data.value = database_store.data.get(data_id)!;
  show_editor.value = true;
}
function finish_editing() {
  reload_image_notifier.clear();
  show_editor.value = false;
  reload_image_notifier.add(edit_data_id.value!);
}

const search_input: Ref<string> = ref("");
const searching_root: Reactive<(string | string[])[]> = reactive([]);
const adding_to_or_group: Ref<boolean> = ref(false);
const search_input_valid = computed(() => {
  if (search_input.value === "") {
    // empty input is always valid
    return true;
  }
  if (search_input.value === ";;") {
    // group termination is valid if we are not at root level
    return adding_to_or_group.value;
  }
  const effective = search_input.value.slice(search_input.value.startsWith("~") ? 1 : 0);
  return compile_search_command(effective) !== null;
});

function insert_node(command: string) {
  if (command.startsWith("~")) {
    if (!adding_to_or_group.value) {
      searching_root.push([]);
      adding_to_or_group.value = true;
    }
    (searching_root.at(-1)! as string[]).push(command.slice(1));
  } else {
    adding_to_or_group.value = false;
    searching_root.push(command);
  }
}

const search_autocompletes = computed(() => {
  const result: { command: string; explanation?: string; action: () => void }[] = [];
  if (adding_to_or_group.value && ";;".startsWith(search_input.value)) {
    result.push({
      command: ";;",
      explanation: t("search.end_group"),
      action: () => {
        search_input.value = "";
        adding_to_or_group.value = false;
      },
    });
  }
  const prefix_match = search_input.value.match(/^(~?!?)(.*)$/)!;
  const prefix = prefix_match[1]!;
  const extra_explanations = [
    prefix.includes("~") ? `(${t("search.in_group")})` : null,
    prefix.includes("!") ? `(${t("search.inverse")})` : null,
  ].filter(item => item !== null);
  const content = prefix_match[2]!;
  let tag_matched_exactly = false;
  if (content[0] === "$") {
    // we try to split the user input into three parts: the name of entry (with escaped characters unescaped),
    //  the operator and the content after the operator
    //  the result will be null if the user input seems invalid
    const entry_components = ((): [string, string, string] | null => {
      const input = content.slice(1);
      if (input.length === 0) {
        return ["", "", ""];
      }
      if (input[0] === '"') {
        let result: { enclosed: string; remainder: string } | null = null;
        for (const candidate of [input, `${input}"`]) {
          result = extract_enclosed_string(candidate);
          if (result !== null) {
            break;
          }
        }
        if (result === null) {
          // the input is not valid
          return null;
        }
        if (result.remainder.length > 0) {
          // user has finished the entry name
          return [result.enclosed, result.remainder[0]!, result.remainder.slice(1)];
        }
        return [result.enclosed, "", ""];
      } else {
        const cut_position = get_operator_index(input);
        if (cut_position === -1) {
          return [input, "", ""];
        }
        return [input.slice(0, cut_position), input[cut_position]!, input.slice(cut_position + 1)];
      }
    })();
    if (entry_components !== null) {
      // the input seems valid
      const [entry_name_prefix, operator, operand] = entry_components;
      if (operator === "") {
        // the operator is not yet specified, we can help completing the entry name or the operator
        const exact_match = database_store.entries.find(
          entry_config => entry_config.name === entry_name_prefix,
        );
        if (exact_match !== undefined) {
          // the input entry name prefix matches exactly with some entry
          tag_matched_exactly = true;
          for (const { operator, explanation } of get_available_operators(exact_match)) {
            result.push({
              command: `${prefix}\$${to_enclosed_string(entry_name_prefix)}${operator}`,
              explanation: extra_explanations.concat([explanation]).join(""),
              action: () => {
                search_input.value = `${prefix}\$${to_enclosed_string(entry_name_prefix)}${operator}`;
              },
            });
          }
          result.push({
            command: search_input.value,
            explanation: extra_explanations.concat([t("search.check_existence")]).join(""),
            action: () => {
              insert_node(search_input.value);
              search_input.value = "";
            },
          });
        }
        for (const entry_config of database_store.entries.filter(
          entry_config =>
            entry_config.name.startsWith(entry_name_prefix) && entry_config.name !== entry_name_prefix,
        )) {
          result.push({
            command: `${prefix}\$${to_enclosed_string(entry_config.name)}`,
            action: () => {
              search_input.value = `${prefix}\$${to_enclosed_string(entry_config.name)}`;
            },
          });
        }
      } else {
        // operator is specified, if the entry specified has tag type and the operator is exact matcher,
        //  we offer completions for possible tag contents
        const entry_config = database_store.entries.find(entry => entry.name === entry_name_prefix);
        if (entry_config !== undefined && entry_config.type === "tag" && operator === "=") {
          // there is no other possibilities, we mark as matched exactly to skip dummy completions
          tag_matched_exactly = true;

          const tags = database_store.tags.get(entry_config.name) ?? [];
          const candidates = find_tag_candidates(operand, tags).map(({ display }) => display);
          for (const candidate of candidates) {
            const command = `${prefix}\$${to_enclosed_string(entry_config.name)}=${candidate}`;
            result.push({
              command: command,
              action: () => {
                search_input.value = command;
              },
            });
          }
        }
      }
    }
  }
  if (search_input_valid.value && content.length > 0 && !tag_matched_exactly) {
    result.push({
      command: search_input.value,
      explanation:
        content[0] === "$" ? undefined : extra_explanations.concat([t("search.general_match")]).join(""),
      action: () => {
        insert_node(search_input.value);
        search_input.value = "";
      },
    });
  }

  return result;
});

function update_search() {
  if (!search_input_valid.value) {
    return;
  }
  if (search_input.value === ";;") {
    adding_to_or_group.value = false;
    return;
  }
  insert_node(search_input.value);
  search_input.value = "";
}

const searcher = computed(() => {
  const root = new AndSearchNode();
  for (const item of searching_root) {
    if (Array.isArray(item)) {
      const group = new OrSearchNode();
      for (const command of item) {
        group.add_child(compile_search_command(command)!);
      }
      root.add_child(group);
    } else {
      root.add_child(compile_search_command(item)!);
    }
  }
  return root;
});

// sorting area
const sortable_entries: ShallowReactive<DatasourceEntryConfiguration[]> = shallowReactive([]);

const available_sorting_methods = computed(() => {
  const lesser_than = (lhs: any, rhs: any) => lhs < rhs;
  const greater_than = (lhs: any, rhs: any) => lhs > rhs;
  const methods: {
    name: string;
    details?: { entry: DatasourceEntryConfiguration; less_than: (lhs: any, rhs: any) => boolean };
  }[] = [{ name: t("sorting_by.none") }];
  for (const entry of sortable_entries) {
    methods.push(
      {
        name: `${entry.name} ${t("sorting_by.ascending")}`,
        details: {
          entry: entry,
          less_than: lesser_than,
        },
      },
      {
        name: `${entry.name} ${t("sorting_by.descending")}`,
        details: {
          entry: entry,
          less_than: greater_than,
        },
      },
    );
  }
  return methods;
});
const current_sorting = ref(available_sorting_methods.value[0]!);
const filtered_items = computed(() => {
  return Array.from(database_store.data.entries()).filter(([_, item]) => searcher.value.evaluate(item));
});
const sorting_ready_items = computed(() => {
  if (current_sorting.value.details === undefined) {
    return null;
  }
  return filtered_items.value.map(value => {
    const data = value[1];
    const entry_data = data.entries!.get(current_sorting.value.details!.entry.name);
    if (entry_data === undefined) {
      return { data: value, key: null };
    }
    return {
      data: value,
      key: to_sorting(
        current_sorting.value.details!.entry,
        entry_data,
        database_store.tags.get(current_sorting.value.details!.entry.name),
      ),
    };
  });
});
const sorted_items = computed(() => {
  if (sorting_ready_items.value === null) {
    return null;
  }
  return sorting_ready_items.value
    .toSorted((lhs, rhs) => {
      if (lhs.key === null && rhs.key === null) {
        return 0;
      }
      if (lhs.key === null) {
        return 1;
      }
      if (rhs.key === null) {
        return -1;
      }
      const compare_result = current_sorting.value.details!.less_than(lhs.key, rhs.key);
      return compare_result ? -1 : 1;
    })
    .map(item => item.data);
});

// manage item selections
const selections: Reactive<{
  selected_items: Set<string>;
  show_selected_only: boolean;
}> = reactive({
  selected_items: new Set(),
  show_selected_only: false,
});

const display_items = computed(() => {
  const items = current_sorting.value.details === undefined ? filtered_items.value : sorted_items.value!;
  const final_items = selections.show_selected_only
    ? items.filter(([runtime_id]) => selections.selected_items.has(runtime_id))
    : items;
  return final_items.map(([runtime_id, _]) => runtime_id);
});

function change_all_selected_state(option: { selected?: boolean; inverse?: boolean }) {
  // make a copy of the item list
  const items = [...display_items.value];
  for (const runtime_id of items) {
    if (option.inverse) {
      if (selections.selected_items.has(runtime_id)) {
        selections.selected_items.delete(runtime_id);
      } else {
        selections.selected_items.add(runtime_id);
      }
    } else if (option.selected) {
      selections.selected_items.add(runtime_id);
    } else {
      selections.selected_items.delete(runtime_id);
    }
  }
}

onMounted(() => {
  if (database_store.database_ === undefined) {
    router.replace("/");
    return;
  }
  // find sortable entries
  for (const entry_config of database_store.entries) {
    if (entry_config.sorting_method !== Sorting.Disabled) {
      sortable_entries.push(entry_config);
    }
  }
});

function logout() {
  router.replace("/");
}
</script>
<style lang="css">
.hide-scroll-bar {
  scrollbar-width: none;
}
</style>
