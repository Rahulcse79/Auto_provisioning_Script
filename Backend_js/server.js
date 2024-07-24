const express = require("express");
const bodyParser = require("body-parser");
const { JSONRPCServer } = require("json-rpc-2.0");
const { exec } = require("child_process");
const { networkInterfaces } = require("os");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const os = require("os");

const nets = networkInterfaces();
let IpAddress = "localhost";
const app = express();
const server = new JSONRPCServer();
app.use(bodyParser.json());
app.use(cors());
const DHCP_CONFIG_FILE = "/etc/dhcp/dhcpd.conf";

server.addMethod("reboot", () => {
  return new Promise((resolve, reject) => {
    exec("sudo reboot", (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing reboot command: ${error}`);
        reject(error);
      } else {
        console.log("Machine is rebooting...");
        resolve("Machine is rebooting...");
      }
    });
  });
});

app.post("/rpc", (req, res) => {
  const jsonRPCRequest = req.body;

  server
    .receive(jsonRPCRequest)
    .then((jsonRPCResponse) => {
      res.json(jsonRPCResponse);
    })
    .catch((error) => {
      res.status(500).json({ error: error.message });
    });
});

app.post("/submitDHCPConfig", (req, res) => {
  try {
    const dhcpConfig = req.body;
    if (!dhcpConfig) {
      return res.status(400).json({ error: "DHCP configuration data missing" });
    }
    console.log("Received DHCP configuration:", dhcpConfig);

    // Update DHCP configuration file
    const success = updateDHCPConfig(dhcpConfig);

    if (success) {
      res.json({
        status: 0,
        message: "DHCP configuration received and processed successfully",
      });
    } else {
      res.status(500).json({ error: "Failed to update DHCP configuration" });
    }
  } catch (error) {
    console.error("Error processing DHCP configuration:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const getCurrentData = async () => {
  try {
    const interfaces = os.networkInterfaces();
    let subnet, netmask;
    Object.keys(interfaces).forEach((ifaceName) => {
      const iface = interfaces[ifaceName];
      const ipv4Address = iface.find(
        (addr) => !addr.internal && addr.family === "IPv4"
      );

      if (ipv4Address) {
        subnet = ipv4Address.address;
        netmask = ipv4Address.netmask;
      }
    });
    if (subnet && netmask) {
      return { subnet, netmask };
    } else {
      throw new Error("Unable to determine subnet and netmask.");
    }
  } catch (error) {
    console.error("Error fetching network interfaces:", error);
    throw error;
  }
};

// Function to update DHCP configuration file
const updateDHCPConfig = async (dhcpConfig) => {
  try {
    const DHCP_CONFIG_FILE = "/etc/dhcp/dhcpd.conf";
    let dhcpFileContent = fs.readFileSync(DHCP_CONFIG_FILE, "utf8");
    let { subnet, netmask } = await getCurrentData();
    subnet = "192.168.8.1";
    netmask = "";
    console.log(`Current Subnet: ${subnet}`);
    console.log(`Current Netmask: ${netmask}`);
    
    let subnetConfigRegex = new RegExp(`subnet ${subnet} netmask ${netmask}\\s*{([^}]*)}`, 'gm');
    
    
    
    fs.writeFileSync(DHCP_CONFIG_FILE, updatedConfig, "utf8");
    await restartDHCPService();
    console.log("DHCP configuration file updated successfully.");
    return true;
  } catch (error) {
    console.error("Error updating DHCP configuration file:", error);
    return false;
  }
};

function restartDHCPService() {
  exec(
    "sudo syatemctl restart  isc-dhcp-serverc.service",
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error restarting DHCP service: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`DHCP service restart error: ${stderr}`);
        return;
      }
      console.log("DHCP service restarted successfully");
    }
  );
}

server.addMethod(
  "sendFile",
  ({ sourcePath, destinationPath, destinationIP, destinationUser }) => {
    return new Promise((resolve, reject) => {
      const command = `scp ${sourcePath} ${destinationUser}@${destinationIP}:${destinationPath}`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing scp command: ${stderr}`);
          reject(new Error("Failed to send file"));
        } else {
          console.log("File sent successfully");
          resolve("File sent successfully");
        }
      });
    });
  }
);

for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === "IPv4" && !net.internal) {
      IpAddress = net.address;
      break;
    }
  }
  if (IpAddress) {
    break;
  }
}

const port = 3021;
app.listen(port, IpAddress, () => {
  console.log(`RPC Server is running on http://${IpAddress}:${port}/rpc`);
});
