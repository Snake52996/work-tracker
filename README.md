# WT: Work Tracker, a frontend-only web application for recording works you experienced

Read in other languages: [简体中文](docs/readmes/README_zh.md)

This is the sourcecode base for Work Tracker where it is developed. All source code is openly available here for you to exam if you are interested in, having questions about or feeling skeptical of it. However, in most cases, you do not have to download the source code to use this application: an instance is built and readily available at [this first-party URL](https://snake.moe/wt/).

## What is Work Tracker?

Work Tracker is a frontend-only web application, which runs only on your own device, to help you record works you experienced.  
There are so many works one can enjoy. It is quite common to forget about if you have actually experienced a specific one, and if yes, what was your feeling about it. Someone may write articles for works they admire or impressed of, recording their emotions and reflections, but you might find it kind of overkill to do so for each work, especially for those you feel "not good but also not bad enough for you to leave a `formal' criticism".  
**Here is where WT shines.** Use this small application to remember all works you have experienced, leave a simple rating score for it with a short justification, or a longer comment if you want. No need to create an account, nothing to be posted onto the Internet, you're free to write anything you want: _this is a memorial here just for yourself_. Since it is a web application, you do not need download and install anything: just take a modern browser and you are ready to go.

To some extent, this application can be more useful for (cyber) hoarders, since they (we?) are, in addition, crazy about collecting and storing those works they like, and, as in common cases, under the fear of being impossible to find certain resource again later, they will store those works locally way before they actually take their time to "consume" them. Navigating through massive storages to find out if certain work has been collected can form quite a challenge, especially when they can be stored in multiple disconnected devices or locations.  
Another problem exists for those who decide that works, if not good enough, should not be stored since which is simply a waste of space. They may frequently find themselves in the same trap, where they repeatedly collect the same work which later turns out to be collected and already rejected previously, since it is not those works that you had bad feeling about at the first glance, but those you felt their cover and introduction attractive while their content have no where to go other than being rejected, that can fool you when you have removed them from your storage and encountered them later.  
**Here is where WT shines.** With its flexible functionality, it can be readily used as a metadata manager that records all you need about every work you have collected, including those you have already removed from you storage. An entry can be included to indicate where you put this work, and the "removed" mark together with low rating scores and comments for justification can make you very clear about why it was not removed from your storage by mistakes.

## Usage

This application works with databases stored locally on your device as directories with special, predefined structure.  
You can easily create one following the guide in the application. All database maintenance are done by the application, so you do not have to care about the directory structures.  
However, since this is web application runs in your browser without backend support, the database on your device cannot be updated automatically due to limitation introduced by modern browsers aiming to protect your device. After a modification is made to the database, the download icon will appear on the right hand side of the header bar, which, when clicked, will create and download a zip file containing **changed** files in the database. To make changes persist, extract files from the zip file (unzip it) and overwrite to the database directory.

**NOTE**: This application is now generally functional and we are using it on a daily basis, but it is still not thoroughly tested and the entire risk of using this application is with you. You are _strongly encouraged_ to _make backups_ since your data is priceless. If you noticed some problem in this application, you are welcome to report it via Issues or contribute your fixes via PRs, and we are willing to help as we can.

## Features

- **Frontend Only**: This application runs entirely on your own device, making it independent of the availability of any certain server while minimizing from the very root the change your data might be inspected by anyone other than you, or be locked in to any certain service. Your data is always yours, that's it.
- **Security Baked in**: Keeping the data safe from unauthorized accesses is one of the major concern when developing this application. The database are designed to be always protected by strong encryption, and we are conservative and careful about including new dependencies: no unnecessary dependencies and prefer packages that are widely used and tested and actively developed. However, care should be taken to make these designs effective, please check [security concerns](#security-concern).
- **Flexible**: Entries each item in your database may include is not predefined, but decided by yourself when creating the database. We provide three entry types as building blocks for you to customize your database fulfilling your requirements. All entries can be optional, and can be sorted with configured methods.
  - _string_: Simply anything you want to write. Can be configured as unique.
  - _rating_: A rating with customizable maximum score. A string can be added as justification to the score you rated. You can also predefine rating hints to help yourself making decisions, say a score of 4/5 on the story means "the story is logical and thought-provoking with properly arranged foreshadowing, but still not enough to reach excellence".
  - _tag_: Collection of short strings that you can pick the content for each one of them from existing pool or create new ones. Such entries can be configured to be exclusive, allowing no more than one string to be specified.
- **Sync ready**: As a frontend-only application, we do not provide builtin service to sync across multiple devices. However, loading database from an URL is supported and the database is encrypted and safe to be placed online. You can place it on any file hosting service provider providing predictable, direct links for hosted files to make it accessible across multiple devices. This application is also ready to work with arbitrary file sync service, since the time window when files in the database are modified is fully predictable and controlled by you. Please also check [security concerns](#security-concern) for suggestions.

## Security Concern

The application is designed to be secure and is equipped with powerful, modern cryptographic tools, but certain care must be taken to make sure they actually work. Please check the following suggestions.

- **Do not open your database on untrusted devices**: Just like you should avoid entering any of your confidential information on devices that you cannot trust, you should not open the database there. The operating system can be modified to capture anything you entered together with your database, which is nearly impossible to defend against. Even if the OS can be trusted, running as a web application means that all data are not only managed by the OS but also by the browser, while the browser is usually unaware of the fact that we are operating confidential data. Therefore, as per our threat model, this application should run on devices you fully trust.
- **Use a trusted, modern browser**: The browser is where data is operated, and some cryptographic algorithms used in this application is implemented by the browser. The browser should be trustworthy and up to date so that known bugs affecting the security can have been fixed and fast response can be taken for newly discovered bugs. We recommend [Mozilla Firefox](https://www.firefox.com/).
- **Use a strong password**: The password is all anyone need, other than the database itself, to access data in it. In such case, there is no way to protect your data, even with the most powerful algorithm, if you simply set your password as `123456`. The password should be long enough with multiple categorizes of characters and hard to guess, especially when you are planning to sync it via online services.

## WT Injector

_This section requires basic knowledge about user script programming in JavaScript language._  
Manually checking if each work you encountered on the Internet already exists in your database can be tiring. Since it is common that a few websites are used to acquire information about works, a user script can be written and injected into one of such webpages, checking the database and marking on the page automatically to make it easy.  
Due to the difference between the structure of different webpages, it is no silver bullet that works for each website, and you need to program user script for the website of your choice.  
However, here we introduces WT Injector, which does the boring part for you: providing an user interface for configuring what database and what script should be used on which website, handling database and script updates, injecting your script as specified in the configuration and supplying it with the decrypted and parsed database.  
WT Injector is built and can be acquired from [this first-party URL](https://snake.moe/wt-injector/) following the instructions on it, which also acts as the configuration page after you have installed the injector. Databases and scripts can be configured separately, where databases need to be loaded from URLs which scripts can be either loaded from URLs or stored locally in the configuration. A website, or referred as a host is the configuration, is matched by regular expression specified and will be injected with the script and database selected.  
The script can be either in classic mode or module mode, in which the former is loaded via `eval()` while the later via `import()`. The following interfaces should be returned or exported, according to the type selected, to work with the injector:

```javascript
{
  run: (data: any[]) => Promise<void>;
  stop?: () => Promise<void>;
  reset_data?: (new_data: any[]) => Promise<void>;
}
```

In which `run` launches the script, `stop` terminates the script and `reset_data` provides a faster method to replace the database supplied to the script without performing a full restart of the script. Both `stop` and `reset_data` are optional: without `reset_data`, updating the script or database is done by `stop` and `run` the script, while updating the script or database can only be done by reloading the webpage if `stop` is also missing. The following code snippet illustrates how to make this interface available for the injector:

```javascript
// ------ in classic mode ------
(() => {
  function run(data) {
    // implementation here
  }
  function stop() {
    // implementation here
  }
  function reset_data(new_data) {
    // implementation here
  }
  return {
    run: run,
    stop: stop,
    reset_data: reset_data,
  };
})();
// -----------------------------

// ------ in module mode ------
export function run(data) {
  // implementation here
}
export function stop() {
  // implementation here
}
export function reset_data(new_data) {
  // implementation here
}
// ----------------------------
```

The data supplied to your script is an array of objects, one for each item in your database in the same order as items appears in your database. Entires of the item in database are mapped into the object supplied, where the key is the name of the entry while the value depends on the type of the entry:

- If the type is _string_, the value will be simply the string itself;
- If the type is _tag_, the value will be an array of strings, each corresponding to one tag;
- If the type is _rating_, the value will be an object `{ score: number, comment?: string }`
  Missing optional entries will not appear on the object supplied.

## Building and Developing

This section is intended for people who want to build an instance of this application from scratch and / or to involve in the development of it.

### Building an Instance

This application follows common workflow for frontend application development. We use [bun](https://bun.sh/#getting-started) as package manager, but you are free to try something else if you would like. Use `bun install` to install the dependencies, and your environment should be ready for development.  
There are three configuration files for building this project, one for the main application, another one for the injector and finally one for the injector configuration page. Following scripts are available:

- `build:app`: build the main application
- `build:userscript`: build the injector
- `build:userscript-configure-page`: build the configuration page
- `build`: build everything

### Developing the WT Injector

Here is a checklist to follow before committing any modification to the WT Injector, or practically speaking any modifications to files under `src/extension`.

1. The UserScript version should be updated in most cases when any code file other than index.html, main.ts and ConfigurePage.vue is modified. The version is set in entry.ts.
2. Whenever a breaking change is made to the interface provided by class InjectorConfiguration, increase interface_version by 1 in versions.json. This ensures that the configuration page syncs with the backend user script it depends on.
3. Whenever a change is made to the format of saved (dumped) configuration, increase format_version by 1 in versions.json.

## License

[GNU Affero General Public License](https://www.gnu.org/licenses/agpl-3.0.en.html#license-text)  
For open source dependencies we relies on and their licenses, please check the license page in our application. Also check our package.json file.
