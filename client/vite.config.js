import { defineConfig } from "vite";
import fs from "fs";
import path from "path";

export default defineConfig({
  server: {
    host: true,
    https: {
      key: fs.readFileSync(path.resolve("../certs/key.pem")),
      cert: fs.readFileSync(path.resolve("../certs/cert.pem")),
    },
  },
});