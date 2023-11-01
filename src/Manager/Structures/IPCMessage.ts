import { Cluster } from "../Core/Cluster";
import { ClusterClient } from "../Core/ClusterClient";
import { messageType } from "../types/shared";
import { generateNonce } from "../Util/Util";

export interface RawMessage {
  nonce?: string;
  _type?: number;
  [x: string]: any;
}

export class BaseMessage {
  [x: string]: any;
  nonce: string;
  private readonly _raw: RawMessage;

  constructor(message: RawMessage) {
    this.nonce = message.nonce || generateNonce();
    message.nonce = this.nonce;
    this._raw = this.destructMessage(message);
  }

  private destructMessage(message: RawMessage) {
    for (const [key, value] of Object.entries(message)) this[key] = value;

    if (message.nonce) this.nonce = message.nonce;
    this._type = message._type || messageType.CUSTOM_MESSAGE;
    return message;
  }

  public toJSON() {
    return this._raw;
  }
}

export class IPCMessage extends BaseMessage {
  raw: RawMessage;
  instance: ClusterClient<any> | Cluster;
  constructor(instance: ClusterClient<any> | Cluster, message: RawMessage) {
    super(message);

    this.instance = instance;
    this.raw = new BaseMessage(message).toJSON();
  }

  public async send(message: object) {
    if (typeof message !== "object") throw new TypeError("The Message has to be a object");
    const baseMessage = new BaseMessage({ ...message, _type: messageType.CUSTOM_MESSAGE });
    return this.instance.send(baseMessage.toJSON());
  }

  public async request(message: object) {
    if (typeof message !== "object") throw new TypeError("The Message has to be a object");
    const baseMessage = new BaseMessage({ ...message, _type: messageType.CUSTOM_REQUEST, nonce: this.nonce });
    return this.instance.request(baseMessage.toJSON());
  }

  public async reply(message: object) {
    if (typeof message !== "object") throw new TypeError("The Message has to be a object");
    const baseMessage = new BaseMessage({
      ...message,
      _type: messageType.CUSTOM_REPLY,
      nonce: this.nonce,
      _result: message
    });
    return this.instance.send(baseMessage.toJSON());
  }
}
