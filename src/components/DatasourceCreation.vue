<!-- Create a new database step by step. -->

<template>
  <v-container class="fill-height">
    <v-row justify="center">
      <v-stepper
        width="100%"
        alt-labels
        :items="[
          $t('datasource_creation.welcome'),
          $t('datasource_creation.security_setup'),
          $t('datasource_creation.general_configuration'),
          $t('datasource_creation.entry_setting'),
          $t('datasource_creation.summary_and_done'),
        ]"
        :mobile="mobile"
        hide-actions
        v-model="current_step"
      >
        <template v-slot:item.1>
          <datasource-creation-welcome @next="current_step += 1" />
        </template>
        <template v-slot:item.2>
          <datasource-creation-security-setup
            @prev="current_step -= 1"
            @next="collect_crypto_configurations_and_continue"
          />
        </template>
        <template v-slot:item.3>
          <datasource-creation-general-configuration
            @prev="current_step -= 1"
            @next="collect_global_configurations_and_continue"
          />
        </template>
        <template v-slot:item.4>
          <datasource-creation-entry-setting
            @prev="current_step -= 1"
            @next="collect_entry_configurations_and_continue"
          />
        </template>
        <template v-slot:item.5>
          <v-sheet class="pa-4 text-center mx-auto">
            <v-icon class="mb-5" color="success" icon="mdi-check-circle" size="112"></v-icon>
            <h2 class="text-h5 mb-6">{{ $t("datasource_creation.summary_and_done") }}</h2>
            <p class="mb-4 text-medium-emphasis text-body-2">
              {{ $t("datasource_creation.summary_and_done_detail") }}
            </p>
          </v-sheet>
          <v-container class="mt-8">
            <v-row class="mb-2">
              <v-spacer></v-spacer>
              <v-btn
                color="primary"
                :loading="generating"
                prepend-icon="mdi-download"
                @click="download_database"
              >
                {{ $t("action.download_full_database") }}
              </v-btn>
              <v-spacer></v-spacer>
            </v-row>
            <v-row v-if="download_clicked" class="mt-2">
              <v-spacer></v-spacer>
              <v-btn color="success" prepend-icon="mdi-check" to="/">
                {{ $t("action.done") }}
              </v-btn>
              <v-spacer></v-spacer>
            </v-row>
          </v-container>
        </template>
      </v-stepper>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { encrypt_datasource, wt_import_key } from "@/procedures/crypto";
import { save_to_local } from "@/procedures/save-to-local";
import type { Datasource } from "@/types/datasource";
import type { CryptoConfiguration } from "@/types/datasource-crypto";
import type { EntriesConfiguration } from "@/types/datasource-entry";
import type { GlobalConfiguration } from "@/types/datasource-global";

import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import type { Ref } from "vue";
import { ref } from "vue";
import { useDisplay } from "vuetify";

const { mobile } = useDisplay();

const current_step: Ref<number> = ref(0);

let crypto_configurations: CryptoConfiguration | null = null;
function collect_crypto_configurations_and_continue(configuration: CryptoConfiguration) {
  crypto_configurations = configuration;
  current_step.value += 1;
}

let global_configuration: GlobalConfiguration | null = null;
function collect_global_configurations_and_continue(configuration: GlobalConfiguration) {
  global_configuration = configuration;
  current_step.value += 1;
}

const generating: Ref<boolean> = ref(true);
const download_clicked: Ref<boolean> = ref(false);
let downloadable_database: Blob | null = null;
async function generate_database() {
  if (crypto_configurations === null || global_configuration === null || entries_configuration === null) {
    return null;
  }
  const blob_builder = new BlobWriter();
  const zip_builder = new ZipWriter(blob_builder, {
    compressionMethod: 0, // there is no need to compress it
    level: 0, // there is no need to compress it
    zip64: true,
  });

  // create a directory in the zip file with name of the database
  await zip_builder.add(global_configuration.name, undefined, { directory: true });

  // build the full database
  const database: Datasource = {
    runtime: {
      protection: {
        encrypted_key: crypto_configurations.data_encryption.encrypted_key,
        argon2: crypto_configurations.argon2,
        key: await wt_import_key(crypto_configurations.data_encryption.raw_key, { encrypt: true }),
        key_nonce: crypto_configurations.data_encryption.key_nonce,
      },
    },
    protection: {
      encrypted_counter: 0,
    },
    configurations: {
      global: global_configuration,
      entry: entries_configuration,
    },
    data: new Map(),
  };
  // encrypt it
  const encrypted_database = await encrypt_datasource(database, database.runtime.protection.key);
  // add it into the zip file
  await zip_builder.add(`${global_configuration.name}/data.json`, new TextReader(encrypted_database));
  await zip_builder.close();
  downloadable_database = await blob_builder.getData();
  generating.value = false;
}
function download_database() {
  const real_download = () => {
    if (downloadable_database === null) {
      return;
    }
    save_to_local(downloadable_database, "database.zip");
    download_clicked.value = true;
  };
  if (downloadable_database === null) {
    generate_database().then(() => {
      real_download();
    });
  } else {
    real_download();
  }
}

let entries_configuration: EntriesConfiguration | null = null;
function collect_entry_configurations_and_continue(configuration: EntriesConfiguration) {
  entries_configuration = configuration;
  current_step.value += 1;
  generate_database();
}
</script>
