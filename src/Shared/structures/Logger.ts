import debug from "debug";

class Logger {
  logger: debug.Debugger;
  info: debug.Debugger;
  debug: debug.Debugger;
  error: debug.Debugger;
  warn: debug.Debugger;
  success: debug.Debugger;
  init: debug.Debugger;
  extensions: { [key: string]: debug.Debugger };

  constructor(prefix: string) {
    debug.enable("*,-require-in-the-middle,-follow-redirects");
    debug.skips.push(RegExp("^require-in-the-middle$"), RegExp("^follow-redirects$"));
    this.logger = debug(prefix);

    this.info = this.logger.extend("info");
    this.debug = this.logger.extend("debug");
    this.error = this.logger.extend("error");
    this.warn = this.logger.extend("warn");
    this.success = this.logger.extend("success");
    this.init = this.logger.extend("init");

    this.info.color = "4";
    this.debug.color = "8";
    this.error.color = "1";
    this.warn.color = "166";
    this.success.color = "10";
    this.init.color = "3";

    this.extensions = {};
  }

  log(prefix: any, ...args: any[]) {
    if (!this.extensions[prefix]) this.extensions[prefix] = this.logger.extend(String(prefix));

    const logger = this.extensions[prefix];

    logger.call(null, ...args);
  }
}

export default Logger;