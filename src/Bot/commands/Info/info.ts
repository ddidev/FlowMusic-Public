import "moment-duration-format";

import { CommandInteraction, OAuth2Scopes, SlashCommandBuilder } from "discord.js";
import moment from "moment";
import SysInfo from "systeminformation";

import { dependencies } from "../../../../package.json";
import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

const djsVersion = dependencies["discord.js"].replace("^", "v");

export default class Info extends Command {
  SysInformation: {
    cpu: SysInfo.Systeminformation.CpuData;
    mem: SysInfo.Systeminformation.MemData;
    system: SysInfo.Systeminformation.SystemData;
    load: SysInfo.Systeminformation.CurrentLoadData;
  };

  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "info",
        description: "Get information about the bot.",
        module: "Information"
      },
      new SlashCommandBuilder()
        .setName("info")
        .setDescription("Get information about the bot.")
    );

    this.updateSysStats();
    setInterval(() => this.updateSysStats(), 60000);
  }

  async updateSysStats() {
    this.SysInformation = {
      cpu: await SysInfo.cpu(),
      mem: await SysInfo.mem(),
      system: await SysInfo.system(),
      load: await SysInfo.currentLoad()
    };

    return this.SysInformation;
  }

  async run(command: CommandInteraction) {
    let nodeId = 0;

    const SysInformation = this.SysInformation || await this.updateSysStats(),

      total = this.client.MusicManager.manager.nodes.reduce((a, b) => (a || 0) + b?.stats?.players || 0, 0),
      embed = {
        author: {
          name: "Flow Music - Information",
          icon_url: this.client.user.displayAvatarURL()
        },
        description: `Flow Music is a bot allowing users to listen to their favorite songs and streams on Discord via Spotify!\n[Support Server](https://discord.gg/bSJKjtMKJR) • [Invite](${this.client.generateInvite({ scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands], permissions: ["Administrator", "Connect", "Speak"] })}) • [Upvote](https://top.gg/bot/${this.client.user.id}/vote)`,
        color: 0x1AFFF0,
        fields: [
          {
            name: "Client",
            value: `\`\`\`ansi
${this.formatColor("Servers", String(this.client.sharedStats.guilds).replace(/\B(?=(\d{3})+(?!\d))/g, ","))}
${this.formatColor("Shard", `#${command.guild.shardId} (Total: ${this.client.options.shardCount})`)}
${this.formatColor("Cluster", `#${this.client.cluster.id} (Total: ${this.client.cluster.count})`)}
${this.formatColor("Command Uses", String(this.client.sharedStats.commandUses).replace(/\B(?=(\d{3})+(?!\d))/g, ","))}
\`\`\``,
            inline: true
          },
          {
            name: "System",
            value: `\`\`\`ansi
${this.formatColor("CPU", `${Math.round(SysInformation.load.currentLoad)}% (${SysInformation.cpu.cores} cores)`)}
${this.formatColor("RAM", `${Math.round(SysInformation.mem.used / 1024 / 1024)}/${Math.round(SysInformation.mem.total / 1024 / 1024)} (MB)`)}
${this.formatColor("Node.js", process.version)}
${this.formatColor("Discord.js", djsVersion)}
\`\`\``,
            inline: true
          },
          {
            name: "Uptime",
            // @ts-ignore
            value: `\`\`\`${moment.duration(this.client.uptime).format("d [days] h [hours] m [minutes] s [seconds]")}\`\`\``
          },
          {
            name: "Players",
            value: `\`\`\`ansi
${this.formatColor("Cluster", String(Math.floor(total / this.client.cluster.count)))} • ${this.formatColor("Total", String(total))}
\`\`\``,
            inline: false
          },
          ...this.client.MusicManager.manager.nodes.map(node => ({
            name: `Audio Node ${++nodeId}`,
            value: `\`\`\`ansi
${this.formatColor("CPU", node.stats.cpu ? `${Math.round(node.stats.cpu.systemLoad * 100)}% (${node.stats.cpu.cores} cores)` : "N/A")}
${this.formatColor("RAM", node.stats.memory ? `${Math.round(node.stats.memory.used / 1024 / 1024)}/${Math.round(node.stats.memory.reservable / 1024 / 1024)} (MB)` : "N/A")}
${this.formatColor("Players", node.stats.players)}
${this.formatColor("State", node.connected ? "Connected" : "Disconnected")}
` + // @ts-ignore
              `${this.formatColor("Uptime", moment.duration(node.stats.uptime).format("d [days] h [hours] m [minutes] s [seconds]"))}
\`\`\``,
            inline: true
          }))
        ],
        footer: {
          text: `Flow Music • Requested by ${command.user.tag}`,
          icon_url: command.user.displayAvatarURL()
        }
      };

    await command.editReply({ embeds: [embed] });
  }

  formatColor(name, value) {
    return `[1;2m[1;31m${name}[0m[0m[2;36m:[0m [2;34m${value}[0m`;
  }
}