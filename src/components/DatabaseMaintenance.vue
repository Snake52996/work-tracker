<template>
  <v-container v-if="local_state.initialized" class="main-container">
    <v-card v-if="local_state.image_pools.length > 0">
      <v-card-title>{{ $t("maintenance.image_allocation") }}</v-card-title>
      <v-card-text>
        <v-window hide-delimiters show-arrows>
          <v-window-item v-for="image_pool in local_state.image_pools" :key="image_pool.name">
            <v-card>
              <v-card-title style="text-align: center">{{ image_pool.name }}</v-card-title>
              <v-card-text>
                <div class="allocation-image">
                  <span
                    v-for="(slot, index) in image_pool.allocations"
                    :key="index"
                    :class="slot ? 'allocated' : 'unallocated'"
                  />
                </div>
              </v-card-text>
            </v-card>
          </v-window-item>
        </v-window>
      </v-card-text>
    </v-card>
    <v-card>
      <v-card-title>{{ $t("maintenance.tag_insight.title") }}</v-card-title>
      <v-card-subtitle>{{ $t("maintenance.tag_insight.subtitle") }}</v-card-subtitle>
      <v-card-text>
        <tag-insight />
      </v-card-text>
    </v-card>
    <v-card class="danger-zone" variant="outlined">
      <v-card-title>{{ $t("maintenance.danger_zone") }}</v-card-title>
      <v-card-subtitle>{{ $t("maintenance.danger_zone_explained") }}</v-card-subtitle>
      <v-card-text>
        <v-btn block class="mb-1" @click="export_configuration">
          {{ $t("maintenance.export_configuration") }}
        </v-btn>
        <p>{{ $t("maintenance.export_configuration_detail") }}</p>
      </v-card-text>
    </v-card>
    <v-card class="critical-zone" variant="outlined">
      <v-card-title>{{ $t("maintenance.critical_zone") }}</v-card-title>
      <v-card-subtitle>{{ $t("maintenance.critical_zone_explained") }}</v-card-subtitle>
      <v-card-text>
        <v-text-field
          v-model="local_state.password"
          :label="$t('message.input_password')"
          type="password"
          variant="outlined"
        />
        <v-divider class="my-4" />
        <v-progress-linear
          v-model="local_state.encrypted_counter"
          :buffer-value="
            local_state.pending_encryptions !== 0
              ? local_state.encrypted_counter + local_state.pending_encryptions
              : 0
          "
          :color="quota_usage < 0.6 ? 'success' : quota_usage < 0.9 ? 'warning' : 'error'"
          height="25px"
          :max="EncryptMessageLimit"
        >
          <template #default>
            {{ local_state.encrypted_counter }}
            {{ local_state.pending_encryptions !== 0 ? `(+${local_state.pending_encryptions})` : "" }} /
            {{ EncryptMessageLimit }}
          </template>
        </v-progress-linear>
        <p :style="need_rekey ? 'color: rgb(var(--v-theme-error))' : 'inherit'">
          {{ $t(need_rekey ? "maintenance.rekey_required" : "maintenance.rekey") }}
        </p>
        <v-btn
          block
          class="mt-2"
          :color="need_rekey ? 'primary' : ''"
          :disabled="local_state.password.length === 0"
          :loading="local_state.blocking"
          prepend-icon="mdi-dice-multiple"
          @click="rekey"
        >
          {{ $t("maintenance.do_rekey") }}
        </v-btn>
        <v-divider class="my-4" />
        <v-text-field
          v-model="local_state.new_password"
          :label="$t('message.input_new_password')"
          type="password"
          variant="outlined"
        />
        <v-btn
          block
          :disabled="local_state.password.length === 0 || local_state.new_password.length === 0"
          :loading="local_state.blocking"
          @click="update_password"
        >
          {{ $t("maintenance.change_password") }}
        </v-btn>
      </v-card-text>
    </v-card>
    <v-btn block to="/Main">{{ $t("action.back_to_last_step") }}</v-btn>
  </v-container>
</template>
<script setup lang="ts">
import type { ShallowReactive } from "vue";
import { computed, inject, onMounted, shallowReactive } from "vue";
import { useRouter } from "vue-router";
import { i18n } from "@/locales";

import {
  EncryptMessageLimit,
  get_key_from_password,
  wt_decrypt,
  wt_encrypt,
  wt_import_key,
  wt_random_bytes,
} from "@/procedures/crypto";
import { ImagePoolConfiguration } from "@/procedures/image-utils";
import { save_to_local } from "@/procedures/save-to-local";
import { result_error_reporter } from "@/procedures/utilities";
import { useDatabaseStore } from "@/stores/database";
import { inj_DisplayNotice } from "@/types/injections";
import { Result } from "@/types/result";
import TagInsight from "./TagInsight.vue";

const { t } = i18n.global;
const display_notice = inject(inj_DisplayNotice)!;
const database_store = useDatabaseStore();
const router = useRouter();

const local_state: ShallowReactive<{
  initialized: boolean;
  encrypted_counter: number;
  pending_encryptions: number;
  image_pools: { name: string; allocations: boolean[] }[];
  password: string;
  new_password: string;
  blocking: boolean;
}> = shallowReactive({
  initialized: false,
  encrypted_counter: 0,
  pending_encryptions: 0,
  image_pools: [],
  password: "",
  new_password: "",
  blocking: false,
});

onMounted(() => {
  if (database_store.database_ === undefined) {
    router.replace("/");
    return;
  }
  local_state.encrypted_counter = database_store.database_!.protection.encrypted_counter;
  local_state.pending_encryptions = database_store.encrypts_to_be_done;
  local_state.image_pools = database_store.query_image_pool_allocation();
  local_state.initialized = true;
  database_store.encrypts_to_be_done = 0;
});

function export_configuration() {
  save_to_local(
    new Blob([new TextEncoder().encode(JSON.stringify(database_store.database_!.configurations.entry))], {
      type: "application/json",
    }),
    "configuration.json",
  );
}

const need_rekey = computed(() => {
  return local_state.encrypted_counter + local_state.pending_encryptions >= EncryptMessageLimit;
});
const quota_usage = computed(() => {
  return (local_state.encrypted_counter + local_state.pending_encryptions) / EncryptMessageLimit;
});

async function rekey_implementation(): Promise<Result<void>> {
  // we perform a rekey following these steps
  // 1. re-decrypt the data key: this is to make sure that the password supplied is the same as current one
  const key_result = await get_key_from_password(
    local_state.password,
    database_store.database_!.runtime.protection.argon2,
  );
  if (key_result.is_err()) {
    return key_result.erase_type();
  }
  const { key: user_key } = key_result.unwrap();
  const try_decrypt_result = await wt_decrypt(
    user_key,
    database_store.database_!.runtime.protection.key_nonce,
    database_store.database_!.runtime.protection.encrypted_key,
  );
  if (try_decrypt_result.is_err()) {
    return try_decrypt_result.erase_type();
  }

  // 2. generate new data key randomly
  const new_raw_data_key = wt_random_bytes(32);
  const new_data_key = await wt_import_key(new_raw_data_key, { encrypt: true });

  // 3. encrypt the new data key with the user key
  const { data: encrypted_new_data_key, nonce } = await wt_encrypt(user_key, new_raw_data_key);

  // 4. update the data key to the database
  database_store.update_data_key({ encrypted_key: encrypted_new_data_key, nonce: nonce, key: new_data_key });

  // 5. clear the password
  local_state.password = "";

  // 6. update the encryption counter
  local_state.encrypted_counter = database_store.database_!.protection.encrypted_counter;

  return Result.ok(undefined);
}
function rekey() {
  local_state.blocking = true;
  result_error_reporter(rekey_implementation(), t("maintenance.do_rekey"), display_notice).finally(() => {
    local_state.blocking = false;
  });
}
async function update_password_implementation(): Promise<Result<void>> {
  // 1. re-decrypt the data key: this is to make sure that the password supplied is correct
  const key_result = await get_key_from_password(
    local_state.password,
    database_store.database_!.runtime.protection.argon2,
  );
  if (key_result.is_err()) {
    return key_result.erase_type();
  }
  const { key: user_key } = key_result.unwrap();
  const raw_data_key = await wt_decrypt(
    user_key,
    database_store.database_!.runtime.protection.key_nonce,
    database_store.database_!.runtime.protection.encrypted_key,
  );
  if (raw_data_key.is_err()) {
    return raw_data_key.erase_type();
  }

  // 2. calculate new user key
  const new_key_result = await get_key_from_password(
    local_state.new_password,
    database_store.database_!.runtime.protection.argon2,
  );
  if (new_key_result.is_err()) {
    return new_key_result.erase_type();
  }
  const { key: new_user_key } = new_key_result.unwrap();

  // 3. re-encrypt current raw data key with the new user key
  const { data: encrypted_new_data_key, nonce } = await wt_encrypt(new_user_key, raw_data_key.unwrap());

  // 4. update the data key to the database
  database_store.update_data_key({ encrypted_key: encrypted_new_data_key, nonce: nonce });

  // 5. clear the passwords
  local_state.password = "";
  local_state.new_password = "";

  return Result.ok(undefined);
}
function update_password() {
  local_state.blocking = true;
  result_error_reporter(
    update_password_implementation(),
    t("maintenance.change_password"),
    display_notice,
  ).finally(() => {
    local_state.blocking = false;
  });
}
</script>
<style lang="css" scoped>
.main-container > .v-card {
  margin-top: 24px;
  margin-bottom: 24px;
}
.allocation-image {
  width: max-content;
  margin: auto;
  display: grid;
  grid-template-columns: repeat(v-bind("ImagePoolConfiguration.columns"), 10px);
  grid-template-rows: repeat(v-bind("ImagePoolConfiguration.rows"), 10px);
  gap: 4px;
}
span.allocated {
  background-color: rgb(var(--v-theme-primary));
}
span.unallocated {
  background-color: unset;
  border-color: rgb(var(--v-theme-secondary));
  border-style: solid;
  border-width: 1px;
}
span.allocated,
span.unallocated {
  border-radius: 20%;
}
.danger-zone {
  border-color: rgb(var(--v-theme-warning));
}
.critical-zone {
  border-color: rgb(var(--v-theme-error));
}
</style>
