


// Function to get CPU usage


// Function to get disk usage


// Example usage
async function getSystemHealth() {
  try {
    const ramUsage = getRamUsage();
    const cpuUsage = await getCpuUsage();
    const diskUsage = await getDiskUsage();

    const data = {ramUsage,cpuUsage,diskUsage};
    return data;

  } catch (error) {
    console.error('Error fetching system metrics:', error);
  }
}

// Call the function to get system health metrics
const data1 = getSystemHealth();
console.log(data1);
