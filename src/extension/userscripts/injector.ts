import type {
  InjectorConfiguration,
  InjectorDatabases,
  InjectorHosts,
  InjectorScripts,
} from "../types/configuration";
import { Indicator, type IndicatorState } from "../types/indicator";
import { Runner } from "../types/runner-interfaces";

function inject_styles() {
  Runner.add_style(
    `
.wt-indicator-container {
  overflow: hidden;
  position: fixed;
  top: 0;
  right: 0;
  margin: 12px;
  width: 50px;
  height: 50px;
  z-index: 99999999;
}
.wt-alert-container {
  border-top-style: solid;
  border-top-width: 6px;
  border-top-color: #cf6679;
  padding: 12px 28px;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: #18191b;
  z-index: 99999999;
  color: #ffffff;
}
.wt-alert-container > h3 {
  margin: 0 0 12px 0;
  text-align: center;
  color: #ffffff;
}
.wt-alert-container > p {
  margin: 0 0 8px 0;
}
.wt-alert-container > button {
  width: 100%;
  background-color: #ffffff;
  color: black;
}`,
  );
  Runner.add_style(Indicator.get_css());
}

function show_alert(config: { title?: string; content?: string }) {
  const container = document.createElement("div");
  container.classList.add("wt-alert-container");
  if (config.title) {
    const title = document.createElement("h3");
    title.textContent = config.title;
    container.append(title);
  }
  if (config.content) {
    const parts = config.content.split("\n");
    container.append(
      ...parts.map(content => {
        const content_holder = document.createElement("p");
        content_holder.textContent = content;
        return content_holder;
      }),
    );
  }
  const close_button = document.createElement("button");
  close_button.textContent = "Close";
  close_button.addEventListener("click", () => {
    container.remove();
  });
  container.append(close_button);
  document.body.append(container);
}

function create_indicator(): Indicator {
  inject_styles();
  const container = document.createElement("div");
  container.classList.add("wt-indicator-container");
  document.body.append(container);
  return new Indicator(container);
}

type InternalState = {
  database: InjectorDatabases;
  script: InjectorScripts;
  host: InjectorHosts;
  configuration: InjectorConfiguration;
  indicator: Indicator;
  script_instance: {
    run: (data: any[]) => Promise<void>;
    stop?: () => Promise<void>;
    reset_data?: (new_data: any[]) => Promise<void>;
  };
};
function configure_indicator(
  indicator: Indicator,
  state: IndicatorState,
  action_map: Map<IndicatorState, () => void>,
) {
  indicator.action = action_map.get(state)!;
  indicator.state = state;
}
async function user_script_guard(
  action: Promise<void>,
  name: string,
  indicator: Indicator,
  action_map: Map<IndicatorState, () => void>,
): Promise<boolean> {
  try {
    await action;
    return false;
  } catch (error) {
    show_alert({
      title: `Failed to ${name} the script`,
      content: `This is caused by the following error:\n${error}`,
    });
    configure_indicator(indicator, "failed", action_map);
    return true;
  }
}
async function update_materials(
  materials: InternalState,
  updates: { database?: InjectorDatabases; script?: InjectorScripts },
  action_map: Map<IndicatorState, () => void>,
) {
  // how should in-place update be done?
  // 1. if nothing is modified, nothing to be done, just update the indicator
  // 2. if only the database is updated:
  // 2.1. if the script is equipped with reset_data, use it to replace the data directly
  // 2.2. if the script is not equipped with reset_data but with stop, restart it with new data
  // 2.3. otherwise, make it pending-update since it cannot be updated in-place
  // 3. if only the script is updated:
  // 3.1. if the script is equipped with stop, stop the old one an start with the new instance
  // 3.2. otherwise, make it pending-update since it cannot be updated in-place
  // 4. if both database and script is updated:
  // 4.1. if the script is equipped with stop, stop the old one an start with the new instance and new data
  // 4.2. otherwise, make it pending-update since it cannot be updated in-place
  // To summarize: if the script is updated, a stop/run is always required. Otherwise, if only the database
  //  is updated, stop/run can be avoided with reset_data.

  if (updates.database) {
    // the database can be updated in-place at the very beginning
    materials.database = updates.database;
  }

  const stop_run = async (): Promise<boolean> => {
    // this is a helper function to perform stop/run, returns if the procedure should be interrupted
    //  it handles both the case that current instance of script is equipped with stop and the case that it
    //  is not. The script instance is updated automatically if the script is updated.
    if (materials.script_instance.stop === undefined) {
      // the script is not equipped with API stop, we can only restart it by reloading the page
      configure_indicator(materials.indicator, "pending-update", action_map);
      return true;
    }
    if (await user_script_guard(materials.script_instance.stop(), "stop", materials.indicator, action_map)) {
      // the stop function failed and the error has been reported, just terminate
      return true;
    }
    // update the script instance
    if (updates.script) {
      materials.script = updates.script;
      materials.script_instance = (await materials.script.get_instance()).unwrap();
    }
    // (re)start the script
    const data = await materials.database.get_content();
    if (
      await user_script_guard(materials.script_instance.run(data), "start", materials.indicator, action_map)
    ) {
      // the run function failed and the error has been reported, just terminate
      return true;
    }
    // all done, the script is up and running again
    //  note that the indicator is not updated here
    return false;
  };

  if (updates.script) {
    // if the script is updated, we need to perform stop/run if possible
    if (await stop_run()) {
      return;
    }
  } else if (updates.database) {
    // the database is updated but the script is not updated
    //  first, check if the database can be updated in-place with reset_data
    if (materials.script_instance.reset_data === undefined) {
      // otherwise, a stop/run is required to update the data
      if (await stop_run()) {
        return;
      }
    } else {
      // if it can, prefer this since it avoids some overhead
      const new_data = await materials.database.get_content();
      if (
        await user_script_guard(
          materials.script_instance.reset_data(new_data),
          "restart",
          materials.indicator,
          action_map,
        )
      ) {
        return;
      }
    }
  }
  // the indicator can be updated now
  configure_indicator(materials.indicator, "active", action_map);
}
function build_state_action_map(materials: InternalState): Map<IndicatorState, () => void> {
  const result: Map<IndicatorState, () => void> = new Map();
  const noop = () => {};
  const refetch = async () => {
    configure_indicator(materials.indicator, "updating", result);
    const database_result = await materials.configuration.update_database(materials.database.id, {});
    const script_result = await materials.configuration.update_script(materials.script.id, {});
    const errors = [];
    if (database_result.is_err()) {
      errors.push(String(database_result.unwrap_error()));
    }
    if (script_result.is_err()) {
      errors.push(String(script_result.unwrap_error()));
    }
    if (errors.length > 0) {
      show_alert({
        title: "failed to update due to following reasons",
        content: errors.join("\n"),
      });
      configure_indicator(materials.indicator, "degraded", result);
      return;
    }
    const new_database = database_result.unwrap();
    const new_script = script_result.unwrap();
    return update_materials(
      materials,
      {
        database: new_database.is_same(materials.database) ? undefined : new_database,
        script: new_script.is_same(materials.script) ? undefined : new_script,
      },
      result,
    );
  };
  const reload_page = () => {
    window.location.reload();
  };
  result.set("loading", noop);
  result.set("active", refetch);
  result.set("dangling", noop);
  result.set("updating", noop);
  result.set("pending-update", reload_page);
  result.set("degraded", refetch);
  result.set("failed", reload_page);
  return result;
}

export async function start_injector(host: InjectorHosts, configuration: InjectorConfiguration) {
  // create indicator
  const indicator = create_indicator();

  // create container for database and script
  const { database, script } = configuration.get_components(host);
  const script_instance = (await script.get_instance()).unwrap();
  const database_content = await database.get_content();
  const materials: InternalState = {
    database,
    script,
    host,
    configuration,
    indicator,
    script_instance,
  };

  // build action map
  const action_map = build_state_action_map(materials);

  // get ready for possible updates
  configuration.setup_autoupdate(update => {
    if (update.is_err()) {
      configure_indicator(indicator, "pending-update", action_map);
    }
  });
  configuration.register_host_watcher(host.id, modification => {
    // take no reaction if currently in unstable state
    if (indicator.state !== "active") {
      return;
    }
    if (
      // the host was removed entirely
      modification.removed ||
      // the host was not removed, but no longer matches current address
      (modification.modified.matcher &&
        window.location.href.match(new RegExp(modification.host.host)) === null)
    ) {
      return configure_indicator(indicator, "dangling", action_map);
    }
    const { database, script } = configuration.get_components(host);
    update_materials(
      materials,
      {
        database: modification.modified.database ? database : undefined,
        script: modification.modified.script ? script : undefined,
      },
      action_map,
    );
  });

  // initiate the script
  if (!(await user_script_guard(script_instance.run(database_content), "start", indicator, action_map))) {
    configure_indicator(indicator, "active", action_map);
  }
}
