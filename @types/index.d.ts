import type { ClientOptions } from "discord.js";

declare global {
  interface BotOptions extends ClientOptions { }

  interface IConfig {
    readonly token: string;
    readonly clientId: string;
    readonly database: {
      user: string;
      password: string;
      database: string;
    };
    readonly nodes: { host: string, port: number, password?: string, version?: "v2" | "v3" | "v4", useVersionPath?: boolean }[];
  }

  interface ICommandInfo {
    name: string;
    description: string;
    module?: string;
    autocomplete?: (interaction) => Promise<{ name: string; value: string }[]>;
    ephemeral?: boolean;
  }

  interface IGroup {
    name: string;
    commands: string[];
  }

  interface Event {
    name: string;
    type: "client" | "rest" | "process";
    handler: (...args: any[]) => void;
  }

  interface SharedStats { players: { shard: number, total: number }, guilds: number, commandUses: number }

  type IsFlowDev = () => boolean;

  interface globalThis {
    IsFlowDev(): boolean;
  }

  const IsFlowDev: IsFlowDev;
}