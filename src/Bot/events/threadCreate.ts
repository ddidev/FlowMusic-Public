import { ThreadChannel } from "discord.js";

import DiscordClient from "../structures/DiscordClient";
import Event from "../structures/Event";

export default class ThreadCreateEvent extends Event {
  constructor(client: DiscordClient) {
    super(client, "threadCreate", false);
  }

  async run(thread: ThreadChannel) {
    try {
      if (thread.joinable && !thread.joined) await thread.join();
    } catch { }
  }
}