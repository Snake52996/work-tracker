import type { Ref } from "vue";
import type { LoadedImage } from "@/procedures/item-migrant";
import type { Datasource } from "@/types/datasource";
import type { DataItem } from "@/types/datasource-data";
import type { RatingEntryData, StringEntryData, TagEntryData } from "@/types/datasource-entry";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { i18n } from "@/locales";
import { encrypt_datasource, encrypt_image, EncryptMessageLimit } from "@/procedures/crypto";
import { open_image } from "@/procedures/crypto-readonly";
import {
  create_empty_pool,
  crop_image,
  encode_image,
  ImagePoolConfiguration,
  place_image,
  to_thumbnail_size,
} from "@/procedures/image-utils";
import { make_database_pack } from "@/procedures/packing-utils";
import { save_to_local } from "@/procedures/save-to-local";

import { attempts_to, dual_way_filter } from "@/procedures/utilities";
import { type ImageFormatSpecification, ImageImageFormat, ThumbnailImageFormat } from "@/types/image-types";
import {
  type InvalidDuplicatedValue,
  type InvalidImageFetch,
  type ItemInvalidReason,
  ItemInvalidType,
} from "@/types/invalid-items";
import { Result } from "@/types/result";

const { t } = i18n.global;

interface iTagPatch {
  register_tags: (entry_name: string, new_tags: string[]) => number[];
  confirm: () => void;
  cancel: () => void;
}

// holder of pseudo version numbers
//  see comment below for ModificationManager to understand what this is designed for
//  we use a class to wrap this since we will keep two instances of the same list of entries, one for current
//  state, one for the saved state
class PseudoVersionNumbers {
  // version number for each image file
  images: Map<string, number>;
  // version number for the main database file
  core = 0;

  constructor() {
    this.images = new Map();
  }
}

// manager to record modifications made to the database
//  this manager does not care about what is exactly the modification, but for how many times has the database
//  been modified. It holds a pseudo version number for each image (thumbnail pool or full image) and the core
//  database itself, which is increased by one each time it get modified.
//  The manager also holds a snapshot of the pseudo version numbers last time the database was saved, so it is
//  possible to determine if the latest modification was saved
class ModificationManager {
  // helper update notifier to integrate with Vue
  //  after each time the effective content of this manager is modified, this value is modified
  //  therefore you can use it in computed or watch to get notifications about state updates
  notifier: Ref<number>;

  // current state
  #current: PseudoVersionNumbers;
  // saved state
  #saved: PseudoVersionNumbers;

  constructor() {
    this.notifier = ref(0);
    this.#current = new PseudoVersionNumbers();
    this.#saved = new PseudoVersionNumbers();
  }

  // get an iterable of names of modified image files
  modified_images() {
    return this.#current.images.keys();
  }

  // check if any modification has been applied to the database since it was loaded
  //  this will be true if the list of modified images is not empty, or if core database is modified
  is_modified() {
    return this.#current.images.size > 0 || this.#current.core > 0;
  }

  // check if any modification has been applied to the database since it was loaded and the most recent
  //  modification has not been saved
  is_modification_unsaved() {
    if (!this.is_modified()) {
      return false;
    }
    // current state have a newer main database file that what has been saved
    if (this.#saved.core < this.#current.core) {
      return true;
    }
    for (const [name, version] of this.#current.images) {
      const saved_version = this.#saved.images.get(name);
      if (saved_version === undefined || saved_version < version) {
        // a new modified image is included, or an image is modified again
        return true;
      }
    }
    return false;
  }

  // commit change to image files
  modify_images(images: Iterable<string>) {
    for (const image of images) {
      const existing = this.#current.images.get(image) ?? 0;
      this.#current.images.set(image, existing + 1);
    }
    // send notification
    this.notifier.value += 1;
  }

  // commit change to the main database file
  modify_core_database() {
    this.#current.core += 1;
    // send notification
    this.notifier.value += 1;
  }

  // mark current state as saved
  save_state() {
    this.#saved.core = this.#current.core;
    this.#saved.images = new Map(this.#current.images.entries());
    // send notification
    this.notifier.value += 1;
  }

  // reset state
  reset() {
    this.#current.core = 0;
    this.#current.images.clear();
    this.#saved.core = 0;
    this.#saved.images.clear();
    this.notifier.value = 0;
  }
}

interface InternalState {
  // modification manager
  modification_manager: ModificationManager;

  // list of entries in unique mode and values used in them
  //  note that only entries with string type can be set as unique
  //  mapping: entry name -> set of values
  unique_entries: Map<string, Set<string>>;

  // pending tag patch
  tag_patch: iTagPatch | null;

  // loaded thumbnail pools
  //  mapping: filename -> data loaded from the file
  //  since the thumbnails are quite small, we store as ImageBitmaps
  loaded_thumbnail_pools: Map<string, ImageBitmap>;

  // cropped thumbnail for single data items
  //  mapping: data_id -> image blob URL
  thumbnails: Map<string, string>;

  // loaded full image for single data items
  //  mapping: data_id -> image blob URL
  images: Map<string, string>;

  // new (changed) data key
  //  if the data key is regenerated, this value will be filled
  //  we will not replace the data key stored in original place (in database_.runtime.protection.key) since
  //  that old key may still be used to decrypt loaded images that are not yet loaded into caches when the
  //  data key is regenerated. Instead, we store it here and mark all images (if exists) as modified. In
  //  this way, when the database is exported for updating, all images are loaded (if not yet in the cache)
  //  with the old data key and re-encrypted with the new data key, then included in both the delta and full
  //  export, as what we expect regenerating the data key should do: decrypt all files encrypted and then
  //  re-encrypt them. Moreover, the saving procedure requires only minor modifications when the key
  //  regeneration is implemented in this way: just use this key instead of the original one to encrypt the
  //  data if this is set.
  new_data_key?: CryptoKey;

  // keep this comment at the bottom
  // if you are adding new entries into this structure, remember to update the reset function!
}

export const useDatabaseStore = defineStore("database", () => {
  const database_: ShallowRef<Datasource | undefined> = shallowRef();
  const router = useRouter();

  const has_image = computed(() => {
    return !!database_.value?.configurations.entry.image_size;
  });
  const image_size = computed(() => {
    return database_.value!.configurations.entry.image_size!;
  });
  const entries = computed(() => {
    return database_.value!.configurations.entry.entries;
  });

  // mapping: data_id -> data
  //  data_id is a unique id for each item, also referred to as runtime_id
  const data: Ref<Map<string, DataItem>> = ref(new Map());
  // mapping: entry name with datatype === tag -> tag contents
  const tags: Ref<Map<string, string[]>> = ref(new Map());

  // image pools: records about allocated and free slots in batch images
  //  mapping: filename -> free bitmap
  const image_pools: Map<string, Uint8Array> = new Map();

  // collection of not exported variables that are only available at runtime
  const internal_states: InternalState = {
    modification_manager: new ModificationManager(),
    unique_entries: new Map(),
    tag_patch: null,
    loaded_thumbnail_pools: new Map(),
    thumbnails: new Map(),
    images: new Map(),
  };

  // generate a uuid which ensuring no collision is caused
  //  do we really need this functionality??
  function generate_uuid_internal(collision: (uuid: string) => boolean) {
    while (true) {
      const uuid = crypto.randomUUID();
      if (!collision(uuid)) {
        return uuid;
      }
    }
  }

  function build_runtime_database(database: Datasource) {
    // store the database
    //  note that value here is not supposed to be updated during runtime: take it as readonly
    database_.value = database;

    // extract data items from the database
    data.value = database.data;

    // extract defined tags
    if (database.tags !== undefined) {
      tags.value = database.tags;
    }

    // extract image batch allocation status
    if (database_.value.images !== undefined) {
      for (const pool of database_.value.images.pools) {
        image_pools.set(pool.name, pool.bitmap);
      }
    }

    // register unique entries and their values to allow fast verification later
    for (const entry_config of database.configurations.entry.entries) {
      if (entry_config.type !== "string" || entry_config.unique !== true) {
        continue;
      }
      const values: Set<string> = new Set();
      for (const item of data.value.values()) {
        // the entries field of the item must not be undefined
        //  since we do have entries configured in this database
        const value = item.entries!.get(entry_config.name);
        // however, this entry can be missing for this item if the entry is optional
        if (value === undefined) {
          return;
        }
        values.add((value as StringEntryData).value);
      }
      internal_states.unique_entries.set(entry_config.name, values);
    }
    Object.assign(window, { database_internal: internal_states });
  }

  // load an (encrypted) image with the file loader and decrypt it for later usage
  //  this function takes the name of image to be loaded, which is passed to the loader directly
  //  the image format need to be specified, which is required to decrypt the image
  //   inferring the format with its name (say through its extension) is possible, but which ties the filename
  //   with the format it is in. This is some extra restrictions that we would like to avoid
  async function prepare_image(name: string, format: ImageFormatSpecification): Promise<Result<Blob>> {
    const image_loader = database_.value!.runtime.images!.loader!;
    const load_result = await image_loader(name);
    const image = await load_result
      .map(async encrypted => await open_image(encrypted, format, database_.value!.runtime.protection.key))
      .shift_promise();
    return image.flatten();
  }

  // get a thumbnail pool using the filename stem (NO extension!)
  async function get_thumbnail_pool(name: string): Promise<Result<ImageBitmap>> {
    const cached = internal_states.loaded_thumbnail_pools.get(name);
    if (cached !== undefined) {
      return Result.ok(cached);
    }
    const raw_pool = await prepare_image(`${name}${ThumbnailImageFormat.extension}`, ThumbnailImageFormat);
    if (raw_pool.is_err()) {
      return raw_pool.erase_type();
    }
    // convert into ImageBitmap
    const pool = await window.createImageBitmap(raw_pool.unwrap());
    // place into cache
    internal_states.loaded_thumbnail_pools.set(name, pool);
    return Result.ok(pool);
  }

  // place loaded image into image caches
  //  this function should be used to initiate or update (place or replace) cache for item image in
  //    internal_states.thumbnails
  //    internal_states.images
  //  since this function takes care of freeing old (replaced) Blob URLs
  function place_image_cache(runtime_id: string, data: { image?: string; thumbnail?: string }) {
    for (const { new_url, caching } of [
      { new_url: data.image, caching: internal_states.images },
      { new_url: data.thumbnail, caching: internal_states.thumbnails },
    ]) {
      if (new_url === undefined) {
        continue;
      }
      const current_value = caching.get(runtime_id);
      if (current_value === new_url) {
        continue;
      }
      caching.set(runtime_id, new_url);
      if (current_value !== undefined) {
        URL.revokeObjectURL(current_value);
      }
    }
  }

  // try to get cached image for an item, return undefined if the image is not yet loaded into memory
  //  this is just a simple wrapping / forwarding, which avoids exporting internal state (this is not a
  //  function only for internal usage, but is also invoked from outside this file)
  function get_cached_image(runtime_id: string): string | undefined {
    return internal_states.images.get(runtime_id);
  }

  // get thumbnail for an item, load it if it is not loaded yet
  async function get_thumbnail(runtime_id: string): Promise<Result<string>> {
    // check if it has been cropped
    const cached = internal_states.thumbnails.get(runtime_id);
    if (cached !== undefined) {
      return Result.ok(cached);
    }
    // to load and crop the thumbnail, we need the data item
    const data_item = data.value.get(runtime_id);
    if (data_item === undefined) {
      return Result.error(
        t("message.error.fetching_thumbnail_for_unknown_item"),
        t("message.error.fetching_thumbnail_for_unknown_item_detail", { id: runtime_id }),
      );
    }
    // get the corresponding thumbnail pool first
    const thumbnail_pool = await get_thumbnail_pool(data_item.image!.name);
    if (thumbnail_pool.is_err()) {
      return thumbnail_pool.erase_type();
    }
    // crop the thumbnail out from the pool
    const url = await crop_image(
      thumbnail_pool.unwrap(),
      data_item.image!.index,
      to_thumbnail_size(image_size.value),
    );
    if (url.is_ok()) {
      // place into the cache and return
      place_image_cache(runtime_id, { thumbnail: url.unwrap() });
    }
    return url;
  }

  // load full image for a data item, getting its Blob URL which can be used to display it
  //  This function returns an empty string in case the image file does not exist
  async function get_image(runtime_id: string): Promise<Result<string>> {
    // check for cache first
    const cached = get_cached_image(runtime_id);
    if (cached !== undefined) {
      return Result.ok(cached);
    }
    // if the cache missed, load it
    const image = await prepare_image(`${runtime_id}${ImageImageFormat.extension}`, ImageImageFormat);
    if (image.is_err()) {
      return image.erase_type();
    }
    // create a URL for the image
    const url = URL.createObjectURL(image.unwrap());
    // update the cache
    place_image_cache(runtime_id, { image: url });
    return Result.ok(url);
  }

  // get a free slot to store image
  //  this function tries to find a free slot in existing image batches (pools) first
  //  if one cannot be found, this function will allocate a new image batch, place it properly as a loaded
  //  thumbnail batch, and mark them as modified
  function allocate_thumbnail_slot(): { name: string; index: number } {
    // this function always modifies the main data file
    internal_states.modification_manager.modify_core_database();

    function find_clear_bit(value: number): { index: number; shifted: number } {
      for (let i = 0; i < 8; i++) {
        const shifted = 1 << i;
        if ((value & shifted) === 0) {
          return {
            index: i,
            shifted,
          };
        }
      }
      return {
        index: -1,
        shifted: 0,
      };
    }
    function get_first_free_index(bitmap: Uint8Array): number | null {
      if (bitmap.length != ImagePoolConfiguration.rows) {
        throw Error;
      }
      for (const [index, value] of bitmap.entries()) {
        if (value === 255) {
          continue;
        }
        const bit_location = find_clear_bit(value);
        bitmap[index]! += bit_location.shifted;
        return index * ImagePoolConfiguration.columns + bit_location.index;
      }
      return null;
    }
    for (const [name, bitmap] of image_pools.entries()) {
      const index = get_first_free_index(bitmap);
      if (index !== null) {
        internal_states.modification_manager.modify_images([name]);
        return { name, index };
      }
    }
    // make a new image
    const name = generate_uuid_internal(uuid => image_pools.has(uuid));
    const thumbnail_pool = create_empty_pool(to_thumbnail_size(image_size.value));
    internal_states.modification_manager.modify_images([name]);
    internal_states.loaded_thumbnail_pools.set(name, thumbnail_pool);
    const new_bitmap = new Uint8Array(ImagePoolConfiguration.rows);
    new_bitmap[0] = 1;
    image_pools.set(name, new_bitmap);
    return { name, index: 0 };
  }

  // add a thumbnail to the database
  //  if replace is not undefined, try to replace thumbnail stored in the slot specified directly
  // return the slot where thumbnail was placed
  // NOTE: this function does not modified cached thumbnail for any item, only the thumbnail pool is modified
  async function update_item_thumbnail(
    thumbnail: ImageBitmap,
    replace?: {
      name: string;
      index: number;
    },
  ): Promise<Result<{ name: string; index: number }>> {
    // find the target slot to place image in
    //  if we are replacing, get the slot used to store image for this item
    //  otherwise, allocate a new slot
    const slot = replace ?? allocate_thumbnail_slot();

    // we ensure the thumbnail pool to place thumbnail in is loaded to memory and get its current value
    const thumbnail_pool = await get_thumbnail_pool(slot.name);
    if (thumbnail_pool.is_err()) {
      return thumbnail_pool.erase_type();
    }
    // place the new thumbnail into the thumbnail pool
    const modified_thumbnail_pool = await place_image(
      thumbnail_pool.unwrap(),
      slot.index,
      thumbnail,
      to_thumbnail_size(image_size.value),
    );
    // replace the thumbnail pool
    internal_states.loaded_thumbnail_pools.set(slot.name, modified_thumbnail_pool);
    // update modified list
    internal_states.modification_manager.modify_images([slot.name]);
    return Result.ok(slot);
  }

  // acquire a new unique runtime id for data item
  function acquire_new_runtime_id() {
    return generate_uuid_internal(uuid => data.value.has(uuid));
  }

  // structure holding tags to be registered into different entries
  //  this structure exists since our place_item function must offer strong exception guarantee. Modifications
  //   to the database about registered tags are only stored in this structure until the modification is later
  //   confirmed, when the modification will finally be applied to the database
  class TagPatch implements iTagPatch {
    #cached_tags: Map<string, Map<string, number>>;

    constructor() {
      this.#cached_tags = new Map();
    }

    // register several new tags to this patch under certain entry namespace
    //  this function returns the allocated id for each tag supplied in ascending order
    //  note that this function handles cases in which the tag supplied is already registered to the database
    //   by using directly the registered id. This also applies to the case that it is registered to this
    //   tag patch (but not yet confirmed to join the database)
    public register_tags(entry_name: string, new_tags: string[]): number[] {
      if (!this.#cached_tags.has(entry_name)) {
        this.#cached_tags.set(entry_name, new Map());
      }
      const patch_target = this.#cached_tags.get(entry_name)!;
      const existing_tags = tags.value.get(entry_name);
      const modifier = existing_tags?.length ?? 0;
      return new_tags.map(tag_string => {
        const registered_id = existing_tags?.indexOf(tag_string);
        if (registered_id !== undefined && registered_id !== -1) {
          return registered_id;
        }
        const allocated_id = patch_target.get(tag_string);
        if (allocated_id !== undefined) {
          return allocated_id;
        }
        const index = patch_target.size + modifier;
        patch_target.set(tag_string, index);
        return index;
      });
    }

    // apply the modifications
    public confirm() {
      for (const [entry_name, new_tags] of this.#cached_tags.entries()) {
        const ordered_tags = Array.from(new_tags.entries(), ([content, index]) => ({
          content,
          index,
        }))
          .toSorted(({ index: lhs }, { index: rhs }) => lhs - rhs)
          .map(value => value.content);
        if (tags.value.has(entry_name)) {
          tags.value.get(entry_name)!.push(...ordered_tags);
        } else {
          tags.value.set(entry_name, ordered_tags);
        }
      }
      this.#cached_tags.clear();
    }

    // cancel the modifications
    public cancel() {
      this.#cached_tags.clear();
      internal_states.tag_patch = null;
    }
  }

  // prepare for new tag registration, return the patch holder
  function prepare_tag_registration(): TagPatch {
    if (internal_states.tag_patch === null) {
      internal_states.tag_patch = new TagPatch();
    }
    return internal_states.tag_patch as TagPatch;
  }

  // compare two data items, return if a modification is made
  function compare_data_item(old_data: DataItem | undefined, new_data: DataItem): boolean {
    if (old_data === undefined) {
      return true;
    }
    if (old_data.image !== undefined && new_data.image !== undefined) {
      // since image is never optional, image must exist of be missing for both item at the same time
      // we allow a single if that could have been merged here since merging it makes really a long condition
      //  such long condition harms readability
      // eslint-disable-next-line unicorn/no-lonely-if
      if (old_data.image.index != new_data.image.index || old_data.image.name !== new_data.image.name) {
        return true;
      }
    }
    const result = entries.value.reduce((previous, entry_configuration): boolean => {
      if (previous) {
        return true;
      }
      // if any entry is defined during database creation, each item will always have a Map for entries
      //  though this Map might be empty
      if (
        old_data.entries!.has(entry_configuration.name) != new_data.entries!.has(entry_configuration.name)
      ) {
        return true;
      }
      const old_entry_data_ = old_data.entries!.get(entry_configuration.name);
      const new_entry_data_ = new_data.entries!.get(entry_configuration.name);
      if (old_entry_data_ === undefined || new_entry_data_ === undefined) {
        // since they have the same .has result on the name, both of them must be undefined
        return false;
      }
      switch (entry_configuration.type) {
        case "string": {
          return (old_entry_data_ as StringEntryData).value !== (new_entry_data_ as StringEntryData).value;
        }
        case "rating": {
          const old_entry_data = old_entry_data_ as RatingEntryData;
          const new_entry_data = new_entry_data_ as RatingEntryData;
          return (
            old_entry_data.score !== new_entry_data.score || old_entry_data.comment !== new_entry_data.comment
          );
        }
        case "tag": {
          const old_entry_data = old_entry_data_ as TagEntryData;
          const new_entry_data = new_entry_data_ as TagEntryData;
          if (old_entry_data.tags.length !== new_entry_data.tags.length) {
            return true;
          }
          return (old_entry_data_ as TagEntryData).tags.reduce((last, old_tag, index): boolean => {
            if (last) {
              return true;
            }
            return old_tag !== new_entry_data.tags[index];
          }, false);
        }
        // No default
      }
    }, false);
    return result;
  }

  // place items to the database
  //  specify an existing runtime id to replace its content
  //  specify images to replace the image if required. Note that if the database is not configured to include
  //   an image for each item, specify it will not cause an error but silently ignored. The image is not freed
  //   by this function
  //  this function returns an array of failures occurred. If the array is empty, the database is updated as
  //   requested, otherwise, no modification is applied to the database, i.e. this function offers strong
  //   exception guarantee. Note that the returned array, if not empty, may not contain all errors in the data
  //   supplied.
  async function place_item(
    items: {
      runtime_id?: string;
      source: DataItem;
      images?: LoadedImage;
    }[],
  ): Promise<{ index: number; reason: ItemInvalidReason }[]> {
    // check the item first
    const failures: { index: number; reason: ItemInvalidReason }[] = [];
    do {
      // single-item validation is done in ItemEditor, we check about cross-item restrictions
      //  currently, entry uniqueness is the only cross-item restriction applied
      // we cache the newly collected unique values for appending them later, if this batch of data is allowed
      //  to be merged into the database
      const pending_unique_values: Map<string, Set<string>> = new Map();
      for (const [entry_name, values] of internal_states.unique_entries.entries()) {
        const new_unique_values: Set<string> = new Set();
        for (const [index, { runtime_id, source }] of items.entries()) {
          const data_ = source.entries!.get(entry_name);
          if (data_ === undefined) {
            continue;
          }
          const new_data = data_ as StringEntryData;
          if (
            (() => {
              // a little bit complex here, use a lambda expression to make it clear
              //  note: returning true will cause the item fail this check and an error will be reported
              //        returning false indicates this entry is checked without errors detected
              if (new_unique_values.has(new_data.value)) {
                // collision is never allowed among the batched data items to be placed
                return true;
              }
              if (!values.has(new_data.value)) {
                // if the value is never seen before, neither already in the database nor in the data batch,
                //  it passes the check
                return false;
              }
              // having the same value already in the database might be or not be an error, since the user can
              //  be just modifying an existing item without changing its entry that must be unique
              // we check if the runtime_id is specified and the data item currently in the database, which is
              //  not yet modified, do share the same value
              if (runtime_id === undefined) {
                // creating a new item with duplicated value, this is an error
                return true;
              }
              const existing_data = data.value.get(runtime_id);
              if (existing_data === undefined) {
                // no, the specified runtime_id does not exist in current database
                // FIXME: further more, should specifying unknown runtime_id be rejected explicitly?
                return true;
              }
              const entry_data = existing_data.entries!.get(entry_name);
              if (entry_data === undefined) {
                // no, existing data does not have this entry specified
                //  the specified new data item is having problem with some other item in the database
                return true;
              }
              // currently, we support only string as entry type that can be requested unique
              //  the new data item fails if it mismatches the value existing
              return (entry_data as StringEntryData).value !== new_data.value;
            })()
          ) {
            const error: InvalidDuplicatedValue = {
              type: ItemInvalidType.duplicated_value,
              key: entry_name,
              value: new_data.value,
            };
            failures.push({ index, reason: error });
            continue;
          }
          new_unique_values.add(new_data.value);
        }
        pending_unique_values.set(entry_name, new_unique_values);
      }

      if (failures.length > 0) {
        // early terminate if some error has been detected
        break;
      }

      // to minimize modification to database, we compare the data and only mark the database as modified when
      //  a modification was actually made
      const modified_items = items
        .map(({ runtime_id, source, images }) => ({
          runtime_id: runtime_id ?? acquire_new_runtime_id(),
          source,
          images,
        }))
        .filter(
          ({ runtime_id, source, images }) =>
            compare_data_item(data.value.get(runtime_id), source) ||
            (has_image.value && images !== undefined),
        );

      // up to this time point, all data are validated but failures are still possible
      //  one of the situations could be that network error may occur when trying to fetch a thumbnail pool
      //  we perform these operations first so that should any failure occur, the procedure terminates
      //  properly without any visible state modified.
      if (has_image.value) {
        for (const [index, { source, images }] of modified_items.entries()) {
          // skip if the image is not updated
          if (images === undefined) {
            continue;
          }
          // skip if a new thumbnail pool will be allocated since allocating new pools is not supposed to fail
          if (source.image === undefined) {
            continue;
          }
          const fetch_result = await get_thumbnail_pool(source.image.name);
          if (fetch_result.is_err()) {
            const error: InvalidImageFetch = {
              type: ItemInvalidType.image_fetch,
              description: String(fetch_result.unwrap_error()),
            };
            failures.push({ index, reason: error });
          }
        }
      }

      if (failures.length > 0) {
        // early terminate if some error has been detected
        break;
      }

      // now, no following operation is supposed to fail
      if (modified_items.length > 0) {
        internal_states.modification_manager.modify_core_database();
      }
      // we may now apply modifications to tags
      internal_states.tag_patch?.confirm();
      // add / modify images of items if requested
      if (has_image.value) {
        for (const { runtime_id, source, images } of modified_items) {
          if (images === undefined) {
            continue;
          }
          const slot = await update_item_thumbnail(images.thumbnail, source.image);
          source.image = slot.unwrap();
          place_image_cache(runtime_id, { image: images.image_url, thumbnail: images.thumbnail_url });
          // we have (re)placed the full image for this item, update list of modified image
          internal_states.modification_manager.modify_images([runtime_id]);
        }
      }
      // merge the newly collected unique values
      for (const [entry_name, new_unique_values] of pending_unique_values.entries()) {
        internal_states.unique_entries.set(
          entry_name,
          new_unique_values.union(internal_states.unique_entries.get(entry_name)!),
        );
      }
      // finally, place the items themselves
      for (const { runtime_id, source } of modified_items) {
        data.value.set(runtime_id, source);
      }
      // eslint-disable-next-line no-constant-condition
    } while (false); // do-while false here to allow flexible jumping-outs
    // Since this is a big block of code with multiple points at which we might decide to terminate its
    //  execution but always with the same post-processing step. This is a common case to use do-while-false
    //  to group statements together
    return failures;
  }

  // get parsed and easily usable information about image pool allocation
  function query_image_pool_allocation(): { name: string; allocations: boolean[] }[] {
    return [...image_pools.entries()].map(([name, bitmap]) => {
      const allocations: boolean[] = [];
      for (const byte_man of bitmap) {
        for (let i = 0; i < 8; i++) {
          allocations.push((byte_man & (1 << i)) !== 0);
        }
      }
      return {
        name,
        allocations,
      };
    });
  }

  // if the database is modified
  //  this value will be true if the main data file or any of the image pools is modified
  const database_modified = computed(() => {
    if (typeof internal_states.modification_manager.notifier.value !== "number") {
      return false;
    }
    return internal_states.modification_manager.is_modified();
  });
  // if the database is modified and not saved
  const database_modified_unsaved = computed(() => {
    if (typeof internal_states.modification_manager.notifier.value !== "number") {
      return false;
    }
    return internal_states.modification_manager.is_modification_unsaved();
  });

  // procedures saving the database into files

  // number of encrypts to be done
  //  this is used to communicate with the maintenance page, specifying the reason why the data key must be
  //  regenerated even if current counter does not yet reached the limitation
  const encrypts_to_be_done: Ref<number> = ref(0);

  // internal implementing of saving database
  //  take an array about extra image batches to save
  //  note that since we will maintain a counter for times the key has been used to encrypt,
  //   main data file will always have to be modified and saved
  async function save_internal(images: string[], pack_name: string): Promise<Result<void>> {
    // how many messages will the data key be used to encrypt doing this save?
    //  there will be one message for each image specified in images, and on extra message for the main data
    const messages_to_encrypt = images.length + 1;
    // check if the encrypting quota of data key will be exceeded
    if (database_.value!.protection.encrypted_counter + messages_to_encrypt > EncryptMessageLimit) {
      // it will, so we redirect the user to regenerate a data key
      encrypts_to_be_done.value = messages_to_encrypt;
      router.push("/Maintenance");
      return Result.ok(undefined);
    }
    // select data key to encrypt data
    //  use the new data key if one is regenerated
    const encryption_key = internal_states.new_data_key ?? database_.value!.runtime.protection.key;
    // load, encrypt and store all images listed in the parameter
    const { add_from_string, add_from_blob, finalize } = make_database_pack(
      database_.value!.configurations.global.name,
    );
    const results = await attempts_to(
      images.map(image_name => async (): Promise<Result<void>> => {
        // the name can either refers to a thumbnail pool or to a full image, we need to check this
        if (image_pools.has(image_name)) {
          // it must be a thumbnail pool if the name can be found associated with an allocation bitmap
          const pool = await get_thumbnail_pool(image_name);
          if (pool.is_err()) {
            return pool.erase_type();
          }
          add_from_blob(
            `${image_name}${ThumbnailImageFormat.extension}`,
            await encrypt_image(
              await encode_image(pool.unwrap(), ThumbnailImageFormat),
              ThumbnailImageFormat,
              encryption_key,
            ),
          );
          return Result.ok(undefined);
        } else {
          // otherwise, it must be a full image
          const image_url = await get_image(image_name);
          if (image_url.is_err()) {
            return image_url.erase_type();
          }
          const image = await (await fetch(image_url.unwrap())).blob();
          add_from_blob(
            `${image_name}${ImageImageFormat.extension}`,
            await encrypt_image(image, ImageImageFormat, encryption_key),
          );
          return Result.ok(undefined);
        }
      }),
    );
    // check if all image are loaded successfully
    const [load_results, failed_loads] = dual_way_filter(results, result => result.succeed);
    if (failed_loads.length > 0) {
      return Result.error(
        t("message.error.fallback_failed_to_fetch_all_images"),
        failed_loads.map(item => (item.succeed ? "" : String(item.reason))).join("\n"),
      );
    }
    const errors_from_results = load_results
      .map(item => {
        if (item.succeed) {
          if (item.result.is_err()) {
            return String(item.result.unwrap_error());
          }
          return null;
        } else {
          return null;
        }
      })
      .filter(item => item !== null);
    if (errors_from_results.length > 0) {
      return Result.error(t("message.error.failed_to_fetch_all_images"), errors_from_results.join("\n"));
    }

    // build new database, encrypt it and add to the package
    const new_database: Datasource = {
      runtime: {
        protection: database_.value!.runtime.protection,
      },
      protection: { encrypted_counter: database_.value!.protection.encrypted_counter + messages_to_encrypt },
      configurations: database_.value!.configurations,
      images: has_image.value
        ? { pools: Array.from(image_pools.entries(), ([name, bitmap]) => ({ name, bitmap })) }
        : undefined,
      tags: tags.value.size === 0 ? undefined : tags.value,
      data: data.value,
    };
    const encrypted_database = await encrypt_datasource(new_database, encryption_key);
    add_from_string("data.json", encrypted_database);
    const zip_file = await finalize();
    save_to_local(zip_file, pack_name);
    // we can now safely modify state of the local database
    internal_states.modification_manager.modify_core_database();
    database_.value!.protection.encrypted_counter += messages_to_encrypt;
    // mark current state as saved
    internal_states.modification_manager.save_state();
    return Result.ok(undefined);
  }

  // save only modified files
  async function save_delta(): Promise<Result<void>> {
    return save_internal([...internal_states.modification_manager.modified_images()], "database-delta.zip");
  }
  // save entire database
  async function save_all(): Promise<Result<void>> {
    if (has_image.value) {
      return save_internal([...image_pools.keys(), ...data.value.keys()], "database.zip");
    }
    return save_internal([], "database.zip");
  }

  // update data key of this database
  //  no modification is made to the database unless all operations in this function have succeed
  //  (but actually, we believe that this function does not include operations that might fail)
  //  if the value of data key is not modified, do not pass modified.key
  function update_data_key(modified: { encrypted_key: Uint8Array; nonce: Uint8Array; key?: CryptoKey }) {
    if (modified.key) {
      // the key is modified, we have to mark all images as modified. This way, as we will later update the
      //  data key used to encrypt the database, when modified images are written back, they will be
      //  re-encrypted with the new data key
      if (has_image.value) {
        // mark all images as modified
        internal_states.modification_manager.modify_images([...data.value.keys(), ...image_pools.keys()]);
      }

      // store the new key
      internal_states.new_data_key = modified.key;
      // since the data key is changed, we can now reset the encrypt counter
      database_.value!.protection.encrypted_counter = 0;
    }
    // the main data file is always modified
    internal_states.modification_manager.modify_core_database();
    // replace values
    database_.value!.runtime.protection.encrypted_key = modified.encrypted_key;
    database_.value!.runtime.protection.key_nonce = modified.nonce;
  }

  // close database, reset all internal states
  function reset() {
    internal_states.modification_manager.reset();
    internal_states.unique_entries.clear();
    internal_states.tag_patch?.cancel();
    internal_states.loaded_thumbnail_pools.clear();
    internal_states.thumbnails.clear();
    internal_states.images.clear();
    internal_states.new_data_key = undefined;
    data.value.clear();
    tags.value.clear();
    image_pools.clear();
    database_.value = undefined;
  }

  return {
    database_,
    data,
    tags,
    has_image,
    image_size,
    entries,
    database_modified,
    database_modified_unsaved,
    encrypts_to_be_done,
    build_runtime_database,
    get_cached_image,
    get_image,
    get_thumbnail,
    place_image_cache,
    acquire_new_runtime_id,
    prepare_tag_registration,
    place_item,
    query_image_pool_allocation,
    save_delta,
    save_all,
    update_data_key,
    reset,
  };
});
