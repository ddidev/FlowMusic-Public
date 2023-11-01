import mysql from "serverless-mysql";

import Logger from "./Logger";

export default class Database {
  private logger: Logger;
  public db: mysql.ServerlessMysql;

  constructor(config: IConfig, db: string) {
    this.logger = new Logger("database");
    this.db = mysql({
      config: {
        host: process.env.MYSQL_IP,
        database: db,
        user: config.database.user,
        password: config.database.password
      }
    });

    this.db.connect();
  }

  async executeQuery(query, values = []) {
    try {
      const results = await this.db.query({
        sql: query,
        values
      });
      return results;
    } catch (error) {
      this.logger.error(`Failed to execute query:${query}`);
      this.logger.error(`Error:\n${error}`);
      return { error };
    }
  }
}