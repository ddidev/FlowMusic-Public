import "dotenv/config";

const IsDev = process.argv.includes("--dev");

process.env.FLOW_DEV = IsDev.toString();

//@ts-expect-error
global.IsFlowDev = () => IsDev;

const config: IConfig = {
  nodes: [
    { host: "asd", port: 3001, password: process.env.NODEPW, version: "v3", useVersionPath: true }, // GE1-1
    { host: "asd", port: 3001, password: process.env.NODEPW, version: "v3", useVersionPath: true }, // GE2-1
    { host: "asd", port: 3001, password: process.env.NODEPW, version: "v3", useVersionPath: true } // GE3-1
  ],
  ...(IsDev ? {
    token: process.env.TOKEN_DEV,
    clientId: "1026646388966166609",
    database: {
      user: process.env.MYSQL_USER_DEV,
      password: process.env.MYSQL_PASSWORD_DEV,
      database: process.env.MYSQL_DATABASE_DEV
    },
    nodes: [
      { host: "localhost", port: 8080, version: "v3", useVersionPath: true } // UK-1-Test
    ]
  } : {
    token: process.env.TOKEN_MAIN,
    clientId: "393673098441785349",
    database: {
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    }
  })
};

export const BotListKeys = {
  // Probably didn't finish this.
};

export default config;
