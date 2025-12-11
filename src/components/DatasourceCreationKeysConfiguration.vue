<!-- configure passwords and keys -->
<template>
  <v-form :disabled="props.disabled">
    <v-text-field
      v-model="password"
      :append-icon="show_password ? 'mdi-eye-off' : 'mdi-eye'"
      :label="$t('datasource_creation.password')"
      :type="show_password ? 'text' : 'password'"
      variant="outlined"
      @click:append="show_password = !show_password"
    />
    <v-btn
      block
      class="mb-4"
      :disabled="password === ''"
      :loading="is_loading"
      prepend-icon="mdi-dice-multiple"
      @click="generate_and_report_configuration"
    >
      {{ $t("datasource_creation.generate_a_key") }}
    </v-btn>
    <v-text-field
      v-model="salt_hex"
      disabled
      :label="$t('datasource_creation.salt')"
      readonly
      variant="outlined"
    />
    <v-text-field
      v-model="key_digest_hex"
      disabled
      :label="$t('datasource_creation.key')"
      readonly
      variant="outlined"
    />
  </v-form>
</template>
<script setup lang="ts">
import type { Ref } from "vue";
import type { Argon2Configuration, DataEncryptionKey } from "@/types/datasource-crypto";
import { inject, ref } from "vue";
import { i18n } from "@/locales";
import { get_key_from_password } from "@/procedures/crypto";
import { to_readable_hexadecimal } from "@/procedures/transcoding";
import { inj_DisplayNotice } from "@/types/injections";

const { t } = i18n.global;
const display_notice = inject(inj_DisplayNotice)!;

const props = defineProps<{
  disabled: boolean;
  argon2ParameterGetter: () => { memory: number; iterations: number; threads: number } | null;
}>();
const emit = defineEmits<{
  finished: [{ salt: Uint8Array; encryption: DataEncryptionKey }];
}>();

const password: Ref<string> = ref("");
const show_password: Ref<boolean> = ref(false);
const salt_hex: Ref<string> = ref("");
const key_digest_hex: Ref<string> = ref("");
const is_loading: Ref<boolean> = ref(false);

function generate_and_report_configuration() {
  is_loading.value = true;

  const argon2_parameters = props.argon2ParameterGetter();
  if (argon2_parameters === null) {
    is_loading.value = false;
    return;
  }

  // generate salt with secure random generator
  // according to RFC 9106, 128 bits (16 bytes) should be sufficient
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  // format it into hex string
  salt_hex.value = to_readable_hexadecimal(salt);

  // build full argon2 configuration
  const argon2_configuration: Argon2Configuration = { ...argon2_parameters, salt: salt };

  // generate a key for data encryption
  // we use 256 bit keys
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  // generate a (SHA-256) digest for it to display
  // this shows something about the key but leaks minimum information
  const key_digest_promise = (async () => {
    const digest = await crypto.subtle.digest("SHA-256", key);
    key_digest_hex.value = to_readable_hexadecimal(new DataView(digest));
  })();
  const key_encryption_promise = (async () => {
    const key_result = await get_key_from_password(password.value, argon2_configuration);
    if (key_result.is_err()) {
      display_notice("error", t("message.error.failed_to_argon2"), String(key_result.unwrap_error()));
      // we throw a dummy error to terminate subsequent procedures
      throw new Error("dummy");
    }
    const { key: password_key } = key_result.unwrap();
    const nonce = new Uint8Array(12);
    crypto.getRandomValues(nonce);
    const encrypted_key = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, password_key, key);
    const result: DataEncryptionKey = {
      raw_key: key,
      encrypted_key: new Uint8Array(encrypted_key),
      key_nonce: nonce,
    };
    return result;
  })();
  // collect results
  Promise.all([key_digest_promise, key_encryption_promise]).then(([_, encryption_configuration]) => {
    emit("finished", { salt: salt, encryption: encryption_configuration });
  }).finally(() => {
    is_loading.value = false;
  });
}
</script>
