const express = require("express");
const bodyParser = require("body-parser");
const { JSONRPCServer } = require("json-rpc-2.0");
const { exec } = require("child_process");
const { networkInterfaces } = require("os");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const os = require("os");
const osUtils = require('os-utils');
const diskusage = require('diskusage');
const util = require('util');
const exec1 = util.promisify(require('child_process').exec);

const nets = networkInterfaces();
let IpAddress = "localhost";
const app = express();
const server = new JSONRPCServer();
app.use(bodyParser.json());
app.use(cors());
const DHCP_CONFIG_FILE = "/etc/dhcp/dhcpd.conf";

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getRamUsage() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsage = osUtils.freememPercentage();
  return {
    totalMem: formatBytes(totalMem),
    freeMem: formatBytes(freeMem),
    usedMem: formatBytes(usedMem),
    memUsage: `${(1 - memUsage) * 100}%`
  };
}
function getCpuUsage() {
  return new Promise((resolve, reject) => {
    const cpuCount = os.cpus().length;
    let totalUsage = 0;
    for (const cpu of os.cpus()) {
      const usage = 1 - (cpu.times.idle / (cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq));
      totalUsage += usage;
    }
    const averageUsage = totalUsage / cpuCount;
    const cpuUsagePercent = (averageUsage * 100).toFixed(2);

    resolve(`${cpuUsagePercent}%`);
  });
}

function getTotalCpu() {
  return new Promise((resolve, reject) => {
    const os = require('os');
    const cpus = os.cpus();
    let prevCpuTimes = [];
    for (let cpu of cpus) {
      prevCpuTimes.push({ idle: cpu.times.idle, total: cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq });
    }
    setTimeout(() => {
      const cpus = os.cpus();
      let totalCpuPercent = 0;
      for (let i = 0; i < cpus.length; i++) {
        const cpu = cpus[i];
        const prevCpu = prevCpuTimes[i];
        const idleDiff = cpu.times.idle - prevCpu.idle;
        const totalDiff = (cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq) - prevCpu.total;
        const cpuUsage = 100 - ((idleDiff / totalDiff) * 100);
        totalCpuPercent += cpuUsage;
        prevCpuTimes[i] = { idle: cpu.times.idle, total: cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq };
      }
      totalCpuPercent = totalCpuPercent / cpus.length;
      resolve(`${totalCpuPercent.toFixed(2)}%`);
    }, 1000);
  });
}

function getDiskUsage() {
  return new Promise((resolve, reject) => {
    diskusage.check('/', function(err, info) {
      if (err) {
        reject(err);
      } else {
        resolve({
          totalDisk: formatBytes(info.total),
          freeDisk: formatBytes(info.available),
          usedDisk: formatBytes(info.total - info.available),
          diskUsage: `${((info.total - info.available) / info.total) * 100}%`
        });
      }
    });
  });
}

async function getSystemHealth() {
  try {
    const ramUsage = getRamUsage(); 
    const cpuUsage = await getCpuUsage(); 
    const diskUsage = await getDiskUsage(); 
    const totalCpu = await getTotalCpu();
    const data = { ramUsage, cpuUsage,totalCpu, diskUsage };
    return data;
  } catch (error) {
    console.error('Error fetching system metrics:', error);
    throw error; 
  }
}

app.get("/systemHealth", async (req, res) => {
  try {
    const data = await getSystemHealth();
    if (data) {
      res.json({
        status: 0,
        message: "System health data retrieved successfully",
        data: data
      });
    } else {
      res.status(500).json({ error: "Failed to retrieve system health data" });
    }
  } catch (error) {
    console.error("Error retrieving system health data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

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

async function runCommands() {
  try {
    const changeDirCommand = 'cd && ls';
    const { stdout: cdOutput, stderr: cdError } = await exec1(changeDirCommand);
    if (cdError) {
      console.error('Error changing directory:', cdError);
      return -1;
    }
    console.log('Directory contents:', cdOutput);
    const ansibleCommand = 'cd && ansible-playbook copy.yaml';
    const { stdout: ansibleOutput, stderr: ansibleError } = await exec1(ansibleCommand);

    if (ansibleError) {
      console.error('Error running Ansible playbook:', ansibleError);
      return -1;
    }
    console.log('Ansible playbook output:', ansibleOutput);

    return 1;

  } catch (error) {
    console.error('Error:', error);
    return 0;
  }
}

// Configure linux machine throw ansible.
app.post("/linuxConfig", async (req, res) => {
  try {
    const devices = req.body;
    if (!devices) {
      return res.status(400).json({ error: "Ip-address missing" });
    }
    const success = await runCommands()
    .then(result => {
      if (result === 1) {
        console.log('Commands executed successfully.');
        return result;
      } else {
        console.log('Command execution failed.');
        return result;
      }
    })
    .catch(err => {
      console.error('Error in executing commands:', err);
      return result;
    });
    if (success == 1) {
      res.json({
          status: 0,
          message: 'Linux configuration updated successfully'
      });
  } else {
      res.status(500).json({ status: -1,error: 'Failed to update Linux configuration' });
  }
} catch (error) {
  console.error('Error processing Linux configuration:', error);
  res.status(500).json({ error: 'Internal server error' });
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

const port = 4050;
app.listen(port, IpAddress, () => {
  console.log(`RPC Server is running on http://${IpAddress}:${port}/rpc`);
});
