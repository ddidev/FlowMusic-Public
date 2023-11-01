import dotenv from "dotenv";

import logger from "./structures/Logger";

const log = new logger("validate-env");

export default class ValidateEnv {
  env: NodeJS.ProcessEnv;

  constructor() {
    dotenv.config();
    this.env = process.env;
  }

  async validate(): Promise<boolean> {
    const missing = [],
      invalid = [],
      required = ["TOKEN_DEV", "TOKEN_MAIN", "LAVALINK", "LAVALINK_PASSWORD", "MYSQL_IP", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE_DEV", "MYSQL_DATABASE", "GENIUS_API", "TOPGG"],
      reqExp = { TOKEN: /[OT][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}/g };

    if (process.argv.includes("--dev"))
      required.push("TOKEN_DEV");
    else
      required.push("TOKEN_MAIN");

    for (const key of required) {
      if (!this.env[key]) missing.push(key);
      else if (reqExp[key] && !reqExp[key].test(this.env[key])) invalid.push(key);
    }

    for (const key of missing) log.error(`Missing ${key} environment variable.`);
    for (const key of invalid) log.error(`Invalid ${key} environment variable.`);

    if (missing[0] || invalid[0]) process.exit(0);

    return true;
  }
}
