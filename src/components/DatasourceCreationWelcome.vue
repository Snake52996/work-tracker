<template>
  <v-btn class="mb-8" prepend-icon="mdi-arrow-left" to="/">
    {{ $t("action.back_to_last_step") }}
  </v-btn>
  <v-sheet class="pa-4 text-center mx-auto">
    <h2 class="text-h5 mb-6">{{ $t("datasource_creation.welcome") }}</h2>
    <p class="mb-4 text-medium-emphasis text-body-2">
      {{ $t("datasource_creation.welcome_detail") }}
    </p>
  </v-sheet>
  <v-container class="mt-8">
    <v-row>
      <v-spacer />
      <v-btn append-icon="mdi-arrow-right" color="primary" @click="emit('next')">
        {{ $t("action.start") }}
      </v-btn>
    </v-row>
  </v-container>
</template>
<script setup lang="ts">
const emit = defineEmits<{
  next: [];
}>();
</script>
