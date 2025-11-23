import {
  get_key_from_password,
  load_datasource_phase1,
  load_datasource_phase2,
} from "@/procedures/crypto-readonly";
import { try_complete_url } from "@/procedures/utilities-pure";
import { Runner } from "./runner-interfaces";
import type { RatingEntryData, StringEntryData, TagEntryData } from "@/types/datasource-entry";

export class InjectorDatabases {
  id: string;
  name: string;
  url: URL;
  key: Uint8Array;
  cached_database: string;
  update_time: Date;

  is_same(other: InjectorDatabases): boolean {
    // only the content (cached database) matters
    return this.cached_database === other.cached_database;
  }

  private constructor(
    id: string,
    name: string,
    url: URL,
    key: Uint8Array,
    cached_database: string,
    update_time: Date
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
    credential: string | Uint8Array
  ): Promise<{ database: string; fixed_url: URL; key: Uint8Array }> {
    const parsed_url = typeof url === "string" ? try_complete_url(url) : url;
    if (parsed_url === null) {
      throw Error("URL is invalid");
    }
    if (!parsed_url.pathname.endsWith("/data.json")) {
      throw Error("Database URL is supposed to end with '/data.json'");
    }
    const database_response = await fetch(parsed_url);
    const raw_database = await database_response.text();
    const encrypted_database = (() => {
      try {
        return load_datasource_phase1(raw_database);
      } catch (error) {
        throw Error(
          `${String(
            error
          )}.\nThis is likely caused by an incorrect URL which points to something that is not actually a database, or the database has been corrupted.`
        );
      }
    })();
    const raw_key =
      typeof credential === "string"
        ? (await get_key_from_password(credential, encrypted_database.protection.argon2)).raw_key
        : credential;
    try {
      await load_datasource_phase2(encrypted_database, raw_key, () => null);
    } catch (error) {
      throw Error(
        `${String(
          error
        )}.\nThis is likely caused by an incorrect password, or (less likely) a corrupted caused by some BUG.`
      );
    }
    return { database: raw_database, fixed_url: parsed_url, key: raw_key };
  }
  static async build(name: string, url: string | URL | null, password: string): Promise<InjectorDatabases> {
    const { database, fixed_url, key } = await InjectorDatabases.fetch_database(url, password);
    return new InjectorDatabases(crypto.randomUUID(), name, fixed_url, key, database, new Date());
  }

  // decrypt the cached database and transform it into easily parsable format for user scripts
  async get_content() {
    const raw_database = await load_datasource_phase2(
      load_datasource_phase1(this.cached_database),
      this.key,
      () => null
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
                return (data as TagEntryData).tags.map((index) => tag_list[index]!);
              }
            })();
            return [entry_config.name, value];
          })
          .filter((item) => item !== null)
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
  static fromJSON(json: string): InjectorDatabases {
    const data = JSON.parse(json);
    return new InjectorDatabases(
      data.id,
      data.name,
      new URL(data.url),
      Uint8Array.fromBase64(data.key),
      data.cached_database,
      new Date(data.update_time)
    );
  }

  // update the database
  // if only name is specified in modified, just update the name of the database
  // otherwise, refetch the database and verify it, then update all modified attributes accordingly
  // return if the database has been changed
  async update(modified: { name?: string; url?: string; password?: string }): Promise<boolean> {
    let changed = false;
    if (modified.url || modified.password || !modified.name) {
      const { database, fixed_url, key } = await InjectorDatabases.fetch_database(
        modified.url ?? this.url,
        modified.password ?? this.key
      );
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
    return changed;
  }
}

export class InjectorScripts {
  id: string;
  name: string;
  mode: "classic" | "module";
  url?: URL;
  content: string;
  update_time: Date;

  is_same(other: InjectorScripts): boolean {
    // only mode and content matters: mode decides how to execute the script and content is the script itself
    return this.mode === other.mode && this.content === other.content;
  }

  private constructor(
    id: string,
    name: string,
    mode: "classic" | "module",
    url: URL | undefined,
    content: string,
    update_time: Date
  ) {
    this.id = id;
    this.name = name;
    this.mode = mode;
    this.url = url;
    this.content = content;
    this.update_time = update_time;
  }
  private static async get_content(
    type: "local" | "remote",
    source: string
  ): Promise<{ content: string; url?: URL }> {
    if (type === "local") {
      return { content: source };
    }
    const url = try_complete_url(source);
    if (url === null) {
      throw Error("URL is invalid");
    }
    const response = await fetch(url);
    return { content: await response.text(), url: url };
  }
  private static async _get_instance(mode: "classic" | "module", content: string) {
    return await (async () => {
      if (mode === "classic") {
        return eval(content);
      }
      const encoded_script = new TextEncoder().encode(content);
      const url = URL.createObjectURL(new Blob([encoded_script]));
      const module = await import(url);
      URL.revokeObjectURL(url);
      return module;
    })();
  }
  private static async check(mode: "classic" | "module", content: string) {
    const instance = await InjectorScripts._get_instance(mode, content);
    if (typeof instance.run !== "function") {
      throw Error("The script must export a function called run as its entrypoint.");
    }
  }
  async get_instance() {
    return InjectorScripts._get_instance(this.mode, this.content);
  }
  static async build(
    name: string,
    type: "local" | "remote",
    mode: "classic" | "module",
    source: string
  ): Promise<InjectorScripts> {
    const { content, url } = await InjectorScripts.get_content(type, source);
    await InjectorScripts.check(mode, content);
    const instance = new InjectorScripts(crypto.randomUUID(), name, mode, url, content, new Date());
    return instance;
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
  static fromJSON(json: string): InjectorScripts {
    const data = JSON.parse(json);
    return new InjectorScripts(
      data.id,
      data.name,
      data.mode,
      data.url === undefined ? undefined : new URL(data.url),
      data.content,
      new Date(data.update_time)
    );
  }
  async update(modified: {
    name?: string;
    mode?: "classic" | "module";
    type?: "local" | "remote";
    source?: string;
  }): Promise<boolean> {
    if (modified.name && !modified.mode && !modified.type && !modified.source) {
      this.name = modified.name;
      return false;
    }
    const mode = modified.mode ?? this.mode;
    const type = modified.type ?? (this.url === undefined ? "local" : "remote");
    const { content, url } = await InjectorScripts.get_content(
      type,
      modified.source ?? this.url?.href ?? this.content
    );
    await InjectorScripts.check(mode, content);
    const changed = this.mode != mode || this.content != content;
    const name = modified.name ?? this.name;
    this.name = name;
    this.mode = mode;
    this.url = url;
    this.content = content;
    this.update_time = new Date();
    return changed;
  }
}

export class InjectorHosts {
  name: string;
  host: string;
  database_id: string;
  script_id: string;

  is_same(other: InjectorHosts): boolean {
    return (
      this.name === other.name &&
      this.host === other.host &&
      this.database_id === other.database_id &&
      this.script_id === other.script_id
    );
  }

  constructor(name: string, host: string, database_id: string, script_id: string) {
    this.name = name;
    this.host = host;
    this.database_id = database_id;
    this.script_id = script_id;
  }
  toJSON(): string {
    return JSON.stringify({
      name: this.name,
      host: this.host,
      database_id: this.database_id,
      script_id: this.script_id,
    });
  }
  static fromJSON(json: string): InjectorHosts {
    const data = JSON.parse(json);
    return new InjectorHosts(data.name, data.host, data.database_id, data.script_id);
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
type preJSONObject = { databases: string[]; scripts: string[]; hosts: string[] };
export class InjectorConfiguration {
  databases: InjectorDatabases[] = [];
  scripts: InjectorScripts[] = [];
  hosts: InjectorHosts[] = [];
  #watchers: Map<string, UpdateNotifyReceiver[]> = new Map();

  register_host_watcher(name: string, receiver: UpdateNotifyReceiver): { detach: () => void } | null {
    if (this.hosts.find((host) => host.name === name) === undefined) {
      return null;
    }
    const watcher_array = (() => {
      const existing = this.#watchers.get(name);
      if (existing !== undefined) {
        return existing;
      }
      const new_array = new Array<UpdateNotifyReceiver>();
      this.#watchers.set(name, new_array);
      return new_array;
    })();
    const index = watcher_array.push(receiver) - 1;
    return {
      detach: () => {
        const watchers = this.#watchers.get(name);
        if (watchers === undefined) {
          return;
        }
        watchers.splice(index, 1);
        if (watchers.length === 0) {
          this.#watchers.delete(name);
        }
      },
    };
  }

  private static parse_preJSON_object(source: preJSONObject): {
    databases: InjectorDatabases[];
    scripts: InjectorScripts[];
    hosts: InjectorHosts[];
  } {
    return {
      databases: source.databases.map((database) => InjectorDatabases.fromJSON(database)),
      scripts: source.scripts.map((script) => InjectorScripts.fromJSON(script)),
      hosts: source.hosts.map((host) => InjectorHosts.fromJSON(host)),
    };
  }

  private replace_with_preJSON_object(source: preJSONObject, skip_store: boolean = false) {
    const {
      databases: new_databases,
      scripts: new_scripts,
      hosts: new_hosts,
    } = InjectorConfiguration.parse_preJSON_object(source);

    // a database / script cannot be removed before all references to it have been removed
    //  therefore, we can simply ignore deleted database / script
    const modified_databases = new Set(
      new_databases
        .filter((new_database) => {
          const old_database = this.databases.find((database) => database.id === new_database.id);
          if (old_database === undefined) {
            return false;
          }
          return !new_database.is_same(old_database);
        })
        .map((database) => database.id)
    );
    const modified_scripts = new Set(
      new_scripts
        .filter((new_script) => {
          const old_script = this.scripts.find((script) => script.id === new_script.id);
          if (old_script === undefined) {
            return false;
          }
          return !new_script.is_same(old_script);
        })
        .map((script) => script.id)
    );

    const removed_hosts = this.hosts.filter(
      (old_host) => new_hosts.find((new_host) => new_host.name === old_host.name) === undefined
    );
    const modified_hosts = new_hosts
      .map((new_host) => {
        const old_host = this.hosts.find((host) => host.name === new_host.name);
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
        ({ modified }) => modified !== undefined && (modified.matcher || modified.database || modified.script)
      );

    // update configuration
    this.databases = new_databases;
    this.scripts = new_scripts;
    this.hosts = new_hosts;
    if (!skip_store) {
      this.to_store();
    }

    // send notifications
    removed_hosts.forEach((host) => {
      const watchers = this.#watchers.get(host.name);
      if (watchers === undefined) {
        return;
      }
      watchers.forEach((watcher) => {
        watcher({ removed: true });
      });
      this.#watchers.delete(host.name);
    });
    modified_hosts.forEach(({ host, modified }) => {
      const watchers = this.#watchers.get(host.name);
      if (watchers === undefined) {
        return;
      }
      const payload: UpdateModified = {
        removed: false,
        host: host,
        modified: modified!,
      };
      watchers.forEach((watcher) => {
        watcher(payload);
      });
    });
  }
  replace_with_JSON(source: string, skip_store: boolean = false) {
    return this.replace_with_preJSON_object(JSON.parse(source), skip_store);
  }

  static async from_store() {
    const configuration = new InjectorConfiguration();
    const data = await Runner.get_value<preJSONObject>("injector_config");
    if (data !== undefined) {
      // we have just loaded the data from the store, there is no need to save back immediately
      configuration.replace_with_preJSON_object(data, true);
    }
    return configuration;
  }
  private to_preJSON_object() {
    return {
      databases: this.databases.map((database) => database.toJSON()),
      scripts: this.scripts.map((script) => script.toJSON()),
      hosts: this.hosts.map((host) => host.toJSON()),
    };
  }
  toJSON() {
    return JSON.stringify(this.to_preJSON_object());
  }
  async to_store() {
    await Runner.set_value("injector_config", this.to_preJSON_object());
  }

  #lock_id: string = "";
  // acquire the database lock
  //  Only InjectorConfiguration that holds the lock is allowed to make modifications to these configurations:
  //   to be specific, to call new_*, remove_*, or to call update_* with any key specified in modified
  //   which means any instances without the lock may only perform refetch
  //  Note: since the runner does not provide APIs like set_if_not_exist, it is impossible to implement a
  //   locking mechanism that is fully secure: this implementation can fail if two instances try to acquire
  //   the lock in a narrow time window, or / and one of which gets blocked unexpectedly
  // The lock is only acquired by the configuration page, which should call this function with a callback
  //  the callback will be called when the configuration in the store is modified remotely, which can only be
  //  triggered by a refresh (reload) request. Therefore, the only thing might be modified in such case is the
  //  content of cached database or cached remote script. The callback will be supplied with modified scripts
  //  and databases: their id and their new updated time
  async lock(
    callback: (modified: {
      databases: { id: string; time: Date }[];
      scripts: { id: string; time: Date }[];
    }) => void
  ) {
    if (this.#lock_id.length > 0) {
      return;
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
          const { databases, scripts } = InjectorConfiguration.parse_preJSON_object(value);
          const modified_databases: { id: string; time: Date }[] = [];
          const modified_scripts: { id: string; time: Date }[] = [];
          databases.forEach((new_value, index) => {
            const old_database = this.databases[index]!;
            if (old_database.update_time !== new_value.update_time) {
              old_database.update_time = new_value.update_time;
              old_database.cached_database = new_value.cached_database;
              modified_databases.push({ id: new_value.id, time: new_value.update_time });
            }
          });
          scripts.forEach((new_value, index) => {
            const old_script = this.scripts[index]!;
            if (old_script.update_time !== new_value.update_time) {
              old_script.update_time = new_value.update_time;
              old_script.content = new_value.content;
              modified_scripts.push({ id: new_value.id, time: new_value.update_time });
            }
          });
          callback({ databases: modified_databases, scripts: modified_scripts });
        });
        return;
      }
    }
    throw Error("Failed to acquire the lock");
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
  setup_autoupdate() {
    if (this.#lock_id.length !== 0) {
      return;
    }
    Runner.add_listener<preJSONObject>("injector_config", (_1, _2, value, remote) => {
      if (remote) {
        this.replace_with_preJSON_object(value, true);
      }
    });
  }

  private check_permission() {
    if (this.#lock_id.length === 0) {
      throw Error("The lock must be acquired before altering the configurations");
    }
  }

  async new_database(name: string, url: string, password: string) {
    this.check_permission();
    const fixed_url = try_complete_url(url);
    // check if we have duplicated entries
    if (this.databases.some((database) => database.name === name || database.url === fixed_url)) {
      throw Error("Trying to create database with existing name or url, please check.");
    }
    const database = await InjectorDatabases.build(name, fixed_url, password);
    this.databases.push(database);
    await this.to_store();
    return database;
  }

  async update_database(id: string, modified: { name?: string; url?: string; password?: string }) {
    if (Object.keys(modified).length !== 0) {
      this.check_permission();
    }
    const target = this.databases.find((database) => database.id === id);
    if (target === undefined) {
      throw Error(`Cannot find database with id ${id}. This is likely a BUG.`);
    }
    const fixed_url = modified.url ? try_complete_url(modified.url) : undefined;
    if (
      this.databases.some((database) => {
        if (modified.name && database.name === modified.name) {
          return true;
        }
        if (fixed_url && database.url === fixed_url) {
          return true;
        }
        return false;
      })
    ) {
      throw Error("This modification will result in a database with existing name or url, please check.");
    }
    const changed = await target.update(modified);
    await this.to_store();
    if (changed) {
      this.hosts
        .filter((host) => host.database_id === target.id)
        .forEach((host) => {
          const watchers = this.#watchers.get(host.name);
          if (watchers === undefined) {
            return;
          }
          const payload: UpdateModified = {
            removed: false,
            host: host,
            modified: { matcher: false, database: true, script: false },
          };
          watchers.forEach((watcher) => {
            watcher(payload);
          });
        });
    }
    return target;
  }

  async remove_database(id: string) {
    this.check_permission();
    // check if this database is referred
    const referred_hosts = this.hosts.filter((host) => host.database_id === id);
    if (referred_hosts.length > 0) {
      throw Error(
        `Cannot remove this database since it is referred by the following hosts: ${[
          referred_hosts.map((host) => host.name),
        ].join(", ")}`
      );
    }
    const target = this.databases.findIndex((database) => database.id === id);
    if (target === -1) {
      throw Error(`Cannot find database with id ${id}. This is likely a BUG.`);
    }
    this.databases.splice(target, 1);
    await this.to_store();
  }

  async new_script(name: string, type: "local" | "remote", mode: "classic" | "module", source: string) {
    this.check_permission();
    if (this.scripts.some((script) => script.name === name)) {
      throw Error("Trying to create script with name, please check.");
    }
    const script = await InjectorScripts.build(name, type, mode, source);
    this.scripts.push(script);
    await this.to_store();
    return script;
  }

  async update_script(
    id: string,
    modified: {
      name?: string;
      mode?: "classic" | "module";
      type?: "local" | "remote";
      source?: string;
    }
  ) {
    if (Object.keys(modified).length !== 0) {
      this.check_permission();
    }
    if (modified.name && this.scripts.some((script) => script.name === modified.name)) {
      throw Error("This modification will result in a script with duplicated name.");
    }
    const target = this.scripts.find((script) => script.id === id);
    if (target === undefined) {
      throw Error(`Cannot find database with id ${id}. This is likely a BUG.`);
    }
    const changed = await target.update(modified);
    await this.to_store();
    if (changed) {
      this.hosts
        .filter((host) => host.script_id === target.id)
        .forEach((host) => {
          const watchers = this.#watchers.get(host.name);
          if (watchers === undefined) {
            return;
          }
          const payload: UpdateModified = {
            removed: false,
            host: host,
            modified: { matcher: false, database: false, script: true },
          };
          watchers.forEach((watcher) => {
            watcher(payload);
          });
        });
    }
    return target;
  }

  async remove_script(id: string) {
    this.check_permission();
    // check if this script is referred
    const referred_hosts = this.hosts.filter((host) => host.script_id === id);
    if (referred_hosts.length > 0) {
      throw Error(
        `Cannot remove this script since it is referred by the following hosts: ${[
          referred_hosts.map((host) => host.name),
        ].join(", ")}`
      );
    }
    const target = this.scripts.findIndex((script) => script.id === id);
    if (target === -1) {
      throw Error(`Cannot find script with id ${id}. This is likely a BUG.`);
    }
    this.scripts.splice(target, 1);
    await this.to_store();
  }

  private check_host(name: string, matcher: string, database_id: string, script_id: string) {
    try {
      new RegExp(matcher);
    } catch (error) {
      throw Error(`The specified host matcher is invalid: ${String(error)}`);
    }
    if (this.hosts.some((host) => host.name === name)) {
      throw Error("There is already a host with the same name.");
    }
    if (this.databases.find((database) => database.id === database_id) === undefined) {
      throw Error(`No database with specified id ${database_id}. This is likely a BUG.`);
    }
    if (this.scripts.find((script) => script.id === script_id) === undefined) {
      throw Error(`No script with specified id ${script_id}. This is likely a BUG.`);
    }
  }

  async new_host(name: string, matcher: string, database_id: string, script_id: string) {
    this.check_permission();
    this.check_host(name, matcher, database_id, script_id);
    const host = new InjectorHosts(name, matcher, database_id, script_id);
    this.hosts.push(host);
    await this.to_store();
    return host;
  }

  async update_host(
    name: string,
    modified: { name?: string; matcher?: string; database_id?: string; script_id?: string }
  ) {
    if (Object.keys(modified).length !== 0) {
      this.check_permission();
    }
    const target = this.hosts.find((host) => host.name === name);
    if (target === undefined) {
      throw Error(`No host named ${name}. This is likely a BUG.`);
    }
    const new_name = modified.name ?? name;
    const matcher = modified.matcher ?? target.host;
    const database_id = modified.database_id ?? target.database_id;
    const script_id = modified.script_id ?? target.script_id;
    this.check_host(new_name, matcher, database_id, script_id);
    const payload: UpdateModified = {
      removed: false,
      host: target,
      modified: {
        matcher: matcher !== target.host,
        database: database_id !== target.database_id,
        script: script_id !== target.script_id,
      },
    };
    target.name = new_name;
    target.host = matcher;
    target.database_id = database_id;
    target.script_id = script_id;
    await this.to_store();
    this.#watchers.get(name)?.forEach((watcher) => {
      watcher(payload);
    });
    return target;
  }

  async remove_host(name: string) {
    this.check_permission();
    const target = this.hosts.findIndex((host) => host.name === name);
    if (target === -1) {
      throw Error(`No host named ${name}. This is likely a BUG.`);
    }
    this.hosts.splice(target, 1);
    await this.to_store();
    const watchers = this.#watchers.get(name);
    if (watchers === undefined) {
      return;
    }
    watchers.forEach((watcher) => {
      watcher({ removed: true });
    });
    this.#watchers.delete(name);
  }

  get_components(host: InjectorHosts): { database: InjectorDatabases; script: InjectorScripts } {
    return {
      database: this.databases.find((database) => database.id === host.database_id)!,
      script: this.scripts.find((scripts) => scripts.id === host.script_id)!,
    };
  }
}
