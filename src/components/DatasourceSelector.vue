<!-- Select datasource: load from local directory, remote url or create a new database? -->

<template>
  <v-container class="fill-height">
    <v-row justify="center">
      <v-card elevated :loading="loading" max-width="648" width="75%">
        <v-card-title>{{ $t("message.select_datasource") }}</v-card-title>
        <v-card-subtitle>{{ $t("message.select_datasource_detail") }}</v-card-subtitle>
        <v-card-text v-if="ask_password">
          <v-text-field
            v-model="password"
            :append-icon="show_password ? 'mdi-eye-off' : 'mdi-eye'"
            :label="$t('message.input_password')"
            :type="show_password ? 'text' : 'password'"
            variant="outlined"
            @click:append="show_password = !show_password"
            @keydown.enter="phase2_function"
          />
          <v-btn
            block
            class="my-4"
            color="primary"
            :disabled="password.length === 0"
            @click="phase2_function"
          >
            {{ $t("action.open") }}
          </v-btn>
          <v-btn block class="my-3" @click="password = ''; ask_password = false">
            {{ $t("action.back_to_last_step") }}
          </v-btn>
        </v-card-text>
        <v-card-text v-else>
          <v-text-field
            v-model="url"
            clearable
            density="comfortable"
            :label="$t('message.input_remote_url')"
            prepend-icon="mdi-link-variant"
            @keydown.enter="!!url && load_from_remote_url()"
          >
            <template #append>
              <v-btn :disabled="!url" icon="mdi-download" @click="load_from_remote_url" />
            </template>
          </v-text-field>
          <v-file-input
            v-model="local_files"
            density="compact"
            :label="$t('message.input_local_directory')"
            multiple
            prepend-icon="mdi-folder"
            webkitdirectory
            @update:model-value="load_from_local_directory"
          />
          <v-divider>{{ $t("message.alternative_way") }}</v-divider>
          <v-btn block class="my-4" color="info" to="/NewDatasource">{{
            $t("message.create_new_datasource")
          }}</v-btn>
          <div class="mt-12">
            <LanguageSelector />
          </div>
        </v-card-text>
      </v-card>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import type { EncryptedDatasource } from "@/types/datasource";
import type { ImageLoader } from "@/types/datasource-images";
import { inject, ref } from "vue";
import { i18n } from "@/locales";
import { load_datasource_phase1, load_datasource_phase2 } from "@/procedures/crypto-readonly";
import { error_reporter, result_error_reporter } from "@/procedures/utilities";

import { useDatabaseStore } from "@/stores/database";
import { inj_DisplayNotice } from "@/types/injections";
import { Result } from "@/types/result";

const { t } = i18n.global;
const display_notice = inject(inj_DisplayNotice)!;
const loading: Ref<boolean> = ref(false);
const ask_password: Ref<boolean> = ref(false);
const password: Ref<string> = ref("");
const show_password: Ref<boolean> = ref(false);
const phase2_function: Ref<() => void> = ref(() => {});
const router = useRouter();
const database_store = useDatabaseStore();
const local_files: Ref<File[]> = ref([]);

// variable to collect the url
const url: Ref<string> = ref("");

function open_database_phase2(encrypted_database: Result<EncryptedDatasource>, image_loader: ImageLoader) {
  loading.value = true;
  const task = (async (): Promise<Result<void>> => {
    if (encrypted_database.is_err()) {
      return encrypted_database.erase_type();
    }
    const load_result = await load_datasource_phase2(
      encrypted_database.unwrap(),
      password.value,
      image_loader,
    );
    if (load_result.is_err()) {
      return load_result.erase_type();
    }
    database_store.build_runtime_database(load_result.unwrap());
    router.push("/Main");
    return Result.ok(undefined);
  })();
  result_error_reporter(task, t("message.error.failed_opening_database"), display_notice).finally(() => {
    loading.value = false;
  });
}

function load_from_remote_url() {
  loading.value = true;
  // check the URL entered, add https:// protocol prefix if no prefix is given
  //  since we expect to receive URL pointing to a directory, we ensure the url ends with a "/"
  const padded_url = url.value.endsWith("/") ? url.value : `${url.value}/`;
  const base_url = [padded_url, `https://${padded_url}`]
    .map(url => URL.parse(url))
    .find(value => value !== null);
  if (base_url === undefined) {
    display_notice("error", "message.error.invalid_url", "");
    loading.value = false;
    return;
  }

  // place fetching into async lambda expression to make the code clean
  error_reporter(
    (async () => {
      // try to fetch data.json
      const path = URL.parse("data.json", base_url)!;
      const response = await fetch(path);
      if (!response.ok) {
        display_notice(
          "error",
          t("message.error.failed_to_fetch_data", { source: path.toString() }),
          `${response.status}: ${response.statusText}`,
        );
        return;
      }
      const database_source = await response.text();
      phase2_function.value = () => {
        open_database_phase2(load_datasource_phase1(database_source), async (name: string) => {
          const target_url = URL.parse(name, base_url);
          if (target_url === null) {
            return Result.error(t("message.error.invalid_url"));
          }
          try {
            const response = await fetch(target_url);
            if (!response.ok) {
              return Result.error(
                t("message.error.failed_to_fetch_data", { source: target_url.href }),
                response.statusText,
              );
            }
            return Result.ok(await response.blob());
          } catch (error) {
            return Result.error(
              t("message.error.failed_to_fetch_data", { source: target_url.href }),
              String(error),
            );
          }
        });
      };
      ask_password.value = true;
    })(),
    t("message.error.failed_loading_database"),
    display_notice,
  ).then(() => {
    loading.value = false;
  });
}

function load_from_local_directory(input_file: File | File[] | undefined) {
  if (input_file === undefined) {
    return;
  }
  loading.value = true;
  const files = Array.isArray(input_file) ? [...input_file] : [input_file];
  local_files.value.length = 0;

  error_reporter(
    (async () => {
      // filter out files in subdirectories
      const root_files = files.filter(file => file.webkitRelativePath.split("/").length === 2);
      // construct a mapping for fast access
      const file_lookup_table = new Map<string, File>(
        root_files.map(file => [file.webkitRelativePath.split("/")[1] ?? "", file]),
      );
      const database_file = file_lookup_table.get("data.json");
      if (database_file === undefined) {
        display_notice("error", t("message.error.no_main_data_file"), "");
        return;
      }
      const database_source = await database_file.text();
      phase2_function.value = () => {
        open_database_phase2(load_datasource_phase1(database_source), async (name: string) => {
          const file = file_lookup_table.get(name);
          if (file === undefined) {
            return Result.error(t("message.error.file_does_not_exist", { filename: name }));
          }
          return Result.ok(file);
        });
      };
      loading.value = false;
      ask_password.value = true;
    })(),
    t("message.error.failed_loading_database"),
    display_notice,
  ).then(() => {
    loading.value = false;
  });
}
</script>
