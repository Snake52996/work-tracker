export * from "./crypto-readonly";

import type { Datasource, EncryptedDatasource } from "@/types/datasource";
import type { ImageFormatSpecification } from "@/types/image-types";
import { NonceLength } from "./crypto-readonly";

function stringify_replacer(this: any, key: string, value: any) {
  if (key == "runtime") {
    return undefined;
  }
  if (value instanceof Uint8Array) {
    return `base64://${value.toBase64()}`;
  }
  if (value instanceof Map) {
    const packer: any[] = ["map://"];
    for (const [k, v] of value.entries()) {
      packer.push([k, v]);
    }
    return packer;
  }
  return value;
}

// get random bytes as a Uint8Array
export function wt_random_bytes(length: number): Uint8Array{
  const result = new Uint8Array(length);
  return crypto.getRandomValues(result);
}

export async function wt_encrypt(
  key: CryptoKey,
  data: string | Uint8Array
): Promise<{ data: Uint8Array; nonce: Uint8Array }> {
  const encoded_data = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const nonce = new Uint8Array(NonceLength);
  crypto.getRandomValues(nonce);
  const encrypted_data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    encoded_data as BufferSource
  );
  return { data: new Uint8Array(encrypted_data), nonce: nonce };
}

export class RekeyError extends Error {}
export const EncryptMessageLimit = 1000000;

// image encrypting specification:
//  Two image file formats (and therefore two codecs) are used in the database: PNG and WebP
//  PNG (specification: https://w3c.github.io/png/) is used to store thumbnails. The insight is that
//   thumbnails are always loaded when the data item is displayed, and introducing too many separate
//   requests automatically is generally not a good idea. Batching (pooling) multiples thumbnails
//   into a single image file will largely reduce the amount of requests required. However, this
//   introduces a new problem: each time a single thumbnail in a image file is modified (inserted),
//   the whole image file have to be decoded, modified and re-encoded, which may lead to decreased
//   image quality in a long term. Using a lossless PNG format avoids such problem since the pixels
//   not modified are guaranteed to be unchanged across re-encodings. Thumbnails are smaller (100x)
//   than full images, making PNG, which has relatively big file sizes, a acceptable option.
//   Other candidate formats are lossless WebP, which can be decoded by modern browsers but with
//   no standard way to encode with the canvas API (https://github.com/whatwg/html/issues/7078) now.
//   Jpeg XL is another candidate, but it is not widely support by browsers on stable branch, and
//   cannot be encoded with the canvas API. Would like to switch to these candidates later when
//   possible since they are better compressed.
//  WebP (specification: https://www.rfc-editor.org/rfc/rfc9649.html) is used to store full images.
//   The full image is saved separately, one as a file, since it will only be loaded when requested
//   by clicking the thumbnail image. This avoids re-encodings since the image file will be replaced
//   when the image is modified, making a lossy compression acceptable.
//
//  Images with different formats are encrypted in different way, but with the same core: leave the
//   file headers unchanged so that they still look like, if not inspected carefully, image files of
//   the same format. All bytes after the header left unchanged are encrypted with a random nonce (IV),
//   which is placed right after the header in encrypted file, before the encrypted content.
//  PNG files have their leading 33 bytes unchanged. This includes the PNG signature (8 bytes) and the
//   IHDR image header chunk, which must be the first chunk in a PNG data stream, starting with 4 bytes
//   of chunk length indicator and followed by 4 bytes of chunk identifier, 13 bytes of header content
//   and 4 bytes of CRC checksums, finally forming a total of 25 bytes. This header, when unencrypted,
//   leaks information about the size, bit depth, color type, compression, filter and interlace methods
//   about the image, which is considered minor and acceptable.
//  WebP files have their leading 12 bytes unchanged. This includes the RIFF file signature (4 bytes),
//   the file size (4 bytes) and the WebP signature (4 bytes). This header leaks nothing, since the
//   file size is known anyway.
export async function encrypt_image(image: Blob, format: ImageFormatSpecification, key: CryptoKey): Promise<Blob> {
  const header_size = format.header_length;
  const array = await image.bytes();
  const image_header = array.slice(0, header_size);
  const data = array.slice(header_size);
  const result = await wt_encrypt(key, data);
  return new Blob([image_header, result.nonce as BufferSource, result.data as BufferSource]);
}

// encrypt the database
//  note that this function will not update encrypted counter
export async function encrypt_datasource(datasource: Datasource, key: CryptoKey): Promise<string> {
  // check if this key has been used for too many times
  if (datasource.protection.encrypted_counter >= EncryptMessageLimit) {
    // well, can anyone really hit this limit?
    throw RekeyError;
  }
  // transform the datasource into string
  const datasource_string = JSON.stringify(datasource, stringify_replacer);
  const { data: encrypted_data, nonce } = await wt_encrypt(key, datasource_string);
  const encrypted_datasource: EncryptedDatasource = {
    protection: {
      encrypted_key: datasource.runtime.protection.encrypted_key,
      key_nonce: datasource.runtime.protection.key_nonce,
      data_nonce: nonce,
      argon2: datasource.runtime.protection.argon2,
    },
    internals: encrypted_data,
  };
  return JSON.stringify(encrypted_datasource, stringify_replacer);
}
