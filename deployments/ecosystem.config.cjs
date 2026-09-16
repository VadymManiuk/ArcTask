const path = require("node:path");
const cwd = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "arctask-reviewed-web", cwd, script: "npm", interpreter: "none",
      args: "start -- -p 3002 -H 127.0.0.1", kill_timeout: 15000,
      env: { NODE_ENV: "production" }
    },
    {
      name: "arctask-reviewed-worker", cwd, script: "npm", interpreter: "none",
      args: "run agent:worker:live", kill_timeout: 15000,
      env: { NODE_ENV: "production" }
    }
  ]
};
