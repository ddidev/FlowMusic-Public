import { ChildProcess, Serializable } from "child_process";
import { Client } from "discord.js";
import { Worker } from "worker_threads";

import logger from "../../Shared/structures/Logger";
import { Cluster } from "../Core/Cluster";
import { ClusterClient } from "../Core/ClusterClient";
import { ClusterManager } from "../Core/ClusterManager";
import { ChildProcessOptions } from "../Structures/Child";
import { BaseMessage } from "../Structures/IPCMessage";

export const Events = {
  ERROR: "warn",
  WARN: "error"
};

export const DefaultOptions = {
  http: {
    api: "https://discord.com/api",
    version: "10"
  }
};

export const Endpoints = {
  botGateway: "/gateway/bot"
};

export enum messageType {
  "MISSING_TYPE",
  "CUSTOM_REQUEST",
  "CUSTOM_MESSAGE",
  "CUSTOM_REPLY",
  "HEARTBEAT",
  "HEARTBEAT_ACK",
  "CLIENT_BROADCAST_REQUEST",
  "CLIENT_BROADCAST_RESPONSE",
  "CLIENT_RESPAWN",
  "CLIENT_RESPAWN_ALL",
  "CLIENT_MAINTENANCE",
  "CLIENT_MAINTENANCE_ENABLE",
  "CLIENT_MAINTENANCE_DISABLE",
  "CLIENT_MAINTENANCE_ALL",
  "CLIENT_SPAWN_NEXT_CLUSTER",
  "CLIENT_READY",
  "CLIENT_EVAL_REQUEST",
  "CLIENT_EVAL_RESPONSE",
  "CLIENT_MANAGER_EVAL_REQUEST",
  "CLIENT_MANAGER_EVAL_RESPONSE",
  "MANAGER_BROADCAST_REQUEST",
  "MANAGER_BROADCAST_RESPONSE",
}

export interface evalOptions<T = object> {
  cluster?: number | number[];
  shard?: number;
  guildId?: string;
  context?: T;
  timeout?: number;
  _type?: messageType;
}

export type Awaitable<T> = T | PromiseLike<T>;

export type Serialized<T> = T extends symbol | bigint | (() => any)
  ? never
  : T extends number | string | boolean | undefined
  ? T
  : T extends { toJSON(): infer R }
  ? R
  : T extends ReadonlyArray<infer V>
  ? Serialized<V>[]
  : { [K in keyof T]: Serialized<T[K]> };

export interface ClusterSpawnOptions {
  delay?: number;
  timeout?: number;
}

export interface ClusterManagerSpawnOptions extends ClusterSpawnOptions {
  amount?: number | "auto";
}

export interface ClusterManagerOptions {
  token?: string;
  totalShards?: number | "auto";
  totalClusters?: number | "auto";
  shardsPerClusters?: number;
  shardArgs?: string[];
  execArgv?: string[];
  respawn?: boolean;
  mode?: "process";
  shardList?: number[];
  clusterList?: number[];
  restarts?: ClusterRestartOptions;
  queue?: QueueOptions;
  spawnOptions?: ClusterManagerSpawnOptions;
  clusterData?: object;
  clusterOptions?: ChildProcessOptions;
  logger?: logger;
}

export interface ClusterRestartOptions {
  max: number;
  interval: number;
  current?: number;
}

export interface QueueOptions {
  auto: boolean;
  timeout?: number;
}

export interface ClusterKillOptions {
  reason?: string;
  force: boolean;
}

export interface Plugin {
  build(manager: ClusterManager): void;
}

export interface ClusterManagerEvents {
  clusterCreate: [cluster: Cluster];
  clusterReady: [cluster: Cluster];
  debug: [debugMessage: string];
}

export interface ClusterEvents {
  message: [message: BaseMessage | Serializable];
  clientRequest: [message: BaseMessage | Serializable];
  death: [cluster: Cluster, thread: ChildProcess | Worker | undefined | null];
  error: [error: Error];
  spawn: [thread: ChildProcess | Worker | undefined | null];
}

export interface ClusterClientEvents<DiscordClient> {
  message: [message: BaseMessage | Serializable];
  ready: [clusterClient: ClusterClient<DiscordClient>];
}

export interface DjsDiscordClient extends Client { }
