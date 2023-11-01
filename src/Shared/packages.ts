import { exec } from "child_process";
import { writeFileSync } from "fs";

import logger from "./structures/Logger";

const log = new logger("packages"),
  checkPackages = async () => new Promise(resolve => {
    exec("yarn outdated", async (err, stdout) => {
      if (!err || !stdout.split("\n").filter(x => x !== "")[0]) resolve(false);
      else {
        log.info(`There is ${stdout.split("\n").filter(x => x !== "").slice(5).length} outdated packages. (${stdout
          .split("\n")
          .filter(x => x !== "")
          .slice(5)
          .map(x => x.split(" ")[0])
          .join(", ")
        })`);

        const packages = require("../../package.json");

        stdout.split("\n").slice(5).forEach(y => {
          const x = y.split(" ").filter(x => x !== "" && x !== " ");

          if (!x[0]) return;

          if (x[1].split(".")[0] !== x[3].split(".")[0]) return log.debug(`Skipping ${x[0]}, major update detected. (${x[1]} -> ${x[3]})`);

          log.debug(`Updated ${x[0]}, restart to apply. (${x[1]} -> ${x[3]})`);

          packages[x[4]][x[0]] = `^${x[3]}`;

          writeFileSync(`${process.cwd()}/package.json`, JSON.stringify(packages, null, 2));
        });

        resolve(true);
      }
    });
  });

export default checkPackages;
