const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { exec } = require("child_process");
const fs = require("fs");
const util = require("util");
const execAsync = util.promisify(exec);
require("dotenv").config();
let fetch;

(async () => {
  try {
    const fetchModule = await import("node-fetch");
    fetch = fetchModule.default;

    const app = express();
    app.use(cors());
    const PORT = process.env.PORT || 5090;
    const IpAddress = process.env.IpAddress || "localhost";
    app.use(express.json());

    const secretKey = process.env.SecretKey || "coral";
    const sourcePath = "/var/www/html/configs/cfg4cdc0d00a350.xml";
    const destinationPath = process.env.SendFilePath || "/opt/Backend_js";
    const destinationUser = "coral";

    const verifyToken = (req, res, next) => {
      const tokenHeader = req.header("Authorization");
      if (!tokenHeader) {
        return res
          .status(401)
          .json({ message: "Access denied, No token provided." });
      }
      if (!tokenHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Invalid token format" });
      }
      const token = tokenHeader.substring(7);
      jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
          return res.status(401).json({ message: "Invalid token" });
        }
        req.user = decoded;
        next();
      });
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

    app.post("/api/devicemanager/linux/reboot",verifyToken, async (req, resp) => {
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

    app.post("/api/devicemanager/linux/filesend",verifyToken, async (req, resp) => {
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

    app.listen(PORT, IpAddress, () => {
      console.log(`RPC Server is running on http://${IpAddress}:${PORT}/rpc`);
    });
  } catch (err) {
    console.error("Failed to import node-fetch:", err);
  }
})();
