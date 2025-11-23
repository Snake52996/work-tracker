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
    <v-card variant="outlined" class="critical-zone">
      <v-card-title>{{ $t("maintenance.critical_zone") }}</v-card-title>
      <v-card-subtitle>{{ $t("maintenance.critical_zone_explained") }}</v-card-subtitle>
      <v-card-text>
        <v-text-field
          type="password"
          v-model="local_state.password"
          variant="outlined"
          :label="$t('message.input_password')"
        ></v-text-field>
        <v-divider class="my-4" />
        <v-progress-linear
          :max="EncryptMessageLimit"
          v-model="local_state.encrypted_counter"
          :buffer-value="
            local_state.pending_encryptions !== 0
              ? local_state.encrypted_counter + local_state.pending_encryptions
              : 0
          "
          :color="quota_usage < 0.6 ? 'success' : quota_usage < 0.9 ? 'warning' : 'error'"
          height="25px"
        >
          <template v-slot:default>
            {{ local_state.encrypted_counter }}
            {{ local_state.pending_encryptions !== 0 ? `(+${local_state.pending_encryptions})` : "" }} /
            {{ EncryptMessageLimit }}
          </template>
        </v-progress-linear>
        <p :style="need_rekey ? 'color: rgb(var(--v-theme-error))' : 'inherit'">
          {{ $t(need_rekey ? "maintenance.rekey_required" : "maintenance.rekey") }}
        </p>
        <v-btn
          prepend-icon="mdi-dice-multiple"
          block
          class="mt-2"
          :color="need_rekey ? 'primary' : ''"
          :disabled="local_state.password.length === 0"
          :loading="local_state.blocking"
          @click="rekey"
        >
          {{ $t("maintenance.do_rekey") }}</v-btn
        >
        <v-divider class="my-4" />
        <v-text-field
          type="password"
          v-model="local_state.new_password"
          variant="outlined"
          :label="$t('message.input_new_password')"
        ></v-text-field>
        <v-btn
          block
          :disabled="local_state.password.length === 0 || local_state.new_password.length === 0"
          :loading="local_state.blocking"
          @click="update_password"
          >{{ $t("maintenance.change_password") }}</v-btn
        >
      </v-card-text>
    </v-card>
    <v-btn block to="/Main">{{ $t("action.back_to_last_step") }}</v-btn>
  </v-container>
</template>
<script setup lang="ts">
import { i18n } from "@/locales";
import { useDatabaseStore } from "@/stores/database";
import { ImagePoolConfiguration } from "@/procedures/image-utils";
import { inj_DisplayNotice } from "@/types/injections";

import type { ShallowReactive } from "vue";
import { useRouter } from "vue-router";
import { inject, onMounted, shallowReactive, computed } from "vue";
import {
  EncryptMessageLimit,
  get_key_from_password,
  wt_decrypt,
  wt_encrypt,
  wt_import_key,
  wt_random_bytes,
} from "@/procedures/crypto";
import { error_reporter } from "@/procedures/utilities";

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

const need_rekey = computed(() => {
  return local_state.encrypted_counter + local_state.pending_encryptions >= EncryptMessageLimit;
});
const quota_usage = computed(() => {
  return (local_state.encrypted_counter + local_state.pending_encryptions) / EncryptMessageLimit;
});

async function rekey_implementation() {
  // we perform a rekey following these steps
  // 1. re-decrypt the data key: this is to make sure that the password supplied is the same as current one
  const { key: user_key } = await get_key_from_password(
    local_state.password,
    database_store.database_!.runtime.protection.argon2
  );
  await wt_decrypt(
    user_key,
    database_store.database_!.runtime.protection.key_nonce,
    database_store.database_!.runtime.protection.encrypted_key
  );

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
}
function rekey() {
  local_state.blocking = true;
  error_reporter(rekey_implementation(), t("maintenance.do_rekey"), display_notice).finally(() => {
    local_state.blocking = false;
  });
}
async function update_password_implementation() {
  // 1. re-decrypt the data key: this is to make sure that the password supplied is correct
  const { key: user_key } = await get_key_from_password(
    local_state.password,
    database_store.database_!.runtime.protection.argon2
  );
  const raw_data_key = await wt_decrypt(
    user_key,
    database_store.database_!.runtime.protection.key_nonce,
    database_store.database_!.runtime.protection.encrypted_key
  );

  // 2. calculate new user key
  const { key: new_user_key } = await get_key_from_password(
    local_state.new_password,
    database_store.database_!.runtime.protection.argon2
  );

  // 3. re-encrypt current raw data key with the new user key
  const { data: encrypted_new_data_key, nonce } = await wt_encrypt(new_user_key, raw_data_key);

  // 4. update the data key to the database
  database_store.update_data_key({ encrypted_key: encrypted_new_data_key, nonce: nonce });

  // 5. clear the passwords
  local_state.password = "";
  local_state.new_password = "";
}
function update_password() {
  local_state.blocking = true;
  error_reporter(update_password_implementation(), t("maintenance.change_password"), display_notice).finally(
    () => {
      local_state.blocking = false;
    }
  );
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
.critical-zone {
  border-color: rgb(var(--v-theme-warning));
}
</style>
