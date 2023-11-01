import { Cluster } from "../Core/Cluster";
import { ClusterClient } from "../Core/ClusterClient";
import { ClusterManager } from "../Core/ClusterManager";
import { messageType } from "../types/shared";
import { makePlainError } from "../Util/Util";
import { Child, ChildClient } from "./Child";
import { RawMessage } from "./IPCMessage";
import { ResolveMessage } from "./PromiseHandler";

export class ClusterHandler {
  manager: ClusterManager;
  cluster: Cluster;
  ipc: Child;

  constructor(manager: ClusterManager, cluster: Cluster, ipc: Child) {
    this.manager = manager;
    this.cluster = cluster;
    this.ipc = ipc;
  }

  handleMessage(message: RawMessage) {
    switch (message._type) {
      case messageType.CLIENT_READY:
        this.cluster.ready = true;
        this.cluster.emit("ready");
        this.cluster.manager._debug("Ready", this.cluster.id);
        return;
      case messageType.CLIENT_BROADCAST_REQUEST:
        this.cluster.manager
          .broadcastEval(message._eval, message.options)
          .then(results => {
            this.ipc.send({
              nonce: message.nonce,
              _type: messageType.CLIENT_BROADCAST_RESPONSE,
              _result: results
            });
          })
          .catch(err => {
            this.ipc.send({
              nonce: message.nonce,
              _type: messageType.CLIENT_BROADCAST_RESPONSE,
              _error: makePlainError(err)
            });
          });
        return;
      case messageType.CLIENT_MANAGER_EVAL_REQUEST:
        this.cluster.manager.evalOnManager(message._eval).then(result => {
          this.ipc.send({
            nonce: message.nonce,
            _type: messageType.CLIENT_MANAGER_EVAL_RESPONSE,
            _result: result._error ? makePlainError(result._error) : result._result
          });
        });
        return;
      case messageType.CLIENT_EVAL_RESPONSE:
      case messageType.CUSTOM_REPLY:
        this.cluster.manager.promise.resolve(message as ResolveMessage);
        return;
      case messageType.CLIENT_RESPAWN_ALL:
        this.cluster.manager.respawnAll(message.options);
        return;
      case messageType.CLIENT_RESPAWN:
        this.cluster.respawn(message.options);
        return;
      case messageType.CLIENT_MAINTENANCE:
        this.cluster.triggerMaintenance(message.maintenance);
        return;
      case messageType.CLIENT_MAINTENANCE_ALL:
        this.cluster.manager.triggerMaintenance(message.maintenance);
        return;
      case messageType.CLIENT_SPAWN_NEXT_CLUSTER:
        this.cluster.manager.queue.next();
        return;
      case messageType.HEARTBEAT_ACK:
        this.cluster.manager.heartbeat?.ack(this.cluster.id, message.date);
        return;
      default:
        return true;
    }
  }
}

export class ClusterClientHandler<DiscordClient> {
  client: ClusterClient<DiscordClient>;
  ipc: ChildClient | null;

  constructor(client: ClusterClient<DiscordClient>, ipc: ChildClient | null) {
    this.client = client;
    this.ipc = ipc;
  }

  public async handleMessage(message: ResolveMessage & { date?: number; maintenance?: string }) {
    switch (message._type) {
      case messageType.CLIENT_EVAL_REQUEST:
        try {
          if (!message._eval) throw new Error("Eval Script not provided");
          this.client._respond("eval", {
            _eval: message._eval,
            _result: await this.client._eval(message._eval),
            _type: messageType.CLIENT_EVAL_RESPONSE,
            nonce: message.nonce
          });
        } catch (err) {
          this.client._respond("eval", {
            _eval: message._eval,
            _error: makePlainError(err),
            _type: messageType.CLIENT_EVAL_RESPONSE,
            nonce: message.nonce
          });
        }
        return null;
      case messageType.CLIENT_MANAGER_EVAL_RESPONSE:
      case messageType.CLIENT_BROADCAST_RESPONSE:
        this.client.promise.resolve({ _result: message._result, _error: message._error, nonce: message.nonce });
        return null;
      case messageType.HEARTBEAT:
        this.client.send({ _type: messageType.HEARTBEAT_ACK, date: message.date });
        return null;
      case messageType.CLIENT_MAINTENANCE_DISABLE:
        this.client.maintenance = false;
        this.client.triggerClusterReady();
        return null;
      case messageType.CLIENT_MAINTENANCE_ENABLE:
        this.client.maintenance = message.maintenance || true;
        return null;
      case messageType.CUSTOM_REPLY:
        this.client.promise.resolve(message);
        return null;
      default:
        return true;
    }
  }
}
