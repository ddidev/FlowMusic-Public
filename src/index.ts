import registerCommands from "./Shared/commands";
import checkPackages from "./Shared/packages";
import ValidateEnv from "./Shared/validate-env";

async function main() {
  const validate = new ValidateEnv();
  await validate.validate();

  await checkPackages();
  await registerCommands();

  import("./Manager/index");
}

main();