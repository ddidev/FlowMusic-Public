import { ClientEvents } from "discord.js";

import DiscordClient from "./DiscordClient";

export default abstract class Event {
  readonly client: DiscordClient;
  readonly name: keyof ClientEvents;
  readonly logCategory: string | false;

  constructor(client: DiscordClient, name: keyof ClientEvents, logCategory: string | false) {
    this.client = client;
    this.name = name;
    this.logCategory = logCategory;
  }

  abstract run(...params: any | undefined): Promise<any>;
}