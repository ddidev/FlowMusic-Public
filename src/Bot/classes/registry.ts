import { Collection } from "discord.js";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import requireAll from "require-all";

import Logger from "../../Shared/structures/Logger";
import Command from "../structures/Command";
import DiscordClient from "../structures/DiscordClient";
import Event from "../structures/Event";
import { isConstructor } from "../utils/functions";

const logger = new Logger("registry");

export default class Registry {
  private client: DiscordClient;
  private commands: Collection<string, Command>;
  private events: Collection<string, Event>;
  private commandPaths: string[] = [];
  private eventPaths: string[] = [];
  private modules: Collection<string, string[]>;
  private autocomplete: Collection<string, (interaction) => Promise<{ name: string; value: string }[]>>;

  private newCollections() {
    this.commands = new Collection<string, Command>();
    this.events = new Collection<string, Event>();
    this.modules = new Collection<string, string[]>();
    this.autocomplete = new Collection<string, (interaction) => Promise<{ name: string; value: string }[]>>();
  }

  constructor(client: DiscordClient) {
    this.client = client;
    this.newCollections();
  }

  private registerEvent(event: Event) {
    this.events.set(event.name, event);
    this.client.on(event.name, event.run.bind(event));
  }

  private registerAllEvents() {
    const events: any[] = [];

    if (this.eventPaths.length)
      this.eventPaths.forEach(p => delete require.cache[p]);

    requireAll({
      dirname: process.cwd() + "/dist/Bot/events",
      recursive: true,
      filter: /(\w*.[tj]s)$/g,
      resolve: x => events.push(x),
      map: (name, filePath) => {
        if (filePath.endsWith(".ts") || filePath.endsWith(".js")) this.eventPaths.push(path.resolve(filePath));
        return name;
      }
    });

    for (const event of events) {
      const valid = isConstructor(event, Event) || isConstructor(event.default, Event) || event instanceof Event || event.default instanceof Event;

      if (!valid) continue;

      let eventObj;

      if (isConstructor(event, Event)) eventObj = new event(this.client);
      else if (isConstructor(event.default, Event)) eventObj = new event.default(this.client);

      if (!(eventObj instanceof Event)) logger.error(`Invalid event object to register: ${event}`);

      this.registerEvent(eventObj);
    }
  }

  private registerCommand(command: Command) {
    if (this.commands.some(x => {
      if (x.data.name === command.data.name) return true;
      else return false;
    })) this.commands.set(command.data.name, command);

    this.commands.set(command.data.name, command);

    if (!this.modules.has(command.info.module)) this.modules.set(command.info.module, [command.data.name]);
    else {
      const modules = this.modules.get(command.info.module);
      modules.push(command.data.name);
      this.modules.set(command.info.module, modules);
    }

    if (command.info.autocomplete) this.autocomplete.set(command.data.name, command.info.autocomplete);
  }

  private registerAllCommands() {
    const commands: any[] = [];

    if (this.commandPaths.length) this.commandPaths.forEach(p => delete require.cache[p]);

    requireAll({
      dirname: process.cwd() + "/dist/Bot/commands",
      recursive: true,
      filter: /(\w*.[tj]s)$/g,
      resolve: x => commands.push(x),
      map: (name, filePath) => {
        if (filePath.endsWith(".ts") || filePath.endsWith(".js")) this.commandPaths.push(path.resolve(filePath));
        return name;
      }
    });

    for (const command of commands) {
      const valid = isConstructor(command, Command) || isConstructor(command.default, Command) || command instanceof Command || command.default instanceof Command;

      if (!valid) continue;

      let commandObj;

      if (isConstructor(command, Command)) commandObj = new command(this.client);
      else if (isConstructor(command.default, Command)) commandObj = new command.default(this.client);

      if (!(commandObj instanceof Command)) logger.error(`Invalid command object to register: ${command}`);

      this.registerCommand(commandObj);
    }
  }

  getAllCommandNames() { return [...this.commands.keys()] }

  registerAll() {
    this.registerAllCommands();
    this.registerAllEvents();

    if (process.argv.includes("--cmds")) {
      const currentCommands = readFileSync(`${process.cwd()}/data/commands.json`, "utf-8");
      writeFileSync(`${process.cwd()}/data/commands.json`, JSON.stringify({ local: this.commands.map(command => command.data.toJSON()), registered: JSON.parse(currentCommands).registered || {} }, null, 2));
    }
  }

  reregisterAll() {
    const allEvents = [...this.events.keys()];
    allEvents.forEach(event => this.client.removeAllListeners(event));
    this.newCollections();
    this.registerAll();
  }

  findCommandsInModule(module: string): string[] | undefined { return this.modules.get(module) }
  findCommand(command: string): Command | undefined { return this.commands.get(command) }
  getAllModuleNames() { return [...this.modules.keys()] }
  getAutocomplete() { return this.autocomplete }
}