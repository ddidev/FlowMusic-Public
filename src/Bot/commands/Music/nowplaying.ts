import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Nowplaying extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "nowplaying",
        description: "View the current song.",
        module: "Music"
      },
      new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription("View the current song.")
    );
  }

  getLength(milliseconds: number) {
    let seconds: string | number = Number((milliseconds / 1000).toFixed(0)),
      minutes: string | number = Math.floor(seconds / 60),
      hours: string | number = 0;

    if (minutes > 59) {
      hours = Math.floor(minutes / 60);
      hours = (hours >= 10) ? hours : "0" + hours;
      minutes = minutes - ((hours as number) * 60);
      minutes = (minutes >= 10) ? minutes : "0" + minutes;
    }

    seconds = Math.floor(seconds % 60);
    seconds = (seconds >= 10) ? seconds : "0" + seconds;

    if (hours != "") return hours + ":" + minutes + ":" + seconds;
    return minutes + ":" + seconds;
  }

  async run(command: CommandInteraction) {
    const member = command.guild.members.cache.get(command.user.id) || (await command.guild.members.fetch(command.user.id));

    if (!member.voice.channel) return command.editReply({ content: "You must be in a voice channel to use this command." });

    const player = this.client.MusicManager.guilds.get(command.guild.id);

    if (!player) return command.editReply({ content: "There is nothing playing." });
    if (!member.voice.channel.members.has(this.client.user.id)) return command.editReply({ content: "You must be in the same voice channel as me to use this command." });

    const guildPlayer = await this.client.MusicManager.getPlayer(command.guild.id, player.channelId, member.voice.channelId),
      song = guildPlayer.queue?.current;

    if (!song) return command.editReply({ content: "There is nothing playing." });

    const buttons = [
      {
        emoji: { name: "flowfavourite", id: "1058955556364234852" },
        style: 3,
        customId: "nowplaying:star",
        disabled: false,
        type: 2
      },
      {
        emoji: { name: "flowrepeat", id: "1058955178767818823" },
        style: guildPlayer.trackRepeat ? 3 : 4,
        customId: "nowplaying:repeat",
        disabled: false,
        type: 2
      },
      {
        emoji: { name: "flowskip", id: "1058955174779031562" },
        style: 1,
        customId: "nowplaying:skip",
        disabled: false,
        type: 2
      },
      {
        emoji: { name: "flowstop", id: "1058955176100237362" },
        style: 4,
        customId: "nowplaying:stop",
        disabled: false,
        type: 2
      }
    ],
      embed = {
        title: "Now Playing",
        color: 0x00ff00,
        thumbnail: {
          url: song.thumbnail
        },
        fields: [
          {
            name: "Track",
            value: `**${song.title}** by **${song.author}**`,
            inline: false
          },
          {
            name: "Duration",
            value: `${this.getLength(Number(guildPlayer.position))}/${this.getLength(Number(song.duration))}`,
            inline: true
          },
          {
            name: "Requested By",
            value: `${song.requester}`,
            inline: true
          },
          {
            name: "Loop",
            value: `${guildPlayer.queueRepeat ? "Looping Queue" : guildPlayer.trackRepeat ? "Looping Track" : "Disabled"}`,
            inline: true
          }
        ]
      },
      response = await command.editReply({
        embeds: [embed],
        components: [
          {
            type: 1,
            components: buttons
          }
        ]
      }),
      filter = (interaction: any) => interaction.customId.startsWith("nowplaying:"),
      collector = response.createMessageComponentCollector({ filter, time: 60000 });

    collector.on("collect", async (interaction) => {
      const guildPlayer = this.client.MusicManager.guilds.get(command.guild.id);

      if (!guildPlayer?.player?.playing) interaction.reply({ content: "There is nothing playing.", ephemeral: true });

      switch (interaction.customId) {
        case "nowplaying:repeat":
          try {
            if (guildPlayer.player.queueRepeat || !guildPlayer.player.trackRepeat) {
              guildPlayer.player.setQueueRepeat(false);
              guildPlayer.player.setTrackRepeat(true);
              await interaction.reply({ content: "Loop has been enabled on the current track.", ephemeral: true });
              this.client.MusicManager.sendMessage(guildPlayer.channelId, `${interaction.user} has enabled loop on the current track.`);

              embed.fields[3].value = "Looping Track";
            } else if (guildPlayer.player.trackRepeat) {
              guildPlayer.player.setTrackRepeat(false);
              await interaction.reply({ content: "Loop has been disabled.", ephemeral: true });
              this.client.MusicManager.sendMessage(guildPlayer.channelId, `${interaction.user} has disabled loop.`);

              embed.fields[3].value = "Disabled";
            }

            await command.editReply({
              embeds: [embed],
              components: [
                {
                  type: 1,
                  components: buttons.map(button => {
                    if (button.customId === "nowplaying:repeat") button.style = (guildPlayer.player.trackRepeat ? 3 : 4);
                    return button;
                  })
                }
              ]
            });
          } catch { }
          break;
        case "nowplaying:skip":
          try {
            guildPlayer.player.stop();
            await interaction.reply({ content: "Skipped the current track.", ephemeral: true });
            this.client.MusicManager.sendMessage(guildPlayer.channelId, `${interaction.user} has skipped the current track.`);

            await command.editReply({
              embeds: [embed],
              components: [
                {
                  type: 1,
                  components: buttons.map(button => {
                    if (button.customId === "nowplaying:skip") button.disabled = true;
                    return button;
                  })
                }
              ]
            });
          } catch { }
          break;
        case "nowplaying:stop":
          try {
            guildPlayer.player.stop();
            guildPlayer.player.disconnect();
            guildPlayer.player.destroy();

            await interaction.reply({ content: "Stopped the player.", ephemeral: true });
            this.client.MusicManager.sendMessage(guildPlayer.channelId, `${interaction.user} has stopped the player.`);

            await command.editReply({
              embeds: [embed],
              components: [
                {
                  type: 1,
                  components: buttons.map(button => {
                    if (button.customId !== "nowplaying:star") button.disabled = true;
                    return button;
                  })
                }
              ]
            });
          } catch { }
          break;
        case "nowplaying:star":
          const id = song.identifier.split("/").pop().split(".").shift(),
            getFavourites = await this.client.db.executeQuery("SELECT * FROM favourites WHERE userId = ? AND spotifyId = ?", [interaction.user.id, id]) as any;

          try {
            if (getFavourites.length > 0) {
              await this.client.db.executeQuery("DELETE FROM favourites WHERE userId = ? AND spotifyId = ?", [interaction.user.id, id]);
              await interaction.reply({ content: "Removed the song from your favourites.", ephemeral: true });
              this.client.MusicManager.sendMessage(guildPlayer.channelId, `${interaction.user} has removed the current song from their favourites.`);
            } else {
              await this.client.db.executeQuery("INSERT INTO favourites (userId, displayName, spotifyId) VALUES (?, ?, ?)", [interaction.user.id, `** ${song.title} ** by ** ${song.author} ** `, id]);
              await interaction.reply({ content: "Added the song to your favourites.", ephemeral: true });
              this.client.MusicManager.sendMessage(guildPlayer.channelId, `${interaction.user} has added the current song to their favourites.`);
            }
          } catch { }
          break;
      }
    });

    collector.on("end", () => {
      response.edit({
        embeds: [embed],
        components: [
          {
            type: 1,
            components: buttons.map((button) => {
              button.disabled = true;
              return button;
            })
          }
        ]
      });
    });
  }
}