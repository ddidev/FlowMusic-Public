import { Client } from "discord.js";

import { ClusterClient } from "../../Manager/Core/ClusterClient";
import Database from "../../Shared/structures/Database";
import Logger from "../../Shared/structures/Logger";
import MusicManager from "../classes/music";
import Registry from "../classes/registry";

export default class DiscordClient extends Client {
  // @ts-ignore
  declare readonly options: BotOptions;

  public commandIds: { [key: string]: string } = {};
  public readonly config: IConfig = require("../../config").default;
  public readonly MusicManager = new MusicManager(this);
  public readonly registry = new Registry(this);
  public readonly logger = new Logger("client");

  public db: Database;
  public cluster: ClusterClient<DiscordClient>;
  public sharedStats: SharedStats = {
    players: {
      shard: 0,
      total: 0
    },
    guilds: 0,
    commandUses: 0
  };

  constructor(options: BotOptions) {
    super(options);
  }

  async start() {
    this.registry.registerAll();
    this.db = new Database(this.config, this.config.database.database);

    super.login(this.config.token).catch(err => {
      this.logger.error("Failed to start client:");
      this.logger.error(err);
      process.exit(0);
    });
  }
}