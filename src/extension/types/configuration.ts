import type { EncryptedDatasource } from "@/types/datasource";
import type { RatingEntryData, StringEntryData, TagEntryData } from "@/types/datasource-entry";
import {
  get_key_from_password,
  load_datasource_phase1,
  load_datasource_phase2,
} from "@/procedures/crypto-readonly";
import { try_complete_url } from "@/procedures/utilities-pure";
import { Result } from "@/types/result";
import versions from "../versions.json";
import { Runner } from "./runner-interfaces";

export class InjectorDatabases {
  id: string;
  name: string;
  url: URL;
  key: Uint8Array;
  cached_database: string;
  update_time: Date;

  private constructor(
    id: string,
    name: string,
    url: URL,
    key: Uint8Array,
    cached_database: string,
    update_time: Date,
  ) {
    this.id = id;
    this.name = name;
    this.url = url;
    this.key = key;
    this.cached_database = cached_database;
    this.update_time = update_time;
  }

  // fetch the database referred by an URL and verify that it can be decrypted by the password given
  //  if fetch or decryption has failed, an error is thrown
  //  if everything was ok, return the (fixed) URL, the (encrypted and stringified) database and the raw key
  //   that may be used
  static async fetch_database(
    url: string | URL | null,
    credential: string | Uint8Array,
  ): Promise<Result<{ database: string; fixed_url: URL; key: Uint8Array }>> {
    const parsed_url = typeof url === "string" ? try_complete_url(url) : url;
    if (parsed_url === null) {
      return Result.error("URL is invalid", "The URL specified cannot be parsed");
    }
    if (!parsed_url.pathname.endsWith("/data.json")) {
      return Result.error(
        "URL is invalid",
        "The URL must end with '/data.json' since it refers to the main database file.",
      );
    }
    const raw_database = await (async (): Promise<Result<string>> => {
      try {
        const database_response = await fetch(parsed_url);
        return Result.ok(await database_response.text());
      } catch (error) {
        return Result.error(
          "Cannot fetch the database",
          `This is likely an network error, try again later?\nThe original error is ${error}`,
        );
      }
    })();
    const wrapped_encrypted_database = raw_database.map((raw): Result<EncryptedDatasource> => {
      try {
        return Result.ok(load_datasource_phase1(raw));
      } catch (error) {
        return Result.error(
          "Cannot parse the database",
          `This is likely caused by an incorrect URL which points to something that is not actually a database, or the database has been corrupted.\nOriginal error: ${error}`,
        );
      }
    });
    if (wrapped_encrypted_database.is_err()) {
      return wrapped_encrypted_database.erase_type();
    }
    const encrypted_database = wrapped_encrypted_database.unwrap();
    const raw_key =
      typeof credential === "string"
        ? (await get_key_from_password(credential, encrypted_database.protection.argon2)).raw_key
        : credential;
    try {
      await load_datasource_phase2(encrypted_database, raw_key, () => null);
      // we can unwrap here since raw_database has been mapped to wrapped_encrypted_database which has been
      //  checked. Execution of this function should have been terminated if wrapped_encrypted_database was
      //  in failed state.
      return Result.ok({ database: raw_database.unwrap(), fixed_url: parsed_url, key: raw_key });
    } catch (error) {
      return Result.error(
        "Cannot open the database",
        `This is likely caused by an incorrect password, or (less likely) a corrupted caused by some BUG.\nOriginal error: ${error}`,
      );
    }
  }

  static async build(
    name: string,
    url: string | URL | null,
    password: string,
  ): Promise<Result<InjectorDatabases>> {
    const fetch_result = await InjectorDatabases.fetch_database(url, password);
    return fetch_result.map(
      ({ database, fixed_url, key }) =>
        new InjectorDatabases(crypto.randomUUID(), name, fixed_url, key, database, new Date()),
    );
  }

  // fromJSON is used to load data from the storage or exported data, which should always be valid
  static fromJSON(json: string): InjectorDatabases {
    const data = JSON.parse(json);
    return new InjectorDatabases(
      data.id,
      data.name,
      new URL(data.url),
      Uint8Array.fromBase64(data.key),
      data.cached_database,
      new Date(data.update_time),
    );
  }

  is_same(other: InjectorDatabases): boolean {
    // only the content (cached database) matters
    return this.cached_database === other.cached_database;
  }

  // decrypt the cached database and transform it into easily parsable format for user scripts
  async get_content() {
    const raw_database = await load_datasource_phase2(
      load_datasource_phase1(this.cached_database),
      this.key,
      () => null,
    );
    return [...raw_database.data.values()].map((item): any => {
      if (item.entries === undefined) {
        // currently, databases whose items have no entries configured is not supported
        return [];
      }
      return Object.fromEntries(
        raw_database.configurations.entry.entries
          .map((entry_config): [string, any] | null => {
            const data = item.entries?.get(entry_config.name);
            if (data === undefined) {
              return null;
            }
            const value = (() => {
              if (entry_config.type === "string") {
                return (data as StringEntryData).value;
              }
              if (entry_config.type === "rating") {
                const rating = data as RatingEntryData;
                return { score: rating.score, comment: rating.comment };
              }
              if (entry_config.type === "tag") {
                const tag_list = raw_database.tags!.get(entry_config.name)!;
                return (data as TagEntryData).tags.map(index => tag_list[index]!);
              }
            })();
            return [entry_config.name, value];
          })
          .filter(item => item !== null),
      );
    });
  }

  toJSON(): string {
    return JSON.stringify({
      id: this.id,
      name: this.name,
      url: this.url.href,
      key: this.key.toBase64(),
      cached_database: this.cached_database,
      update_time: this.update_time.valueOf(),
    });
  }

  // update the database
  // if only name is specified in modified, just update the name of the database
  // otherwise, refetch the database and verify it, then update all modified attributes accordingly
  // return if the database has been changed
  async update(modified: { name?: string; url?: string; password?: string }): Promise<Result<boolean>> {
    let changed = false;
    if (modified.url || modified.password || !modified.name) {
      const fetched_data = await InjectorDatabases.fetch_database(
        modified.url ?? this.url,
        modified.password ?? this.key,
      );
      if (fetched_data.is_err()) {
        return fetched_data.erase_type();
      }
      const { database, fixed_url, key } = fetched_data.unwrap();
      if (this.cached_database !== database) {
        changed = true;
      }
      this.cached_database = database;
      this.url = fixed_url;
      this.key = key;
      this.update_time = new Date();
    }
    if (modified.name) {
      this.name = modified.name;
    }
    return Result.ok(changed);
  }
}

export class InjectorScripts {
  id: string;
  name: string;
  mode: "classic" | "module";
  url?: URL;
  content: string;
  update_time: Date;

  private constructor(
    id: string,
    name: string,
    mode: "classic" | "module",
    url: URL | undefined,
    content: string,
    update_time: Date,
  ) {
    this.id = id;
    this.name = name;
    this.mode = mode;
    this.url = url;
    this.content = content;
    this.update_time = update_time;
  }

  static fromJSON(json: string): InjectorScripts {
    const data = JSON.parse(json);
    return new InjectorScripts(
      data.id,
      data.name,
      data.mode,
      data.url === undefined ? undefined : new URL(data.url),
      data.content,
      new Date(data.update_time),
    );
  }

  static async build(
    name: string,
    type: "local" | "remote",
    mode: "classic" | "module",
    source: string,
  ): Promise<Result<InjectorScripts>> {
    const fetched_content = await InjectorScripts.get_content(type, source);
    const check_result = (
      await fetched_content
        .map(async ({ content }) => await InjectorScripts.check(mode, content))
        .shift_promise()
    ).flatten();
    return check_result.map(() => {
      return fetched_content.map(
        ({ content, url }) => new InjectorScripts(crypto.randomUUID(), name, mode, url, content, new Date()),
      );
    });
  }

  private static async get_content(
    type: "local" | "remote",
    source: string,
  ): Promise<Result<{ content: string; url?: URL }>> {
    if (type === "local") {
      return Result.ok({ content: source });
    }
    const url = try_complete_url(source);
    if (url === null) {
      return Result.error("URL is invalid", `URL ${source} cannot be parsed`);
    }
    try {
      const response = await fetch(url);
      return Result.ok({ content: await response.text(), url });
    } catch (error) {
      return Result.error(
        "Failed to fetch the script",
        `The following error is triggered. This is most likely caused by network failures.\n${error}`,
      );
    }
  }

  private static async _get_instance(mode: "classic" | "module", content: string): Promise<Result<any>> {
    try {
      if (mode === "classic") {
        return Result.ok(eval(content));
      }
      const encoded_script = new TextEncoder().encode(content);
      const url = URL.createObjectURL(new Blob([encoded_script], { type: "text/javascript" }));
      const module = await import(url);
      URL.revokeObjectURL(url);
      return Result.ok(module);
    } catch (error) {
      return Result.error(
        "Failed to compile the script",
        `This is likely caused by errors in your script. Here is the original error: ${error}`,
      );
    }
  }

  private static async check(mode: "classic" | "module", content: string): Promise<Result<void>> {
    const instance = await InjectorScripts._get_instance(mode, content);
    return instance.map(
      (script): Result<void> =>
        typeof script.run === "function"
          ? Result.ok(undefined)
          : Result.error(
              "The script is invalid",
              "The script must return an object with a function-like member called run or export a function named run. Please recheck the interface declaration.",
            ),
    );
  }

  is_same(other: InjectorScripts): boolean {
    // only mode and content matters: mode decides how to execute the script and content is the script itself
    return this.mode === other.mode && this.content === other.content;
  }

  async get_instance() {
    return InjectorScripts._get_instance(this.mode, this.content);
  }

  toJSON(): string {
    return JSON.stringify({
      id: this.id,
      name: this.name,
      mode: this.mode,
      url: this.url?.href,
      content: this.content,
      update_time: this.update_time.valueOf(),
    });
  }

  async update(modified: {
    name?: string;
    mode?: "classic" | "module";
    type?: "local" | "remote";
    source?: string;
  }): Promise<Result<boolean>> {
    if (modified.name && !modified.mode && !modified.type && !modified.source) {
      this.name = modified.name;
      return Result.ok(false);
    }
    const mode = modified.mode ?? this.mode;
    const type = modified.type ?? (this.url === undefined ? "local" : "remote");
    const fetch_result = await InjectorScripts.get_content(
      type,
      modified.source ?? this.url?.href ?? this.content,
    );
    const check_result = (
      await fetch_result.map(({ content }) => InjectorScripts.check(mode, content)).shift_promise()
    ).flatten();
    return check_result.map(() => {
      return fetch_result.map(({ content, url }) => {
        const changed = this.mode != mode || this.content != content;
        const name = modified.name ?? this.name;
        this.name = name;
        this.mode = mode;
        this.url = url;
        this.content = content;
        this.update_time = new Date();
        return changed;
      });
    });
  }
}

export class InjectorHosts {
  id: string;
  name: string;
  host: string;
  database_id: string;
  script_id: string;

  private constructor(id: string, name: string, host: string, database_id: string, script_id: string) {
    this.id = id;
    this.name = name;
    this.host = host;
    this.database_id = database_id;
    this.script_id = script_id;
  }

  static build(name: string, host: string, database_id: string, script_id: string): Result<InjectorHosts> {
    return InjectorHosts.check(host).map(
      () => new InjectorHosts(crypto.randomUUID(), name, host, database_id, script_id),
    );
  }

  static fromJSON(json: string): InjectorHosts {
    const data = JSON.parse(json);
    // introduced since hosts have no id stored in format_version === 0
    const id = data.id ?? crypto.randomUUID();
    return new InjectorHosts(id, data.name, data.host, data.database_id, data.script_id);
  }

  private static check(host: string): Result<void> {
    try {
      new RegExp(host);
      return Result.ok<void>(undefined);
    } catch (error) {
      return Result.error(
        "Failed to compile the matcher",
        `The matcher must be a valid regular expression but the supplied one (quoted in <[ and ]>) <[${host}]> is not.\nThis is the original error: ${error}`,
      );
    }
  }

  is_same(other: InjectorHosts): boolean {
    return (
      this.host === other.host && this.database_id === other.database_id && this.script_id === other.script_id
    );
  }

  update(modified: { name?: string; host?: string; database_id?: string; script_id?: string }): Result<{
    matcher: boolean;
    database: boolean;
    script: boolean;
  }> {
    const result = { matcher: false, database: false, script: false };
    if (modified.host && modified.host !== this.host) {
      const check_result = InjectorHosts.check(modified.host);
      if (check_result.is_err()) {
        return check_result.erase_type();
      }
      this.host = modified.host;
      result.matcher = true;
    }
    if (modified.name) {
      this.name = modified.name;
    }
    if (modified.database_id && modified.database_id !== this.database_id) {
      this.database_id = modified.database_id;
      result.database = true;
    }
    if (modified.script_id && modified.script_id !== this.script_id) {
      this.script_id = modified.script_id;
      result.script = true;
    }
    return Result.ok(result);
  }

  toJSON(): string {
    return JSON.stringify({
      id: this.id,
      name: this.name,
      host: this.host,
      database_id: this.database_id,
      script_id: this.script_id,
    });
  }
}

type UpdateRemoved = {
  removed: true;
};
type UpdateModified = {
  removed: false;
  host: InjectorHosts;
  modified: { matcher: boolean; database: boolean; script: boolean };
};
export type UpdateNotifyReceiver = (details: UpdateRemoved | UpdateModified) => void;
type preJSONObject = { version?: number; databases: string[]; scripts: string[]; hosts: string[] };

export class InjectorConfiguration {
  databases: InjectorDatabases[] = [];
  scripts: InjectorScripts[] = [];
  hosts: InjectorHosts[] = [];
  #lock_id = "";
  #watchers: Map<string, Map<string, UpdateNotifyReceiver>> = new Map();

  // real constructor that load configurations from the storage provided by the runner interface
  static async from_store(): Promise<Result<InjectorConfiguration>> {
    const configuration = new InjectorConfiguration();
    const data = await Runner.get_value<preJSONObject>("injector_config");
    if (data !== undefined) {
      return configuration.replace_with_preJSON_object(data, false).map(() => configuration);
    }
    return Result.ok(configuration);
  }

  private static parse_preJSON_object(source: preJSONObject): Result<{
    version: number;
    databases: InjectorDatabases[];
    scripts: InjectorScripts[];
    hosts: InjectorHosts[];
  }> {
    if ((source.version ?? 0) > versions.format_version) {
      return Result.error(
        "Cannot load configuration in unknown higher version",
        "Seems that you have updated the injector but not yet reloaded this page.\nThe update can only be applied after a reload.\nWe will not try to load configuration that has a newer format since we might mess things up.\nPlease reload and try again.",
      );
    }
    return Result.ok({
      version: source.version ?? 0,
      databases: source.databases.map(database => InjectorDatabases.fromJSON(database)),
      scripts: source.scripts.map(script => InjectorScripts.fromJSON(script)),
      hosts: source.hosts.map(host => InjectorHosts.fromJSON(host)),
    });
  }

  get_interface_version(): number {
    return versions.interface_version;
  }

  register_host_watcher(id: string, receiver: UpdateNotifyReceiver): { detach: () => void } | null {
    if (!this.hosts.some(host => host.id === id)) {
      return null;
    }
    const watchers = (() => {
      const existing = this.#watchers.get(id);
      if (existing !== undefined) {
        return existing;
      }
      const new_map = new Map<string, UpdateNotifyReceiver>();
      this.#watchers.set(id, new_map);
      return new_map;
    })();
    const handle = crypto.randomUUID();
    watchers.set(handle, receiver);
    return {
      detach: () => {
        const watchers = this.#watchers.get(id);
        if (watchers === undefined) {
          return;
        }
        watchers.delete(handle);
        if (watchers.size === 0) {
          this.#watchers.delete(id);
        }
      },
    };
  }

  replace_with_JSON(source: string, skip_store = false) {
    return this.replace_with_preJSON_object(JSON.parse(source), skip_store);
  }

  toJSON() {
    return JSON.stringify(this.to_preJSON_object());
  }

  async to_store() {
    await Runner.set_value("injector_config", this.to_preJSON_object());
  }

  // acquire the database lock
  //  Only InjectorConfiguration that holds the lock is allowed to make modifications to these configurations:
  //   to be specific, to call new_*, remove_*, or to call update_* with any key specified in modified
  //   which means any instances without the lock may only perform refetch
  //  Note: since the runner does not provide APIs like set_if_not_exist, it is impossible to implement a
  //   locking mechanism that is fully secure: this implementation can fail if two instances try to acquire
  //   the lock in a narrow time window, or / and one of which gets blocked unexpectedly
  // The lock is only acquired by the configuration page, which should call this function with a callback.
  //  The callback named on_change will be called when the configuration in the store is modified
  //  remotely, which can only be triggered by a refetch (reload) request. Therefore, the only thing might be
  //  modified in such case is the content of cached database or cached remote script. This callback will be
  //  supplied with modified scripts and databases: their id and their new updated time.
  async lock(
    on_change: (
      modified: Result<{
        databases: { id: string; time: Date }[];
        scripts: { id: string; time: Date }[];
      }>,
    ) => void,
  ): Promise<Result<void>> {
    if (this.#lock_id.length > 0) {
      return Result.ok(undefined);
    }
    const id = crypto.randomUUID();
    if ((await Runner.get_value<string>("injector_lock")) === undefined) {
      await Runner.set_value("injector_lock", id);
      const current_holder = (await Runner.get_value<string>("injector_lock"))!;
      if (current_holder === id) {
        this.#lock_id = id;
        // attach listener and arrange callback
        Runner.add_listener<preJSONObject>("injector_config", (_1, _2, value, remote) => {
          if (!remote) {
            return;
          }
          const modified_databases: { id: string; time: Date }[] = [];
          const modified_scripts: { id: string; time: Date }[] = [];
          on_change(
            InjectorConfiguration.parse_preJSON_object(value).map(({ databases, scripts }) => {
              for (const [index, new_value] of databases.entries()) {
                const old_database = this.databases[index]!;
                if (old_database.update_time !== new_value.update_time) {
                  old_database.update_time = new_value.update_time;
                  old_database.cached_database = new_value.cached_database;
                  modified_databases.push({ id: new_value.id, time: new_value.update_time });
                }
              }
              for (const [index, new_value] of scripts.entries()) {
                const old_script = this.scripts[index]!;
                if (old_script.update_time !== new_value.update_time) {
                  old_script.update_time = new_value.update_time;
                  old_script.content = new_value.content;
                  modified_scripts.push({ id: new_value.id, time: new_value.update_time });
                }
              }
              return { databases: modified_databases, scripts: modified_scripts };
            }),
          );
        });
        return Result.ok(undefined);
      }
    }
    return Result.error("Failed to acquire the lock");
  }

  async unlock() {
    if (this.#lock_id.length === 0) {
      return;
    }
    const current_holder = await Runner.get_value<string>("injector_lock");
    if (current_holder === this.#lock_id) {
      await Runner.delete_value("injector_lock");
    }
    this.#lock_id = "";
  }

  // release the lock forcibly: use with caution
  async doom_the_lock() {
    return Runner.delete_value("injector_lock");
  }

  // listen for store modifications and update configurations automatically
  //  this should only be called on instances without the lock
  //  a callback function should be supplied which will be called each time autoupdate is triggered
  setup_autoupdate(on_update: (result: Result<void>) => void) {
    if (this.#lock_id.length > 0) {
      return;
    }
    Runner.add_listener<preJSONObject>("injector_config", (_1, _2, value, remote) => {
      if (remote) {
        on_update(this.replace_with_preJSON_object(value, true));
      }
    });
  }

  async new_database(name: string, url: string, password: string): Promise<Result<InjectorDatabases>> {
    const result = await this.check_permission()
      .map(async (): Promise<Result<InjectorDatabases>> => {
        const fixed_url = try_complete_url(url);
        // check if we have duplicated entries
        if (this.databases.some(database => database.name === name || database.url === fixed_url)) {
          return Result.error("Duplicated database", "Cannot create database with existing name or URL.");
        }
        const database = await InjectorDatabases.build(name, fixed_url, password);
        if (database.is_ok()) {
          this.databases.push(database.unwrap());
          await this.to_store();
        }
        return database;
      })
      .shift_promise();
    return result.flatten();
  }

  async update_database(
    id: string,
    modified: { name?: string; url?: string; password?: string },
  ): Promise<Result<InjectorDatabases>> {
    if (Object.keys(modified).length > 0) {
      const check_result = this.check_permission();
      if (check_result.is_err()) {
        return check_result.erase_type();
      }
    }

    const target = this.databases.find(database => database.id === id);
    if (target === undefined) {
      return Result.error(`Cannot find database with id ${id}. This is likely a BUG.`);
    }

    const fixed_url = modified.url ? try_complete_url(modified.url) : undefined;
    if (
      this.databases.some(database => {
        if (modified.name && database.name === modified.name) {
          return true;
        }
        if (fixed_url && database.url === fixed_url) {
          return true;
        }
        return false;
      })
    ) {
      return Result.error(
        "This modification will result in a database with existing name or url, please check.",
      );
    }

    const changed = await target.update(modified);
    await changed
      .map(async changed => {
        await this.to_store();
        if (changed) {
          for (const host of this.hosts.filter(host => host.database_id === target.id)) {
            const watchers = this.#watchers.get(host.id);
            if (watchers === undefined) {
              continue;
            }
            const payload: UpdateModified = {
              removed: false,
              host,
              modified: { matcher: false, database: true, script: false },
            };
            for (const watcher of watchers.values()) {
              watcher(payload);
            }
          }
        }
      })
      .shift_promise();
    return changed.map(() => target);
  }

  async remove_database(id: string): Promise<Result<void>> {
    const check_result = this.check_permission();
    if (check_result.is_err()) {
      return check_result.erase_type();
    }
    // check if this database is referred
    const referred_hosts = this.hosts.filter(host => host.database_id === id);
    if (referred_hosts.length > 0) {
      return Result.error(
        "Cannot remove database in use",
        `It is referred by the following hosts: ${[referred_hosts.map(host => host.name)].join(", ")}`,
      );
    }
    const target = this.databases.findIndex(database => database.id === id);
    if (target === -1) {
      return Result.error(`Cannot find database with id ${id}. This is likely a BUG.`);
    }
    this.databases.splice(target, 1);
    await this.to_store();
    return Result.ok(undefined);
  }

  async new_script(
    name: string,
    type: "local" | "remote",
    mode: "classic" | "module",
    source: string,
  ): Promise<Result<InjectorScripts>> {
    const check_result = this.check_permission();
    if (check_result.is_err()) {
      return check_result.erase_type();
    }
    if (this.scripts.some(script => script.name === name)) {
      return Result.error(`Cannot create script with duplicated name (${name})`);
    }
    const script = await InjectorScripts.build(name, type, mode, source);
    if (script.is_ok()) {
      this.scripts.push(script.unwrap());
      await this.to_store();
    }
    return script;
  }

  async update_script(
    id: string,
    modified: {
      name?: string;
      mode?: "classic" | "module";
      type?: "local" | "remote";
      source?: string;
    },
  ): Promise<Result<InjectorScripts>> {
    if (Object.keys(modified).length > 0) {
      const check_result = this.check_permission();
      if (check_result.is_err()) {
        return check_result.erase_type();
      }
    }
    if (modified.name && this.scripts.some(script => script.name === modified.name)) {
      return Result.error(`Cannot modify scripts to use existing names (${modified.name})`);
    }
    const target = this.scripts.find(script => script.id === id);
    if (target === undefined) {
      return Result.error(`Cannot find script with id ${id}. This is likely a BUG.`);
    }
    const changed = await target.update(modified);
    await this.to_store();
    if (changed.is_ok_and(value => value)) {
      for (const host of this.hosts.filter(host => host.script_id === target.id)) {
        const watchers = this.#watchers.get(host.id);
        if (watchers === undefined) {
          continue;
        }
        const payload: UpdateModified = {
          removed: false,
          host,
          modified: { matcher: false, database: false, script: true },
        };
        for (const watcher of watchers.values()) {
          watcher(payload);
        }
      }
    }
    return changed.map(() => target);
  }

  async remove_script(id: string): Promise<Result<void>> {
    const check_result = this.check_permission();
    if (check_result.is_err()) {
      return check_result.erase_type();
    }
    // check if this script is referred
    const referred_hosts = this.hosts.filter(host => host.script_id === id);
    if (referred_hosts.length > 0) {
      return Result.error(
        "Cannot remove script in use",
        `It is referred by the following hosts: ${[referred_hosts.map(host => host.name)].join(", ")}`,
      );
    }
    const target = this.scripts.findIndex(script => script.id === id);
    if (target === -1) {
      return Result.error(`Cannot find script with id ${id}. This is likely a BUG.`);
    }
    this.scripts.splice(target, 1);
    await this.to_store();
    return Result.ok(undefined);
  }

  async new_host(
    name: string,
    matcher: string,
    database_id: string,
    script_id: string,
  ): Promise<Result<InjectorHosts>> {
    const check_result = this.check_permission();
    if (check_result.is_err()) {
      return check_result.erase_type();
    }
    const host = this.check_host(database_id, script_id, name).map(() =>
      InjectorHosts.build(name, matcher, database_id, script_id),
    );
    if (host.is_ok()) {
      this.hosts.push(host.unwrap());
      await this.to_store();
    }
    return host;
  }

  async update_host(
    id: string,
    modified: { name?: string; matcher?: string; database_id?: string; script_id?: string },
  ): Promise<Result<InjectorHosts>> {
    if (Object.keys(modified).length > 0) {
      const check_result = this.check_permission();
      if (check_result.is_err()) {
        return check_result.erase_type();
      }
    }
    const target = this.hosts.find(host => host.id === id);
    if (target === undefined) {
      return Result.error(`No host with id ${id}. This is likely a BUG.`);
    }
    const database_id = modified.database_id ?? target.database_id;
    const script_id = modified.script_id ?? target.script_id;
    const check_result = this.check_host(database_id, script_id, modified.name);
    if (check_result.is_err()) {
      return check_result.erase_type();
    }
    const changes = target.update(modified);
    if (changes.is_ok()) {
      await this.to_store();
    }
    if (changes.is_ok_and(({ matcher, database, script }) => matcher || database || script)) {
      const payload: UpdateModified = {
        removed: false,
        host: target,
        modified: changes.unwrap(),
      };
      for (const watcher of this.#watchers.get(id)?.values() ?? []) {
        watcher(payload);
      }
    }
    return changes.map(() => target);
  }

  async remove_host(id: string): Promise<Result<void>> {
    const check_result = this.check_permission();
    if (check_result.is_err()) {
      return check_result.erase_type();
    }
    const target = this.hosts.findIndex(host => host.id === id);
    if (target === -1) {
      return Result.error(`No host with id ${id}. This is likely a BUG.`);
    }
    this.hosts.splice(target, 1);
    await this.to_store();
    const watchers = this.#watchers.get(id);
    if (watchers !== undefined) {
      for (const watcher of watchers.values()) {
        watcher({ removed: true });
      }
      this.#watchers.delete(id);
    }
    return Result.ok(undefined);
  }

  get_components(host: InjectorHosts): { database: InjectorDatabases; script: InjectorScripts } {
    return {
      database: this.databases.find(database => database.id === host.database_id)!,
      script: this.scripts.find(scripts => scripts.id === host.script_id)!,
    };
  }

  private replace_with_preJSON_object(source: preJSONObject, skip_store = false): Result<void> {
    const parse_result = InjectorConfiguration.parse_preJSON_object(source);
    if (parse_result.is_err()) {
      return parse_result.erase_type();
    }
    const {
      version,
      databases: new_databases,
      scripts: new_scripts,
      hosts: new_hosts,
    } = parse_result.unwrap();

    // a database / script cannot be removed before all references to it have been removed
    //  therefore, we can simply ignore deleted database / script
    const modified_databases = new Set(
      new_databases
        .filter(new_database => {
          const old_database = this.databases.find(database => database.id === new_database.id);
          if (old_database === undefined) {
            return false;
          }
          return !new_database.is_same(old_database);
        })
        .map(database => database.id),
    );
    const modified_scripts = new Set(
      new_scripts
        .filter(new_script => {
          const old_script = this.scripts.find(script => script.id === new_script.id);
          if (old_script === undefined) {
            return false;
          }
          return !new_script.is_same(old_script);
        })
        .map(script => script.id),
    );

    const removed_hosts = this.hosts.filter(
      old_host => !new_hosts.some(new_host => new_host.id === old_host.id),
    );
    const modified_hosts = new_hosts
      .map(new_host => {
        const old_host = this.hosts.find(host => host.id === new_host.id);
        if (old_host === undefined) {
          return { host: new_host, modified: undefined };
        }
        return {
          host: new_host,
          modified: {
            matcher: new_host.host !== old_host.host,
            database:
              new_host.database_id !== old_host.database_id || modified_databases.has(new_host.database_id),
            script: new_host.script_id !== old_host.script_id || modified_scripts.has(new_host.script_id),
          },
        };
      })
      .filter(
        ({ modified }) =>
          modified !== undefined && (modified.matcher || modified.database || modified.script),
      );

    // update configuration
    this.databases = new_databases;
    this.scripts = new_scripts;
    this.hosts = new_hosts;
    // we might find ourselves loading configurations stored with lower format version
    //  it is supposed that the configuration will be converted into the latest format silently
    //  therefore, we should store back even we have just loaded from the store in such cases
    if (version < versions.format_version || !skip_store) {
      this.to_store();
    }

    // send notifications
    for (const host of removed_hosts) {
      const watchers = this.#watchers.get(host.id);
      if (watchers === undefined) {
        continue;
      }
      for (const [_, watcher] of watchers) {
        watcher({ removed: true });
      }
      this.#watchers.delete(host.id);
    }
    for (const { host, modified } of modified_hosts) {
      const watchers = this.#watchers.get(host.id);
      if (watchers === undefined) {
        continue;
      }
      const payload: UpdateModified = {
        removed: false,
        host,
        modified: modified!,
      };
      for (const [_, watcher] of watchers) {
        watcher(payload);
      }
    }

    // we should let the user know
    if (version < versions.format_version) {
      alert(
        "It looks like the injector was updated and is loading configurations created by an older version. The conversion is performed automatically, but you should reload ALL pages that use the injector (including this one) to ensure every instance is updated. Running multiple instances with different versions at the same time may cause them to interfere with each other.",
      );
    }
    return Result.ok(undefined);
  }

  private check_permission(): Result<void> {
    if (this.#lock_id.length === 0) {
      return Result.error(
        "Permission denied",
        "The lock must be acquired before altering the configurations",
      );
    }
    return Result.ok(undefined);
  }

  private check_host(database_id: string, script_id: string, name?: string): Result<void> {
    const errors: string[] = [];
    if (this.hosts.some(host => host.name === name)) {
      errors.push(`There is already a host with the same name (${name}).`);
    }
    if (!this.databases.some(database => database.id === database_id)) {
      errors.push(`No database with specified id ${database_id}. This is likely a BUG.`);
    }
    if (!this.scripts.some(script => script.id === script_id)) {
      errors.push(`No script with specified id ${script_id}. This is likely a BUG.`);
    }
    if (errors.length > 0) {
      return Result.error("The host failed the check", errors.join("\n"));
    }
    return Result.ok(undefined);
  }

  private to_preJSON_object(): preJSONObject {
    return {
      version: versions.format_version,
      databases: this.databases.map(database => database.toJSON()),
      scripts: this.scripts.map(script => script.toJSON()),
      hosts: this.hosts.map(host => host.toJSON()),
    };
  }
}
