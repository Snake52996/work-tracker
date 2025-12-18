<template>
  <template v-if="all_tags.length >= 2">
    <v-row align="center" class="mb-4" justify="space-around">
      <v-col>
        <v-autocomplete v-model="config.first" hide-details :items="first_selectable" />
      </v-col>
      <v-col cols="1" style="text-align: center"><v-icon icon="mdi-arrow-left-right" /></v-col>
      <v-col>
        <v-autocomplete v-model="config.second" hide-details :items="second_selectable" />
      </v-col>
    </v-row>
    <div style="height: 48px; width: 100%">
      <VennDiagram
        :first="counting.first"
        :first-name="config.first?.name ?? ''"
        :intersect="counting.intersect"
        :second="counting.second"
        :second-name="config.second?.name ?? ''"
        :total="database.data.size"
      />
    </div>
  </template>
  <v-sheet v-else class="pa-4 text-center mx-auto">
    <v-icon class="mb-5" icon="mdi-tag-off" size="48" />
    <h2 class="text-h5 mb-6">{{ $t("message.no_tags_to_be_inspected.title") }}</h2>
    <p class="mb-4 text-medium-emphasis text-body-2">
      {{ $t("message.no_tags_to_be_inspected.description") }}
    </p>
  </v-sheet>
</template>

<script setup lang="ts">
import type { Reactive } from "vue";
import type VennDiagram from "./VennDiagram.vue";
import type { TagEntryData } from "@/types/datasource-entry";
import { computed, reactive } from "vue";
import { useDatabaseStore } from "@/stores/database";

const database = useDatabaseStore();

const all_tags = computed(() => {
  const result: { title: string; value: { entry: string; index: number; name: string } }[] = [];
  for (const [entry, tags] of database.tags) {
    result.push(
      ...tags.map((value, index) => ({
        title: `${entry}:${value}`,
        value: {
          entry,
          index,
          name: `${entry}:${value}`,
        },
      })),
    );
  }
  return result;
});
const config: Reactive<{
  first: { entry: string; index: number; name: string } | undefined | null;
  second: { entry: string; index: number; name: string } | undefined | null;
}> = reactive({
  first: all_tags.value[0]!.value,
  second: all_tags.value[1]!.value,
});
const first_selectable = computed(() =>
  all_tags.value.filter(({ value: { entry, index } }) =>
    config.second === undefined || config.second === null
      ? true
      : config.second.entry !== entry || config.second.index !== index,
  ),
);
const second_selectable = computed(() =>
  all_tags.value.filter(({ value: { entry, index } }) =>
    config.first === undefined || config.first === null
      ? true
      : config.first.entry !== entry || config.first.index !== index,
  ),
);
function count_tag_occurrences(
  specification: [{ entry: string; index: number }, { entry: string; index: number }],
): { first: number; second: number; intersect: number } {
  const result = {
    first: 0,
    second: 0,
    intersect: 0,
  };
  const [{ entry: f_entry, index: f_index }, { entry: s_entry, index: s_index }] = specification;
  for (const item of database.data.values()) {
    if (item.entries === undefined) {
      continue;
    }
    const f_data = item.entries.get(f_entry) as TagEntryData | undefined;
    const s_data = item.entries.get(s_entry) as TagEntryData | undefined;
    if (f_data?.tags.includes(f_index)) {
      result.first += 1;
    }
    if (s_data?.tags.includes(s_index)) {
      result.second += 1;
    }
    if (f_data?.tags.includes(f_index) && s_data?.tags.includes(s_index)) {
      result.intersect += 1;
    }
  }
  return result;
}
const counting = computed(() =>
  config.first !== undefined && config.second !== undefined && config.first !== null && config.second !== null
    ? count_tag_occurrences([config.first, config.second])
    : { first: 0, second: 0, intersect: 0 },
);
</script>
