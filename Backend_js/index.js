const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { exec } = require("child_process");
const fs = require("fs");
const util = require("util");
const execAsync = util.promisify(exec);
let fetch;

(async () => {
  try {
    const fetchModule = await import("node-fetch");
    fetch = fetchModule.default;

    const app = express();
    app.use(cors());
    const PORT = 5090;
    app.use(express.json());

    const SecretKey = "rahulsingh";
    const sourcePath = "/var/www/html/configs/cfg4cdc0d00a350.xml";
    const destinationPath = "/opt/Backend_js";
    const destinationUser = "coral";

    const verifyToken = (req, res, next) => {
      let token = req.header("Authorization");

      if (!token) {
        return res
          .status(401)
          .json({ message: "Access denied, No token provided." });
      }

      if (token.startsWith("Bearer ")) {
        token = token.slice(7);
      }

      console.log(token);
      jwt.verify(
        token,
        SecretKey,
        { algorithms: ["HS512"] },
        (err, decoded) => {
          if (err) {
            console.error("JWT verification error:", err.message);
            return res
              .status(401)
              .json({ message: "Token verification failed." });
          }
          console.log("Decoded JWT payload:", decoded);
          console.log("Username:", decoded.username);
          console.log("Auth Method:", decoded.authMethod);
          console.log("Issued At:", new Date(decoded.iat * 1000));
          s;
          console.log("Expires At:", new Date(decoded.exp * 1000));

          req.decodedToken = decoded;
          next();
        }
      );
    };

    async function sendFileToDevice(
      device,
      sourcePath,
      destinationPath,
      destinationUser
    ) {
      try {
        if (!fs.existsSync(sourcePath)) {
          throw new Error(`Local file does not exist: ${sourcePath}`);
        }
        const scpCommand = `scp ${sourcePath} ${destinationUser}@${device.ip}:${destinationPath}`;
        console.log(`Sending file via SCP: ${scpCommand}`);
        const { stdout, stderr } = await execAsync(scpCommand);
        if (stderr) {
          console.error(`SCP command stderr: ${stderr}`);
          throw new Error(`SCP command stderr: ${stderr}`);
        }
        console.log(
          `File sent successfully to ${device.ip}:${destinationPath}`
        );
      } catch (error) {
        console.error(
          `Error sending file to ${device.ip}:${destinationPath}:`,
          error.message
        );
        throw error;
      }
    }

    async function jsonRPCRequest(url, method, params) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: method,
            params: params,
            id: 1,
          }),
        });
        console.log(response);
        if (response.ok) {
          console.log("RPC command done.");
          return await response.json();
        } else {
          throw new Error("Network response was not ok.");
        }
      } catch (error) {
        throw new Error("Error in jsonRPCRequest:", error.message);
      }
    }

    app.post("/api/devicemanager/linux/reboot", async (req, resp) => {
      console.log("token verified...");
      try {
        const { devices } = req.body;

        if (!devices || !Array.isArray(devices)) {
          return resp.status(400).json({
            success: false,
            message: "Invalid devices array provided.",
          });
        }

        const rebootPromises = devices.map(async (device) => {
          const url = `http://${device.ip}:${device.port}/rpc`;
          try {
            const response = await jsonRPCRequest(url, "reboot", {});
            console.log(
              `Reboot command sent to ${device.ip}:${device.port}. Response:`,
              response.result
            );
            return {
              success: true,
              message: `Reboot command sent to ${device.ip}:${device.port}.`,
              response,
            };
          } catch (error) {
            console.error(
              `Error sending reboot command to ${device.ip}:${device.port}:`,
              error
            );
            return {
              success: false,
              message: `Error sending reboot command to ${device.ip}:${device.port}: ${error.message}`,
            };
          }
        });

        const results = await Promise.all(rebootPromises);

        resp.status(200).json({
          results,
          success: true,
          message: "Reboot process initiated for all devices.",
          results,
        });
      } catch (error) {
        resp
          .status(500)
          .json({ success: false, message: "Internal Server Error." });
        console.error(error.message);
      }
    });

    app.post("/api/devicemanager/linux/filesend", async (req, resp) => {
      try {
        const { devices} =
          req.body;

        if (!devices || !Array.isArray(devices)) {
          return resp.status(400).json({
            success: false,
            message: "Invalid devices array provided.",
          });
        }

        const fileSendPromises = devices.map(async (device) => {
          try {
            await sendFileToDevice(
              device,
              sourcePath,
              destinationPath,
              destinationUser
            );
            return { device, success: true };
          } catch (error) {
            console.error(
              `Error sending file to ${device.ip}:${destinationPath}:`,
              error
            );
            return { device, success: false, error: error.message };
          }
        });

        const results = await Promise.all(fileSendPromises);

        resp.status(200).json({
          success: true,
          message: "File send process initiated for all devices.",
          results,
        });
      } catch (error) {
        resp
          .status(500)
          .json({ success: false, message: "Internal Server Error." });
        console.error(error.message);
      }
    });

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to import node-fetch:", err);
  }
})();
