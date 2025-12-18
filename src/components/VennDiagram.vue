<template>
  <div class="venn-container" :style="style">
    <div class="venn-element venn-element-first">
      <v-tooltip activator="parent" location="top">{{
        `${props.firstName}: ${props.first} (${((props.first / props.total) * 100).toFixed(2)}%)`
      }}</v-tooltip>
    </div>
    <div class="venn-element venn-element-intersect">
      <v-tooltip activator="parent" location="top">{{
        `${$t("conjunctions.both_a_and_b", { a: props.firstName, b: props.secondName })}: ${props.intersect} (${((props.intersect / props.total) * 100).toFixed(2)}%)`
      }}</v-tooltip>
    </div>
    <div class="venn-element venn-element-second">
      <v-tooltip activator="parent" location="top">{{
        `${props.secondName}: ${props.second} (${((props.second / props.total) * 100).toFixed(2)}%)`
      }}</v-tooltip>
    </div>
    <div class="venn-element venn-element-remaining">
      <v-tooltip activator="parent" location="top">{{
        `${$t("conjunctions.neither_a_nor_b", { a: props.firstName, b: props.secondName })}: ${remaining} (${((remaining / props.total) * 100).toFixed(2)}%)`
      }}</v-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  total: number;
  first: number;
  second: number;
  intersect: number;
  firstName: string;
  secondName: string;
}>();

function reform_ratios(ratios: number[], minimum: number): number[] {
  const new_ratios = ratios.map((value, index) => ({ index, value }));
  for (const _ of Array.from({ length: 20 })) {
    const lowers = new_ratios.filter(({ value }) => value < minimum && value !== 0);
    const highers = new_ratios.filter(({ value }) => value >= minimum);

    if (lowers.length === 0) {
      break;
    }
    const single_lower_delta = minimum - Math.min(...lowers.map(({ value }) => value));
    const lower_delta = single_lower_delta * lowers.length;
    const higher_delta = highers.reduce((previous, { value }) => previous + (value - minimum), 0);

    for (const { index, value } of highers) {
      const deduction = (value / higher_delta) * lower_delta;
      new_ratios[index]!.value -= deduction;
    }
    for (const { index } of lowers) {
      new_ratios[index]!.value += single_lower_delta;
    }

    const current_total = new_ratios.reduce((previous, { value }) => previous + value, 0);
    for (const ratio of new_ratios) {
      ratio.value /= current_total;
    }
  }
  return new_ratios.map(({ value }) => value);
}

const pure_first = computed(() => props.first - props.intersect);
const pure_second = computed(() => props.second - props.intersect);
const remaining = computed(() => props.total - props.first - props.second + props.intersect);
const first_ratio = computed(() => pure_first.value / props.total);
const second_ratio = computed(() => pure_second.value / props.total);
const intersect_ratio = computed(() => props.intersect / props.total);
const rest_ratio = computed(() => 1 - first_ratio.value - second_ratio.value + intersect_ratio.value);
const style = computed(() => {
  const [f, s, i, r] = reform_ratios(
    [first_ratio.value, second_ratio.value, intersect_ratio.value, rest_ratio.value],
    0.04,
  ) as [number, number, number, number];
  return `grid-template-columns: ${f * 100}% ${i * 100}% ${s * 100}% ${r * 100}%;`;
});
</script>
<style lang="css" scoped>
* {
  box-sizing: border-box;
}
.venn-container {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  border-style: solid;
  border-color: rgb(var(--v-theme-success));
  overflow: hidden;
  display: grid;
  gap: 0px;
}
.venn-element {
  width: 100%;
  height: 100%;
}
.venn-element-first {
  color: rgb(var(--v-theme-primary));
  background-color: rgb(var(--v-theme-primary));
}
.venn-element-second {
  color: rgb(var(--v-theme-secondary));
  background-color: rgb(var(--v-theme-secondary));
}
.venn-element-intersect {
  color: color-mix(in xyz, rgb(var(--v-theme-primary)) 50%, rgb(var(--v-theme-secondary)));
  background-color: color-mix(in xyz, rgb(var(--v-theme-primary)) 50%, rgb(var(--v-theme-secondary)));
}
.venn-element-remaining {
  color: rgb(var(--v-theme-background));
  background-color: rgb(var(--v-theme-background));
}
</style>
