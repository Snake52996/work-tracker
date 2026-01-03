import { zhHans } from "vuetify/locale";

export const message = {
  $vuetify: {
    ...zhHans,
  },
  message: {
    error: {
      error_fallback:
        "这是一个回退错误报告，它抛出了错误而没有被Result<T>包裹。愿意的话，你可以提出一个issue。",
      failed_to_argon2: "加密算法返回了一个错误。",
      failed_to_argon2_hint:
        "这通常会导致大量内存的使用，你可以试着打开'{panel_name}'并且降低'{field_name}'的值。注意，降低这个值会带来安全风险：我们建议值大于64MiB。如果这个问题依然存在，可能是您的浏览器给您设定了一个很严格的内存限制，您可以在互联网上搜索解决方案。",
      failed_to_config_entries: "以下索引对应的条目无效。",
      duplicated_entries_defined: "存在名字重复的条目",
      failed_to_parse_imported_data: "无法解析导入的数据。",
      failed_to_import_reasons: "无法加载数据，原因如下：",
      invalid_url: "URL错误。",
      failed_to_fetch_data: "从{source}中提取数据失败。",
      cannot_commit_modification: "修改未成功，原因如下：",
      failed_to_fetch_all_images: "以下图像未成功加载：",
      fallback_failed_to_fetch_all_images:
        "@:message.error.error_fallback @:message.error.failed_to_fetch_all_images",
      cannot_find_image: "无法找到名为{name}的图像",
      unexpected_image_name: "出现了一个意外的图像名称{name}",
      failure_report: "{task}任务失败，原因如下：",
      fallback_failure_report: "@:message.error.error_fallback @:message.error.failure_report",
      entry_contains_error: "此条目存在以下错误：",
      missing_required_entry: "必要条目{0}未指定",
      no_main_data_file: "指定的目录中不包含数据库data.json文件。",
      failed_loading_database: "数据库加载失败",
      failed_opening_database:
        "数据库打开失败，可能是数据文件损坏或者是密码错误。",
      file_does_not_exist: "尝试打开一个不存在的文件 {filename}。",
      fetching_thumbnail_for_unknown_item: "试图获取未知作品的缩略图。",
      fetching_thumbnail_for_unknown_item_detail: "作品ID为{id}。 这似乎是一个漏洞。",
      failed_to_import_image: "无法载入此图像。请再次检查图像。",
      cannot_parse_JSON: "无法解析JSON文件，请检查其是否损坏。",
      invalid_data_format: "此数据文件格式无效。",
      failed_to_rename_tag: "重命名标签失败。",
      failed_to_remove_tag: "删除标签失败。",
      tag_name_collision: {
        brief: "检测到标签命名冲突",
        detail: "已存在名为{name}的标签。",
      },
      removed_last_tag: {
        brief: "违反了条目要求",
        detail:
          "移除标签{name}会导致一些作品失去必要条目，条目{entry_name}会变为空。",
      },
      empty_tag_name: {
        brief: "此标签尚未命名",
        detail: "标签不能为空。注意：前/后空格被删除。",
      },
    },
    item_invalid_reason: {
      missing_entry: "缺少必要项目: {0}",
      image: "项目图片",
      duplicated_value: "复制项目 {0} 中的值 {1} ",
      exclusive_tag: "在互斥条目{0}中指定了多于一个标签",
      invalid_formatting:
        "条目{0}的值不满足({1})的排序格式要求",
    },
    hello: "您好",
    cannot_change_language: "更换语言失败：",
    select_datasource: "加载现有数据库",
    select_datasource_detail: "输入一个URL，或者选择一个本地文件夹路径",
    alternative_way: "我还没有数据库？在这里创建",
    create_new_datasource: "创建一个新数据库",
    input_remote_url: "输入一个指向data.json的URL，或者其父目录",
    input_local_directory: "输入包含data.json的目录",
    time_taking_action: "请稍后...",
    input_password: "请输入密码",
    displayed_items: "展示{count}项目",
    load_image_from_file: "从本地文件中上传文件",
    load_image_from_url: "从URL下载图片",
    input_new_password: "请输入新密码",
    tags_to_be_modified: "需要修改的标签",
    no_tag_to_be_edited: {
      title: "没有项目被修改",
      description: "作品没有任何带有type标记的条目",
    },
    no_tags_to_be_inspected: {
      title: "没有可调查的标签",
      description: "在调查标签相似性之前必须存在两个不同标签",
    },
    tags_in_database: "数据库中的当前标签",
    tags_preview: "修改后的标签预览",
    unsaved_changes: {
      title: "举起手来！您有为保存的修改",
      content:
        "如果你离开此页面，内存中已加载的数据库将会被清除，同时不会保留未保存的修改！ 如果你不想放弃修改，请及时下载它们。你的导航已经被取消了，但是此警告不会在60秒内被再次触发，现在你可以自由操作了。",
    },
  },
  action: {
    copy: "复制",
    close: "关闭",
    learn_more: "了解更多",
    move_up: "上移一位",
    move_down: "下移一位",
    remove: "移除",
    start: "开始",
    back_to_last_step: "上一步",
    continue_to_next_step: "下一步",
    download_full_database: "下载整个数据库",
    done: "完成",
    open: "打开",
    goto: "前往",
    import: "导入数据",
    edit: "编辑",
    download_delta: "下载更改的文件",
    lock_database: "锁定数据库",
    confirm: "确认",
    cancel: "取消",
    maintenance: "维护",
    select_all: "全选",
    unselect_all: "全不选",
    inverse_selection: "反选",
    show_only_selected: "只展示选中作品",
    select: "选择",
    unselect: "取消选择",
    batch_tag_modify: "批量修改标签",
    check: "检查",
  },
  acTion: {
    create: "创建{target}",
  },
  datasource_creation: {
    security: {
      security_faqs: "有关数据库安全的常见问题",
      login_time: {
        question: "登录时间意味着什么？我应该如何配置它？",
        answer:
          "登陆时间指的是设备将您的密码转变为密钥所花费的期望时间。值越大越安全，但同时您打开数据集也会越慢。您应该将其设置为您所能接受的最大值，然后我们则负责计算满足条件的参数。特别说明，实际的登录时间会受到您使用的设备硬件水平和系统的影响，因此您应该参考您最弱的设备进行参数设置，否则当您切换设备时就要花费极长的时间了。",
      },
      probing_time: {
        question: "计算参数太慢了，能快点吗？",
        answer:
          "并没有能够直接修改花费时间的参数。我们必须执行多次此算法（如基准化）来找出满足登录时间要求的参数，因此答案是不能。但您不必担心：此算法只会在您打开数据库时运行一次，而非多次。",
      },
      online_security: {
        question: "你其实可以访问到我的数据吧？",
        answer:
          "当然不行。从技术的角度就能给出否定的回答，因为尽管您可能使用我们构建的版本并托管在我们选择的服务器上，但在应用程序加载到您的设备后，除了从您选择的服务器获取数据库之外，就没有其他的网络请求了，这可以很容易地通过使用开发人员工具监控网络流量进行验证，因此应用程序根本没有机会将您的数据提交到任何地方。 从经济的角度给出的也是否定的回答，因为想找到免费的托管服务来提供像这样的静态（仅前端）应用程序是很简单的，但如果我们想要接收和存储您的数据，情况就大不相同了。老实说，使用收集到的数据所产生的所有可能的获益不太可能超过为收集这些数据而租用服务器的总成本，因此根本没有理由收集数据。无论如何，作为一个开源工具，只要您愿意，您就可以自由地测试它们或构建自己的实例。",
      },
      access_by_third_party: {
        question: "是否可以通过修改代码来绕过密码验证？",
        answer:
          "否。当打开数据库时，应用程序实际上并没有验证您的密码是否正确：我们不允许具有正确密码的人访问数据库中始终存在的数据，而是要求您的密码从数据库中恢复真实数据。简而言之，在使用正确的密码对其进行转换之前，数据不存在，无法访问。任何人都可以在没有这个应用程序的情况下直接打开主数据库文件，因为它与常用的JSON文件没有什么特别之处，但是如果他们没有使用正确的密码解密它，就只能看到随机的字节。",
      },
      implement_detail: {
        question: "我想了解更多有关我数据库保护的细节。",
        answer:
          "数据库中的所有数据以及数据库配置都使用GCM模式下的AES加密，密钥为256位，在创建数据库时随机生成，称为数据密钥。图像也通过数据密钥加密，但不嵌入到主数据文件中，而是作为单独的文件来减小文件大小，并且保留图像的标题以使它们看起来像图像。这不会泄露图像的内容，只会泄露PNG图像的图像大小。反过来，数据密钥由您使用Argon2设置的密码派生的密钥加密，该密钥称为用户密钥。一旦数据密钥被加密（创建数据库时）或解密（打开数据库时），用户密钥和密码就不会被保存，而是会被删除。这种双密钥结构被广泛使用，允许在不重新加密整个数据库的情况下更改密码。没有正确密码、用户密钥或数据密钥的人只能从数据库获取以下有意义的信息：数据库中的作品数量（只有当您的数据库配置中有图像），以及调用Argon2时使用的参数。",
      },
    },
    welcome: "欢迎来到work-tracker",
    welcome_detail: "本指引将带领您构建一个数据库，来存放您喜欢（或不喜欢）的工作。",
    summary_and_done: "完成！",
    security_setup: "安全性设置",
    security_setup_detail: "这些设置将决定您的数据安全性",
    kdf_target_time: "期望登录耗时",
    kdf_target_time_hint: "您期望电脑在验证密码时的最大用时",
    kdf_detail_control: "我是安全专家，让我来亲自配置！",
    kdf_memory: "内存（argon2算法中的参数m）",
    kdf_iteration_hint: "该值被指定后将关闭参数检测",
    kdf_iteration: "迭代次数（argon2算法中的参数t）",
    kdf_threads: "线程个数（argon2算法中的参数p）",
    validate_argon2_parameters: "开始参数验证",
    probe_argon2_parameters: "开始参数检测",
    password: "请输入您数据库的密码",
    salt: "确保您密码唯一性的乱码",
    key: "您的密钥指纹",
    generate_a_key: "单击此处生成一个密钥",
    general_configuration: "数据库个性化配置",
    datasource_name: "给您的数据库起一个名字",
    entry_setting: "作品设置",
    entry_setting_detail: "决定您数据库中的每个作品需要哪些条目",
    load_existing_configuration: {
      label: "从已有配置中加载",
      hint: "选择此项后将覆盖所有下方的设定",
    },
    include_image: "添加封面图像",
    width: "宽",
    pixel: "像素",
    height: "高",
    add_new_entry: "新增条目",
    entry_name: "条目名称",
    entry_sorting_method: "此条目能否进行排序？",
    entry_type: "条目的数据类型",
    entry_types: {
      string: {
        name: "字符串",
        description: "想写什么写什么",
      },
      tag: {
        name: "标签",
        description: "短小字符串，可以新建也可以从已有的标签中选择",
      },
      rating: {
        name: "评分",
        description: "对作品进行评分，同时可以进行解释性说明",
      },
    },
    optional: "将此条目设为非必须项",
    optional_detail: "即能否为空",
    summary_and_done_detail:
      "数据集已被创建，我们只需确定一些设置，您就可以保存并打开您的数据集了。",
    tag_exclusive: "将此标签设为互斥标签",
    tag_exclusive_hint: "添加了互斥标签后不能再添加其他标签",
    rating_maximum: "分数上限",
    rating_use_hint: "使用解释说明帮助打分",
    string_unique: "要求此内容唯一",
    string_unique_hint:
      "若要求此内容唯一，那么不同的作品不能在此条目中具有相同值",
    error: {
      title: "配置无效，原因如下",
      image_size_not_positive: "图像的长或宽被设置为了0或负数。",
      image_size_not_integer: "图像的长或宽被设置为了非整数。",
      entry_name_is_empty: "位置{index}（从1开始）处的条目未命名",
      entry_name_is_duplicated: "有不止一个条目都被命名为了{name}。",
      bad_rating_max_score: ({
        named,
      }: {
        named: ((name: "name") => string) & ((name: "index") => number);
      }) =>
        `基于 ${named("name").length > 0 ? "名称" : "下标"}进行评分， ${named("name").length > 0 ? named("name") : named("index")} 具有无效的最大值`,
      empty_database: "您的数据库完全是空的。",
      rating_hint_mismatch: "评分和解释说明数量不匹配：评分有{score}个，而解释说明有{hint}个",
    },
  },
  sorting: {
    disabled: {
      name: "不可排序",
      description: "此条目不可被排序",
    },
    as_string: {
      name: "以字符串标准排序",
      description: "按字典序",
    },
    as_number: {
      name: "以数字标准排序",
      description: "在排序前会被转为数字",
    },
    as_date: {
      name: "以日期标准排序",
      description:
        "在排序前会被转为日期；任何不能解析为日期的值都将导致错误",
    },
  },
  hint: {
    sort_by: "排序依据...",
    item_per_page: "每一页的作品数",
  },
  sorting_by: {
    none: "空",
    ascending: "升序",
    descending: "降序",
  },
  terms: {
    new_database_item: "添加新作品",
  },
  search: {
    general_match: "在所有条目中进行字符串匹配",
    end_group: "结束或组",
    in_group: "加入或组",
    inverse: "反向",
    check_existence: "检查条目是否存在",
    partial_match: "部分匹配 / 包含",
    exact_match: "精确匹配 / 相等",
    match_lesser: "小于指定数值",
    match_equal: "等于指定数值",
    match_greater: "大于指定数值",
  },
  maintenance: {
    image_allocation: "图像池分配统计信息",
    tag_insight: {
      title: "标签视图",
      subtitle: "观察标签之间的相关性和相似性",
    },
    tag_management: {
      title: "标签管理",
      entry_picker: "选择一个条目",
      table: {
        titles: {
          id: "内部ID",
          content: "内容",
          references: "使用数",
          actions: "操作",
        },
      },
      merge_tags: "合并选中标签",
      remove_unused_tags: "移除所有未被选中的标签",
      confirm_removal: {
        title: "确认移除",
        explanation:
          "您正在删除一个正在被使用的标签。一旦删除此标签，那么所有含有此标签的作品都会失去此标签。您确定吗？注意，当此条目是必须项或移除此条目后会出现无标签的作品时，此操作将会失败，您的删除操作会被取消，并且您的数据库不会被更改。",
      },
      confirm_rename: {
        title: "给{old_name}起一个新名字",
        rename_into: "将标签重命名为...",
      },
      confirm_merge: {
        title: "选中一个标签",
        merge_into: "将标签合并为...",
      },
    },
    danger_zone: "危险区域",
    danger_zone_explained: "这里的所有操作都有一定程度的危险性",
    export_configuration: "导出数据库配置",
    export_configuration_detail:
      "这将以明文形式导出条目设置。您的数据内容、数据库一般配置（如数据库名称和密钥）将不包括在内。如果没有正确的密码/密钥，共享此信息不会使解密数据库变得更容易。",
    critical_zone: "敏感区域",
    critical_zone_explained: "本区域内所有按钮都需要您提供密码",
    rekey:
      "此数据密钥的加密次数是有限的，否则您的系统安全可能会受到威胁",
    rekey_required: "此数据密钥已达加密次数上限，你必须生成一个新的数据密钥",
    do_rekey: "生成新数据密钥",
    change_password: "修改密码",
  },
  conjunctions: {
    both_a_and_b: "即是{a}又是{b}",
    neither_a_nor_b: "既不是{a}也不是{b}",
    a_but_not_b: "是{a}而不是{b}",
  },
};
