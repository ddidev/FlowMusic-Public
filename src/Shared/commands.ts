import { Routes } from "discord-api-types/v9";
import { existsSync, writeFileSync } from "fs";

import { REST } from "@discordjs/rest";

import config from "../config";
import Logger from "./structures/Logger";

const logger = new Logger("commands"),
  registerCommands = async () => new Promise(resolve => {
    if (existsSync(`${process.cwd()}/data/commands.json`)) {
      const cmds = require(`${process.cwd()}/data/commands.json`);

      if (cmds.local.length === cmds.registered.length && cmds.local.every((v, i) => v.name === cmds.registered[i].name)) {
        logger.info("No commands need to be updated.");
        return resolve(true);
      }

      if (cmds.local.length > 0) {
        logger.info(`Registering ${cmds.local.length} commands.`);

        new REST({ version: "10" }).setToken(config.token).put(Routes.applicationCommands(config.clientId), { body: cmds.local }).then(() => {
          writeFileSync(`${process.cwd()}/data/commands.json`, JSON.stringify({ local: cmds.local, registered: cmds.local }, null, 2));
          resolve(true);
        }).catch(err => {
          logger.error(`Failed to register commands: ${err}`);
          resolve(false);
        });
      } else {
        logger.info("There are no commands to register.");
        resolve(false);
      }
    } else if (!process.argv.includes("--cmds")) {
      logger.error("Commands file not found, please run the bot with '--dev --cmds'.");
      process.exit(0);
    } else resolve(false);
  });

export default registerCommands;
