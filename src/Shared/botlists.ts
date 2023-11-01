import axios from "axios";

// import BotListAPI from "blapi";
// import { existsSync } from "fs";
import config from "../config";
import { ClusterManager } from "../Manager/Core/ClusterManager";
import Database from "./structures/Database";

const db = new Database(config, config.database.database);

// async function GetLists() {
// 	return new Promise(resolve => {
// 		if (existsSync(`${process.cwd()}/data/botlists.json`)) {
// 			const data = require(`${process.cwd()}/data/botlists.json`);
// 			resolve(data);
// 		} else resolve([]);
// 	});
// }

async function GetClusterData() {
	return await db.executeQuery("SELECT SUM(guild_count) AS guild_count, SUM(shard_count) AS shard_count FROM clusters");
}

async function SendData(manager: ClusterManager) {
	// const botlists = await GetLists() as apiKeysObject,
	const clusterData = await GetClusterData() as clusterDataObject;

	if (IsFlowDev()) return console.log("Not posting stats to botlists because this is a dev build.");

	// TODO: Test botlistsapi with top.gg
	axios.post("https://top.gg/api/bots/393673098441785349/stats", {
		server_count: clusterData.guild_count,
		shard_count: clusterData.shard_count
	}, {
		headers: {
			Authorization: process.env.TOPGG
		}
	})
		.catch(err => console.log("Failed to post stats to top.gg: " + err));

	// BotListAPI.manualPost(clusterData.guild_count, config.clientId, botlists, manager.totalShards, manager.totalShards, manager.shardList);
}

export function StartData(manager: ClusterManager) {
	SendData(manager);
	setInterval(() => SendData(manager), 15 * 60 * 1000);
}

type apiKeysObject = {
	[listname: string]: string;
};

type clusterDataObject = {
	guild_count: number;
	shard_count: number;
};