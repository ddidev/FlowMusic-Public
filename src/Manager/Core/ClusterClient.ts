import { Serializable } from "child_process";
import EventEmitter from "events";

import { ClusterManager as Manager } from "../Core/ClusterManager";
import { ChildClient } from "../Structures/Child";
import { getInfo } from "../Structures/Data";
import { ClusterClientHandler } from "../Structures/IPCHandler";
import { BaseMessage, IPCMessage, RawMessage } from "../Structures/IPCMessage";
import { PromiseHandler } from "../Structures/PromiseHandler";
import {
  Awaitable, ClusterClientEvents, evalOptions, Events, messageType, Serialized
} from "../types/shared";
import { generateNonce } from "../Util/Util";

export class ClusterClient<DiscordClient> extends EventEmitter {
  client: DiscordClient;
  mode: "process";
  queue: { mode: "auto" | string | undefined };
  maintenance: string | undefined | boolean;
  ready: boolean;
  process: ChildClient | null;
  messageHandler: any;
  promise: PromiseHandler;
  constructor(client: DiscordClient) {
    super();

    this.client = client;

    this.queue = {
      mode: "process"
    };

    this.maintenance = this.info.MAINTENANCE;
    if (this.maintenance === "undefined") this.maintenance = false;
    if (!this.maintenance) setTimeout(() => this.triggerClusterReady(), 100);

    this.ready = false;

    this.process = null;
    this.process = new ChildClient();

    this.messageHandler = new ClusterClientHandler<DiscordClient>(this, this.process);

    this.promise = new PromiseHandler();

    this.process?.ipc?.on("message", this._handleMessage.bind(this));

    // @ts-ignore
    client.on?.("ready", () => {
      this.triggerReady();
    });
  }

  public get id() {
    return this.info.CLUSTER;
  }

  public get ids() {
    // @ts-ignore
    if (!this.client.ws) return this.info.SHARD_LIST;
    // @ts-ignore
    return this.client.ws.shards;
  }

  public get count() {
    return this.info.CLUSTER_COUNT;
  }

  public get info() {
    return getInfo();
  }

  public send(message: Serializable) {
    if (typeof message === "object") message = new BaseMessage(message).toJSON();
    return this.process?.send(message);
  }

  public fetchClientValues(prop: string, cluster?: number) {
    return this.broadcastEval(`this.${prop}`, { cluster });
  }

  public evalOnManager(script: string): Promise<any[]>;
  public evalOnManager(script: string, options?: evalOptions): Promise<any>;
  public evalOnManager<T>(fn: (manager: Manager) => T, options?: evalOptions): Promise<T>;
  public evalOnManager<T>(fn: (manager: Manager) => T, options?: evalOptions): Promise<any[]>;
  public async evalOnManager<T>(script: string | ((manager: Manager) => T), options?: evalOptions) {
    const evalOptions = options || { _type: undefined };
    evalOptions._type = messageType.CLIENT_MANAGER_EVAL_REQUEST;

    return await this.broadcastEval(script as string, evalOptions);
  }

  public broadcastEval(script: string): Promise<any[]>;
  public broadcastEval(script: string, options?: evalOptions): Promise<any>;
  public broadcastEval<T>(fn: (client: DiscordClient) => Awaitable<T>): Promise<Serialized<T>[]>;
  public broadcastEval<T>(
    fn: (client: DiscordClient) => Awaitable<T>,
    options?: { cluster?: number; timeout?: number },
  ): Promise<Serialized<T>>;
  public broadcastEval<T, P>(
    fn: (client: DiscordClient, context: Serialized<P>) => Awaitable<T>,
    options?: evalOptions<P>,
  ): Promise<Serialized<T>[]>;
  public broadcastEval<T, P>(
    fn: (client: DiscordClient, context: Serialized<P>) => Awaitable<T>,
    options?: evalOptions<P>,
  ): Promise<Serialized<T>>;
  public async broadcastEval<T, P>(
    script:
      | string
      | ((client: DiscordClient, context?: Serialized<P>) => Awaitable<T> | Promise<Serialized<T>>),
    options?: evalOptions | evalOptions<P>
  ) {
    if (!script)
      throw new TypeError(
        "Script for BroadcastEvaling has not been provided or must be a valid String/Function!"
      );

    const broadcastOptions = options || { context: undefined, _type: undefined, timeout: undefined };
    script =
      typeof script === "function" ? `(${script})(this, ${JSON.stringify(broadcastOptions.context)})` : script;
    const nonce = generateNonce(),
      message = {
        nonce,
        _eval: script,
        options,
        _type: broadcastOptions._type || messageType.CLIENT_BROADCAST_REQUEST
      };
    await this.send(message);

    return await this.promise.create(message, broadcastOptions);
  }

  public request(message: RawMessage) {
    const rawMessage = message || { _type: undefined };
    rawMessage._type = messageType.CUSTOM_REQUEST;
    this.send(rawMessage);
    return this.promise.create(rawMessage, {});
  }

  public respawnAll({ clusterDelay = 5000, respawnDelay = 7000, timeout = 30000 } = {}) {
    return this.send({ _type: messageType.CLIENT_RESPAWN_ALL, options: { clusterDelay, respawnDelay, timeout } });
  }

  private async _handleMessage(message: RawMessage) {
    if (!message) return;
    const emit = await this.messageHandler.handleMessage(message);
    if (!emit) return;
    let emitMessage;
    if (typeof message === "object") emitMessage = new IPCMessage(this, message);
    else emitMessage = message;

    this.emit("message", emitMessage);
  }

  public async _eval(script: string) {
    // @ts-ignore
    if (this.client._eval) return await this.client._eval(script);

    // @ts-ignore
    this.client._eval = function (_: string) {
      return eval(_);
    }.bind(this.client);
    // @ts-ignore
    return await this.client._eval(script);
  }

  public _respond(type: string, message: Serializable) {
    this.send(message)?.catch(err => {
      const error = { err, message: "" };

      error.message = `Error when sending ${type} response to master process: ${err.message}`;

      // @ts-ignore
      this.client.emit?.(Events.ERROR, error);
    });
  }

  public triggerReady() {
    this.process?.send({ _type: messageType.CLIENT_READY });
    this.ready = true;
    return this.ready;
  }

  public triggerClusterReady() {
    this.emit("ready", this);
    return true;
  }

  public triggerMaintenance(maintenance: string, all = false) {
    let _type = messageType.CLIENT_MAINTENANCE;
    if (all) _type = messageType.CLIENT_MAINTENANCE_ALL;
    this.process?.send({ _type, maintenance });
    this.maintenance = maintenance;
    return this.maintenance;
  }

  public spawnNextCluster() {
    if (this.queue.mode === "auto")
      throw new Error("Next Cluster can just be spawned when the queue is not on auto mode.");
    return this.process?.send({ _type: messageType.CLIENT_SPAWN_NEXT_CLUSTER });
  }

  public static getInfo() {
    return getInfo();
  }
}

export interface ClusterClient<DiscordClient> {
  emit: (<K extends keyof ClusterClientEvents<DiscordClient>>(event: K, ...args: ClusterClientEvents<DiscordClient>[K]) => boolean) &
  (<S extends string | symbol>(event: Exclude<S, keyof ClusterClientEvents<DiscordClient>>, ...args: any[]) => boolean);

  off: (<K extends keyof ClusterClientEvents<DiscordClient>>(
    event: K,
    listener: (...args: ClusterClientEvents<DiscordClient>[K]) => void,
  ) => this) &
  (<S extends string | symbol>(
    event: Exclude<S, keyof ClusterClientEvents<DiscordClient>>,
    listener: (...args: any[]) => void,
  ) => this);

  on: (<K extends keyof ClusterClientEvents<DiscordClient>>(event: K, listener: (...args: ClusterClientEvents<DiscordClient>[K]) => void) => this) &
  (<S extends string | symbol>(
    event: Exclude<S, keyof ClusterClientEvents<DiscordClient>>,
    listener: (...args: any[]) => void,
  ) => this);

  once: (<K extends keyof ClusterClientEvents<DiscordClient>>(
    event: K,
    listener: (...args: ClusterClientEvents<DiscordClient>[K]) => void,
  ) => this) &
  (<S extends string | symbol>(
    event: Exclude<S, keyof ClusterClientEvents<DiscordClient>>,
    listener: (...args: any[]) => void,
  ) => this);

  removeAllListeners: (<K extends keyof ClusterClientEvents<DiscordClient>>(event?: K) => this) &
  (<S extends string | symbol>(event?: Exclude<S, keyof ClusterClientEvents<DiscordClient>>) => this);
}
