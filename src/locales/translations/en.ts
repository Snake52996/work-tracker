import { en } from "vuetify/locale";

export const message = {
  $vuetify: {
    ...en,
  },
  message: {
    error: {
      error_fallback:
        "This is a fallback report where an Error is thrown instead of being wrapped by Result<T>. Please file an issue if you would like to.",
      failed_to_argon2: "Argon2 returned an error.",
      failed_to_argon2_hint:
        "This is usually caused large memory usage, you can try to open the panel '{panel_name}' and reduce value in '{field_name}'. Note that decreasing the value harms security: you are suggested set the value above 64MiB. If the problem continues, it might be your browser setting a really tight memory limitation and you can search for solutions on the Internet.",
      failed_to_config_entries: "Entries at following indices are invalid.",
      duplicated_entries_defined: "Some entries share the same name.",
      failed_to_parse_imported_data: "Cannot parse imported data.",
      failed_to_import_reasons: "Data cannot be imported due to following reasons:",
      invalid_url: "The URL is invalid.",
      failed_to_fetch_data: "Failed to fetch data from {source}",
      cannot_commit_modification: "Modification cannot be done due to following reasons:",
      failed_to_fetch_all_images: "Failed to load following images:",
      fallback_failed_to_fetch_all_images:
        "@:message.error.error_fallback @:message.error.failed_to_fetch_all_images",
      cannot_find_image: "Cannot find image with name {name}",
      unexpected_image_name: "Unexpected image name {name} encountered",
      failure_report: "Failed to {task} due to following errors:",
      fallback_failure_report: "@:message.error.error_fallback @:message.error.failure_report",
      entry_contains_error: "Following errors are detected for this entry:",
      missing_required_entry: "Required entry {0} not specified",
      no_main_data_file: "Picked directory does not include the main data file data.json",
      failed_loading_database: "Failed to load the database",
      failed_opening_database:
        "Failed to open the database, likely due to corrupted data file or incorrect password",
      file_does_not_exist: "Trying to open file {filename} which does not exist",
      fetching_thumbnail_for_unknown_item: "Trying to fetch thumbnail for an unknown item.",
      fetching_thumbnail_for_unknown_item_detail: "The item id was {id}. This is likely a BUG.",
      failed_to_import_image: "Cannot load and prepare the image. Please recheck if it is a valid image.",
      cannot_parse_JSON: "Cannot parse specified JSON file. Is it corrupted?",
      invalid_data_format: "The data file has invalid format.",
    },
    item_invalid_reason: {
      missing_entry: "missing required entry: {0}",
      image: "item image",
      duplicated_value: "duplicated value {1} in entry {0}",
      exclusive_tag: "more than one tag specified in exclusive entry {0}",
      invalid_formatting:
        "value of entry {0} does not satisfy formatting requirement introduced by its sorting method ({1})",
    },
    hello: "hello",
    cannot_change_language: "Failed to switch language: ",
    select_datasource: "Select a data source",
    select_datasource_detail: "Load from a remote URL or a local directory",
    alternative_way: "you can also",
    create_new_datasource: "create a new database",
    input_remote_url: "URL referring data.json or its parent directory",
    input_local_directory: "Directory containing data.json",
    time_taking_action: "This may take a while",
    input_password: "Please enter the password",
    displayed_items: "Displaying {count} items",
    load_image_from_file: "Pick local file to load image from",
    load_image_from_url: "Input URL to download image from",
    input_new_password: "Enter new password",
    tags_to_be_modified: "Tags to be modified",
    no_tag_to_be_edited: {
      title: "No entries to be edited",
      description: "Items do not have any entry with type tag",
    },
    no_tags_to_be_inspected: {
      title: "Nothing to be inspected",
      description: "At least two different tags must be created before inspecting relationship between them.",
    },
    tags_in_database: "Current tags in database",
    tags_preview: "Preview of tags after modification",
    unsaved_changes: {
      title: "Heads up! You have unsaved changes!",
      content:
        "If you leave this page, loaded database will be erased from the memory together with your unsaved changes! Download those modified files unless you ARE going to discard them. Your navigation has been canceled, but this warning will not fire again during the next 60 seconds and you are free to go anywhere now.",
    },
  },
  action: {
    copy: "copy",
    close: "close",
    learn_more: "learn more",
    move_up: "move up",
    move_down: "move down",
    remove: "remove",
    start: "start",
    back_to_last_step: "go back",
    continue_to_next_step: "next",
    download_full_database: "download full database",
    done: "done",
    open: "open",
    goto: "goto",
    import: "import data",
    edit: "edit",
    download_delta: "download modified files",
    lock_database: "lock database",
    confirm: "confirm",
    cancel: "cancel",
    maintenance: "maintenance",
    select_all: "select all",
    unselect_all: "unselect all",
    inverse_selection: "inverse selection",
    show_only_selected: "show only selected items",
    select: "select",
    unselect: "unselect",
    batch_tag_modify: "start batched tag modification",
    check: "check",
  },
  acTion: {
    create: "create {target}",
  },
  datasource_creation: {
    security: {
      security_faqs: "Frequently asked questions about database protection",
      login_time: {
        question: "What does login time affect? How should I configure it?",
        answer:
          "It configures the expected time needed to transform your password into the key used to protect the database. Larger value likely results in safer data but also longer wait for each time you open your database. You should set it to the largest value you feel acceptable and we will take care of finding parameters to satisfy it. As a special note, the actual time required also depends on hardware capabilities and system load, so you should better probe parameters on the weakest device you plan to access your database, or you may find significantly prolonged wait time when switching to those devices.",
      },
      probing_time: {
        question: "Probing is slow, can you fix it?",
        answer:
          "There is not a single parameter configuring the time required directly. We have to run the algorithm multiple times (i.e. benchmarking) to find a set of parameters satisfying the time requirement, so generally the answer is no. But nothing to worry about: the algorithm will run only once each time you open your database, not multiple times.",
      },
      online_security: {
        question: "You can access my data, right?",
        answer:
          "Definitely not. Technical answer to this question is no since though you might be using a version built by us and hosted on a server of our choice, no network requests are made after the application has been loaded to your device other than those to acquire your database from server of your choice, which can be easily verified by monitoring network traffics with the developer tools, so the application has simply no chance to submit your data to anywhere. Economic answer to this question is no since it is easy to find free hosting services to provide static (frontend-only) applications like this one, but it is not the case if we want to receive and store your data. All possible outcomes of making use of your data collected, to be honest, is not likely to be able to cover the total cost of renting a server for collecting them, so there is simply no reason to collect your data. Anyway, all source code is available and you are free to exam them or build and host your own instance if you would like.",
      },
      access_by_third_party: {
        question: "Can the password verification bypassed, say, by modifying the code?",
        answer:
          "No. When opening your database, the application is not actually verifying if your password is correct: we are not allowing someone with the correct password to access data we always have in the database, but asking your password to recover real data from the database. In one word, the data does not exist, not in an accessible way, before a correct password is used to transform it. Anyone can open the main database file directly without this application since it is nothing special than a commonly used JSON file, but there are only random bytes if they do not decrypt it with the correct password.",
      },
      implement_detail: {
        question: "I want to know details about how my database is protected.",
        answer:
          "All data in your database, together with the database configurations, are encrypted with AES in GCM mode with 256-bit key, referred as the data key, generated randomly when the database is created. Images are also encrypted by the data key but not embedded into the main data file but as separate files to reduce file sizes, and the header of the images are preserved to make them looks like images. This leaks no content of the images but only the image size of PNG images. The data key is, in turn, encrypted by a key derived from the password you set using Argon2, which is referred as the user key. The user key, together with the password, is never saved but dropped once the data key is encrypted (when creating databases) or decrypted (when opening databases). This dual key structure is widely used and allows changing password without re-encrypting the whole database. Someone without a correct password, user key or data key can only acquire the following meaningful information from the database: the number of items in it if you configured the database to include an image for each item and the parameters used when invoking Argon2.",
      },
    },
    welcome: "Welcome to work-tracker",
    welcome_detail: "This guide will help you build a database to track works you like (and you don't like)",
    summary_and_done: "Done!",
    security_setup: "Security setup",
    security_setup_detail: "Decide how your data will be protected",
    kdf_target_time: "Target login time",
    kdf_target_time_hint: "Maximum time you would like to wait when system is verifying your password",
    kdf_detail_control: "I am an expert, let me configure this!",
    kdf_memory: "Memory (m in argon2 parameters)",
    kdf_iteration_hint: "specifying this value will disable probing",
    kdf_iteration: "Number of iterations (t in argon2 parameters)",
    kdf_threads: "Number of threads to use (p in argon2 parameters)",
    validate_argon2_parameters: "validate parameters",
    probe_argon2_parameters: "probe parameters",
    password: "password to protect the database",
    salt: "random data to ensure your password is unique",
    key: "fingerprint of generated key",
    generate_a_key: "generate a key",
    general_configuration: "General configuration",
    datasource_name: "name of the database",
    entry_setting: "Entry setting",
    entry_setting_detail: "Decide what should be displayed for each item",
    load_existing_configuration: {
      label: "Load from existing configuration",
      hint: "This will replace anything you have configured below!",
    },
    include_image: "Include a cover image",
    width: "width",
    pixel: "pixel",
    height: "height",
    add_new_entry: "Add new entry",
    entry_name: "name of the entry",
    entry_sorting_method: "Is this entry sortable?",
    entry_type: "data type of the entry",
    entry_types: {
      string: {
        name: "string",
        description: "write anything you want",
      },
      tag: {
        name: "tag",
        description: "short strings, newly created or picked from created ones",
      },
      rating: {
        name: "rating",
        description: "rating points with optional justifying comments",
      },
    },
    optional: "make this optional",
    optional_detail: "If this entry can be omitted",
    summary_and_done_detail:
      "The database has been created! We just need to settle a couple of things down, then you can save the database and are open it.",
    tag_exclusive: "make tags exclusive",
    tag_exclusive_hint: "No more than one tag can be picked if the tag is in exclusive mode",
    rating_maximum: "maximum score",
    rating_use_hint: "use hints to help scoring",
    string_unique: "make the content unique",
    string_unique_hint:
      "If the content is required to be unique, no different items can share the same value in this entry",
    error: {
      title: "The configuration is invalid due to following reasons",
      image_size_not_positive: "Got negative value or zero as width or height of image.",
      image_size_not_integer: "Specified width or height of image is not integer.",
      entry_name_is_empty: "Entry at position {index} (starting with 1) has an empty name.",
      entry_name_is_duplicated: "There are multiple entries with name {name}.",
      bad_rating_max_score: ({
        named,
      }: {
        named: ((name: "name") => string) & ((name: "index") => number);
      }) =>
        `Rating ${named("name").length > 0 ? "with name" : "at index"} ${named("name").length > 0 ? named("name") : named("index")} has invalid max score.`,
      empty_database: "The database is ultimately empty.",
      rating_hint_mismatch: "Number of hints mismatches: {score} rating levels vs {hint} hints.",
    },
  },
  sorting: {
    disabled: {
      name: "disabled",
      description: "This entry will not be sorted.",
    },
    as_string: {
      name: "as string",
      description: "sort like ordering words in a dictionary",
    },
    as_number: {
      name: "as number",
      description: "interpret as numbers before sorting",
    },
    as_date: {
      name: "as date",
      description:
        "interpret as date before sorting; any value that cannot be parsed as a date will cause an error",
    },
  },
  hint: {
    sort_by: "Sort by...",
    item_per_page: "items per page",
  },
  sorting_by: {
    none: "None",
    ascending: "ascending",
    descending: "descending",
  },
  terms: {
    new_database_item: "new item",
  },
  search: {
    general_match: "general string match",
    end_group: "end an or group",
    in_group: "append in or group",
    inverse: "inverse",
    check_existence: "check existence of entry",
    partial_match: "partial match / contains",
    exact_match: "exact match / same as",
    match_lesser: "less than specified value",
    match_equal: "equals to specified value",
    match_greater: "greater than specified value",
  },
  maintenance: {
    image_allocation: "Image pool allocation statistics",
    tag_insight: {
      title: "Tag Insight",
      subtitle: "Inspect relationship / correspondence between tags",
    },
    danger_zone: "danger zone",
    danger_zone_explained: "All operations here forms certain level of danger",
    export_configuration: "Export the database configuration",
    export_configuration_detail:
      "This will export your item entry settings in plaintext. Your data contents, database general configurations like the database name and your key will not be included. Sharing this will not make it easier to decrypt your database without a correct password / key.",
    critical_zone: "critical zone",
    critical_zone_explained: "All buttons here need a correct password to be functional",
    rekey:
      "The data key can only be used to encrypt for limited times or the security of the system may be harmed.",
    rekey_required: "The data key have exceeded its encrypting limitation! You must generate a new one.",
    do_rekey: "generate new data key",
    change_password: "change the password",
  },
  conjunctions: {
    both_a_and_b: "both {a} and {b}",
    neither_a_nor_b: "neither {a} nor {b}",
    a_but_not_b: "{a} but not {b}",
  },
};
